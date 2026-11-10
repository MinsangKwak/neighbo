# 백엔드 03 · 트랜잭션 경계

[백엔드 설계](README.md) · 앞: [02 데이터 모델](02-data-model.md) · 다음: [04 권한 매트릭스](04-authorization.md)

**함께 성공하거나 실패해야 하는 DB 쓰기를 트랜잭션으로 묶고, 파일 삭제와 소켓 발행은 커밋 후 처리하도록 설계했습니다.** 중복 생성은 유니크 제약으로, 상태 변경은 조건부 UPDATE로, 메시지 순서는 방별 행 잠금으로 관리합니다. 아래 표는 작업별 경계와 실패 시 남는 상태를 정리한 것입니다.

## 원칙

| 원칙 | 이유 |
| --- | --- |
| 격리 수준은 Postgres 기본 `READ COMMITTED` | `SERIALIZABLE`은 충돌 시 재시도 루프가 필요하고, 이 서비스의 경합은 전부 "같은 행 · 같은 키"라 제약과 조건부 갱신으로 충분히 막힌다 |
| 검사 후 갱신(check-then-act) 대신 **조건부 갱신** | `SELECT status` → 판단 → `UPDATE`는 그 사이에 다른 요청이 끼어들 수 있다. `UPDATE ... WHERE status IN (...)` 한 문장이면 DB가 원자적으로 판단하고, 갱신된 행 수로 성공 여부를 안다 |
| 중복은 **유니크 제약**이 최종 판단 | "있는지 먼저 확인"은 동시 요청 둘이 모두 "없음"을 볼 수 있다 ([스파이크 계획](../tech/README.md) `postgres-constraints.md` ①) |
| 파일은 DB **커밋 후** 삭제 | 트랜잭션이 롤백되면 DB는 되돌아가지만 지운 파일은 안 돌아온다. 커밋 후 삭제가 실패하면 파일만 고아로 남고 배치가 치운다 — 반대(파일 없는 DB 행)보다 안전 |
| 소켓 emit은 **커밋 후** | 커밋 전에 보내면 롤백된 메시지를 상대가 본다. 커밋 후 emit이 실패해도 메시지는 DB에 있어 재연결 복구로 전달된다 ([websocket.md ③](../tech/websocket.md)) |
| 트랜잭션 안에서 외부 호출 금지 | 이미지 처리 · 해시 · 네트워크 호출은 트랜잭션 밖에서 미리. 트랜잭션은 짧게 |

## 쓰기 작업별 경계

| # | 작업 | 트랜잭션 안에서 (순서대로) | 커밋 후 | 경합 처리 | 중간 실패 시 남는 것 |
| --- | --- | --- | --- | --- | --- |
| T1 | 회원가입 | (단일 INSERT) | 쿠키 발급 | 이메일 · 닉네임 유니크 → `409` | 없음 |
| T2 | 상품 등록 | ① 멱등키로 기존 상품 조회 → 있으면 반환 ② `Upload` 행들이 본인 것 · 존재하는지 `FOR UPDATE`로 잠금 확인 ③ `Product` INSERT ④ `ProductImage` INSERT (업로드의 `storageKey` 재사용) ⑤ `Upload` DELETE | — | `(sellerId, idempotencyKey)` 유니크 위반 → 기존 상품 조회해 `200` | 없음. 파일은 업로드 때 이미 저장돼 있고 키만 옮김 |
| T3 | 상품 수정 | ① `UPDATE Product ... WHERE id AND sellerId AND deletedAt IS NULL` → 0행이면 `404` ② 빠진 사진의 `ProductImage` DELETE (키 목록 기억) ③ 새 업로드 → `ProductImage` INSERT, `Upload` DELETE ④ 남은 사진 `order` 재부여 | 빠진 사진 파일 삭제 | 마지막 저장이 이김 (낙관적 잠금 없음, 결정 0013) | 커밋 후 파일 삭제 실패 → 고아 파일. 30일 배치가 `ProductImage`에 없는 키를 정리 |
| T4 | 상태 변경 | ① 거래완료면 `buyerId`가 이 상품 방의 구매자인지 확인 ② `UPDATE Product SET status, buyerId, soldAt, soldPrice=price WHERE id AND sellerId AND deletedAt IS NULL AND status IN (허용된 이전 상태)` | 상품의 모든 방에 `room:product_updated` | 갱신 0행 → 다시 읽어서 원인 구분: 없음 · 삭제 → `404`, 남의 것 → `403`, 상태 → `409 INVALID_TRANSITION`, 같은 상태 → `200` | 없음 (단일 UPDATE) |
| T5 | 상품 삭제 | `UPDATE Product SET deletedAt=now() WHERE id AND sellerId AND deletedAt IS NULL` | 상품의 모든 방에 `room:product_updated { deletedAt }` | 0행 → 원인 구분 `404` / `403` | 없음 |
| T6 | 채팅방 만들기 | ① `SELECT Product ... FOR SHARE` — 삭제 · 거래완료 · 본인 상품 확인 ② `ChatRoom` INSERT ③ `ChatRoomMember` 두 행 INSERT | — | `(productId, buyerId)` 유니크 위반 → 트랜잭션 버리고 기존 방 조회 `200` | 없음 |
| T7 | 메시지 저장 | ① 참여자 확인 ② `SELECT Product ... FOR SHARE` — 삭제 확인 ③ `SELECT ChatRoom ... FOR UPDATE` — 같은 방 저장을 한 줄로 ④ `(roomId, senderId, tempId)` 있으면 그 메시지를 돌려주고 끝 ⑤ `UPDATE ChatRoom SET lastSeq = lastSeq + 1, 마지막 메시지 필드 RETURNING lastSeq` ⑥ `Message` INSERT(`seq`) ⑦ 두 참여자 `lastActivityAt` 갱신 ⑧ 보낸 사람 `lastReadSeq = seq` | `message:new` → 방, `notification:unread` → 받는 사람 ④에서 걸러지고, 그래도 유니크 위반이 나면 기존 메시지를 ack로 반환 (재시도) | 없음. 롤백되면 `lastSeq`도 함께 되돌아가 번호에 구멍이 생기지 않음. emit 실패는 재연결 복구가 메움 |
| T8 | 읽음 | `UPDATE ChatRoomMember m SET lastReadSeq = GREATEST(m.lastReadSeq, LEAST($seq, r.lastSeq)) FROM ChatRoom r WHERE r.id = m.roomId AND …` — 클라이언트가 **그린** 번호 | 내 모든 세션에 `room:read`, `notification:unread` | 순서가 뒤바뀐 요청이 와도 **뒤로 가지 않음** (`GREATEST`), 없는 번호를 앞질러 찍지 않음 (`LEAST`) | 없음 |
| T9 | 비밀번호 변경 | (트랜잭션 밖: 현재 비밀번호 bcrypt 비교, 새 해시 생성) `UPDATE User SET passwordHash, tokenVersion = tokenVersion + 1` | 새 쿠키 발급 | — | 없음 |
| T10 | 아바타 변경 | `UPDATE User SET avatarUrl` + `Upload` DELETE | 이전 아바타 파일 삭제 | 마지막이 이김 | 이전 파일 고아 → 배치 |
| T11 | 닉네임 변경 | `UPDATE User SET nickname, nicknameLower` | — | `nicknameLower` 유니크 → `409` | 없음 |

### 왜 T6 · T7에서 상품 행을 `FOR SHARE`로 읽나

삭제(T5)는 `UPDATE`라 행 잠금을 잡는다. T6 · T7이 상품을 `FOR SHARE`로 읽으면, 동시에 진행 중인 삭제가 있을 때 그 삭제가 끝날 때까지 기다렸다가 **삭제된 결과**를 본다. 잠금 없이 읽으면 "삭제 직전 값"을 보고 방을 만들거나 메시지를 저장할 수 있다 [AC-PX-11, PX-CC-02, 03]. `FOR UPDATE`가 아니라 `FOR SHARE`인 이유: 같은 상품에 메시지 저장이 여러 개 동시에 와도 서로는 막지 않아야 한다.

### 왜 T7은 시각이 아니라 방 번호로 순서를 정하나

`now()` · `@default(now())`는 **트랜잭션 시작 시각**이다. 먼저 시작했지만 상품 `FOR SHARE`에서 기다리느라 늦게 커밋한 메시지는, 먼저 커밋된 메시지보다 시각이 앞선다. 클라이언트가 늦게 커밋된 쪽보다 먼저 커밋된 쪽을 먼저 받고 그 시각으로 `after` 복구를 하면, 늦게 커밋된 메시지는 영영 빠진다. ③의 방 행 잠금 + ⑤의 번호 증가는 "같은 방에서는 번호 순서 = 커밋 순서"를 보장한다 → [결정 0016](../decisions/0016-message-seq.md).

### 왜 T4는 갱신 0행일 때 다시 읽나

조건부 UPDATE는 "실패했다"만 알려 주고 "왜"는 알려 주지 않는다. 사용자에게는 이유가 다르면 다른 반응이 필요하므로(`404`는 홈으로, `409`는 화면 재조회 — [06 에러 코드](06-errors.md)), 실패했을 때만 한 번 더 읽어 원인을 구분한다. 성공 경로는 쿼리 하나다.

## Prisma로 옮길 때

| 필요한 것 | 방법 |
| --- | --- |
| 여러 문장 원자성 | `prisma.$transaction(async (tx) => { ... })` (대화형 트랜잭션), 타임아웃 5초 |
| `FOR SHARE` · `FOR UPDATE` | Prisma 쿼리 API에 없음 → 트랜잭션 안에서 `tx.$queryRaw` |
| `GREATEST` · `LEAST` 조건부 갱신, `UPDATE ... RETURNING` | `tx.$executeRaw` · `tx.$queryRaw` |
| 유니크 위반 판별 | `PrismaClientKnownRequestError` 코드 `P2002` + `meta.target`으로 어느 제약인지 확인 |
| 갱신된 행 수 | `updateMany`의 `count` (`update`는 0행이면 예외라 조건부 갱신에 쓰지 않음) |

원시 SQL을 쓰는 곳은 이 표의 세 경우로 한정하고, 저장소 계층 함수 안에만 둔다.

## 버린 대안

| 대안 | 버린 이유 |
| --- | --- |
| 전부 `SERIALIZABLE` | 직렬화 실패 시 재시도 코드가 모든 쓰기에 필요. 대상 경합은 제약으로 처리 |
| 낙관적 잠금(`version` 컬럼)으로 상품 수정 충돌 감지 | 동시 수정은 판매자 혼자 두 탭을 연 경우뿐 [결정 0013] |
| 아웃박스 테이블로 emit 보장 | 메시지는 DB에 있고 클라이언트가 재연결 시 `after`로 가져가므로, emit 유실이 데이터 유실이 아니다 |
| 파일 삭제를 트랜잭션 안에서 | 롤백 시 복구 불가 |
