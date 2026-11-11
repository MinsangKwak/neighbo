# 07 · 채팅 목록

[문서 목차](../README.md) · 앞: [06 · 거래 삭제](06-product-delete.md) · 다음: [08 · 채팅](08-chat.md) · 설계: [흐름](../architecture/flow.md) · [프론트엔드](../architecture/frontend.md) · [백엔드](../architecture/backend.md)

**채팅 목록은 참여 중인 방을 마지막 메시지 시각의 역순으로 보여줍니다.** 각 행에는 상대 정보, 상품 썸네일, 마지막 메시지, 시각, 읽지 않은 메시지 수를 표시합니다. 새 메시지와 읽음 상태에 따른 갱신은 알림 명세와 연결됩니다.

## 요구사항

**유저 스토리** — 사용자로서, 내가 나눈 대화를 최근 순으로 보고 안 읽은 게 있는 방을 바로 알아보고 싶다.

**권한** — 로그인.

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CL-01 | `/chats`는 내가 참여한 방 30개를 최근 활동순(`lastActivityAt DESC` — 메시지가 없으면 방 생성 시각)으로 서버 렌더하고 [더 보기]로 이어진다 | 서버에서 첫 30개 → 하이드레이트 [F01](../architecture/frontend.md#01--렌더링-전략) | `ChatRoomMember(userId, lastActivityAt)` 인덱스 [B02](../architecture/backend.md#02--데이터-모델) | CL-OK-01, 02 |
| AC-CL-02 | 행은 상대 아바타 · 상대 닉네임 · "판매"/"구매" 라벨 · 마지막 메시지 1줄 · 시각 · 읽지 않은 수 배지 · 상품 썸네일로 구성된다 | 행 컴포넌트 | `partner` · `myRole` 계산 | CL-OK-03, 05 |
| AC-CL-03 | 메시지가 없는 방은 "대화를 시작해 보세요"를 회색으로 보여준다 | 빈 미리보기 문구 | `lastMessage: null` | CL-OK-07 |
| AC-CL-04 | 배지는 1~99, `99+`, 0이면 숨김이며 `aria-label="읽지 않은 메시지 N개"`다 | 배지 표시 · `aria-label` | 방별 `unreadCount` 계산 [B02](../architecture/backend.md#02--데이터-모델) | CL-OK-08, CL-A11Y-01 |
| AC-CL-05 | 목록을 보는 중 새 메시지가 오면 해당 행이 맨 위로 이동하고 미리보기 · 시각 · 배지가 바뀌며, 100ms 안의 연속 이벤트는 한 번에 처리한다 | `message:new` → 행 이동 · 100ms 디바운스 [F03](../architecture/frontend.md#03--캐시와-낙관적-갱신) | `message:new` 전달 [B09](../architecture/backend.md#09--소켓-서버) | CL-OK-09, CL-CC-04 |
| AC-CL-06 | 다른 방에서 읽고 돌아오면 해당 행 배지가 0이다 | 읽음 시 행 배지 0 (캐시 갱신) [F03](../architecture/frontend.md#03--캐시와-낙관적-갱신) | T8 [B03](../architecture/backend.md#03--트랜잭션-경계) | CL-OK-10 |
| AC-CL-07 | `?productId=`로 특정 상품의 방만 필터하고 상단에 상품 요약과 [전체 보기]가 있다 | URL `productId` → 쿼리 키 [F02](../architecture/frontend.md#02--상태-소유권) | `productId` 필터 | CL-OK-11 |
| AC-CL-08 | 상품이 예약중 · 거래완료 · 삭제됨이면 썸네일 위에 각각의 배지 · 라벨이 붙고 행은 유지된다 | 상태 배지 · 라벨 | `product.status · deletedAt` 포함 | CL-ST-01~03 |
| AC-CL-09 | 방 0개면 "아직 채팅이 없어요…"와 [물건 보러 가기]를 보여준다 | 빈 상태 컴포넌트 | — | CL-DT-01 |
| AC-CL-10 | [더 보기] 중 재정렬로 이미 받은 행이 다시 오면 `roomId` 기준으로 중복 제거한다 | `roomId`로 중복 제거 [F03](../architecture/frontend.md#03--캐시와-낙관적-갱신) | — | CL-CC-03 |
| AC-CL-11 | 소켓 재연결 시 목록을 전체 재조회한다 | 재연결 시 무효화 [F07](../architecture/frontend.md#07--소켓-클라이언트) | — | CL-CC-01 |
| AC-CL-12 | 시각은 오늘 "오후 3:24", 어제 "어제", 7일 미만 "N일 전", 그 이상 "M월 D일"이다 | 채팅용 시각 함수 | ISO 시각 응답 | CL-UI-05 |
| AC-CL-13 | 행 이동 시 포커스가 그 행에 있었으면 유지된다 | 행 `key` = 방 id [F06](../architecture/frontend.md#06--포커스와-라이브-리전) | — | CL-A11Y-02 |
| AC-CL-14 | 목록 API는 `items[{ id, product{…, deletedAt}, partner, lastMessage, unreadCount, myRole }]`를 돌려주고 `ChatRoom.lastMessageAt · lastMessagePreview · lastMessageSenderId` 비정규화 컬럼을 쓴다 | 응답 타입 | 응답 조립 · 비정규화 컬럼 [B02](../architecture/backend.md#02--데이터-모델) | CL-DT-20~22 |
| AC-CL-15 | 다른 탭에서 방을 읽으면 `user:{id}` 룸의 `room:read`로 이 탭의 해당 행 배지가 즉시 0이 된다 | `room:read`(내 세션) → 행 배지 0 [F03](../architecture/frontend.md#03--캐시와-낙관적-갱신) | `user:{id}` 룸으로 전달 [B09](../architecture/backend.md#09--소켓-서버) | CL-CC-02 |
| AC-CL-16 | 메시지가 없는 새 방은 목록에 즉시 나타나지 않고 첫 메시지와 함께 나타난다 | — | 빈 방은 `lastMessageAt` null, `room:created` 없음 | CL-CC-05 |

범위 밖: 방 나가기 · 숨기기 · 고정 · 알림 끄기, 안 읽은 방 필터, 2단 레이아웃 [CL-ST-06, CL-DT-25, 26, CL-UI-02].

---

## 경우의 수

**채팅 목록은 참여 중인 방을 마지막 메시지 시각의 역순으로 보여줍니다.** 각 행에는 상대 정보, 상품 썸네일, 마지막 메시지, 시각, 읽지 않은 메시지 수를 표시합니다. 새 메시지와 읽음 상태에 따른 갱신은 알림 명세와 연결됩니다.

### 정상

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CL-OK-01 | 하단 탭 [채팅] 진입 `/chats` | 로그인 필요 (→ CM-AU-01). 첫 30개 SSR, 이후 [더 보기] (→ PL-OK-04와 같은 방식) | — |
| CL-OK-02 | 정렬 | 최근 활동순 — `ChatRoomMember.lastActivityAt DESC`(방 생성 시 생성 시각, 메시지마다 갱신). `COALESCE(lastMessageAt, createdAt)` 정렬은 인덱스를 못 타서 컬럼으로 둠 → [백엔드 02](../architecture/backend.md#02--데이터-모델) | — |
| CL-OK-03 | 행 구성 | 좌: 상대 아바타(40px) · 중: 상대 닉네임 + 마지막 메시지 1줄 말줄임 · 우: 상대시간 + 배지 · 맨 우: 상품 썸네일(48px) | — |
| CL-OK-04 | 행 클릭 | `/chats/{roomId}` | — |
| CL-OK-05 | 판매자 · 구매자 구분 | 행에 "판매" · "구매" 작은 라벨 (내가 이 방에서 어느 쪽인지) | — |
| CL-OK-06 | 마지막 메시지 미리보기 | 텍스트 그대로 1줄. 줄바꿈은 공백으로. 내가 보낸 메시지면 접두어 없이 (카카오톡 방식) | — |
| CL-OK-07 | 메시지가 없는 방 | 미리보기 "대화를 시작해 보세요" 회색 | — |
| CL-OK-08 | 읽지 않은 수 배지 | 1~99 숫자, 100 이상 `99+`, 0이면 숨김. 배지 색은 브랜드 색 | — |
| CL-OK-09 | 새 메시지 도착 (목록 화면 열려 있음) | 소켓 이벤트로 해당 행을 맨 위로 이동 + 미리보기 · 시각 · 배지 갱신. 애니메이션 없음(`reduced-motion` 무관하게 단순 재정렬) | — |
| CL-OK-10 | 내가 다른 방에서 읽음 → 목록 복귀 | 해당 행 배지 0 | — |
| CL-OK-11 | 상품별 필터 | 상세의 [대화 중인 채팅 N]에서 진입 시 `?productId=` → 그 상품 방만 + 상단에 상품 요약 + [전체 보기] | — |
| CL-OK-12 | 당겨서 새로고침 | → PL-CC-02 | — |

### 상태별 행 표시

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CL-ST-01 | 상품 예약중 | 썸네일 위 "예약중" 작은 배지 | — |
| CL-ST-02 | 상품 거래완료 | 썸네일 위 "거래완료" 배지. 행은 유지 | — |
| CL-ST-03 | 상품 삭제됨 | 썸네일 회색 + "삭제됨". 행 유지 (→ PX-ST-05) | — |
| CL-ST-04 | 상대가 탈퇴 | 1차 범위 밖. "(알 수 없음)" | ⛔ |
| CL-ST-05 | 상대가 나를 차단 | 차단 없음 | ⛔ |
| CL-ST-06 | 내가 나간 방 | 나가기 기능 없음 (1차). 방은 영구 | — |
| CL-ST-07 | 상대가 거래완료 구매자로 나를 지정 | 행에 표시 없음. 채팅방 안 상품 요약에서만 | — |

### 빈 상태 · 경계

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CL-DT-01 | 방 0개 | "아직 채팅이 없어요. 마음에 드는 물건에 채팅을 걸어 보세요" + [물건 보러 가기] | — |
| CL-DT-02 | 방 1개 | 정상 표시, [더 보기] 없음 | — |
| CL-DT-03 | 방 30개 정확히 | → PL-DT-02와 같은 `limit+1` 판단 | — |
| CL-DT-04 | 방 500개 | 커서 `(lastMessageAt, id)`. `ChatRoom`에 `lastMessageAt` 비정규화 컬럼 + 인덱스 `(buyerId, lastMessageAt)` · `(sellerId, lastMessageAt)` | — |
| CL-DT-05 | 마지막 메시지 500자 | 1줄 말줄임 | — |
| CL-DT-06 | 마지막 메시지가 공백 · 줄바꿈만 | 전송 단계에서 막힘 (CH 문서). 생길 수 없음 | — |
| CL-DT-07 | 닉네임 12자 + 긴 미리보기 (360px) | 닉네임 고정 폭 말줄임, 미리보기 나머지 | — |
| CL-DT-08 | 같은 상대와 상품 3개로 방 3개 | 3행. 방은 `(product, buyer)` 단위 | — |
| CL-DT-09 | 같은 상품에 구매자 20명 (판매자 시점) | 20행 | — |
| CL-DT-10 | 읽지 않은 수 합계 (탭 배지) | NT 문서. 목록 화면 자체엔 합계 표시 없음 | — |
| CL-DT-11 | 상대 아바타 없음 | 기본 아바타 (이니셜 아님 — 한글 이니셜은 어색) | — |
| CL-DT-12 | 상품 썸네일 없음 | 플레이스홀더 | — |

### 동시성 · 실시간

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CL-CC-01 | 목록 열어 둔 채 소켓 끊김 → 재연결 | 재연결 시 목록 전체 재조회 (`refetch`). 끊긴 동안 온 메시지 반영 | — |
| CL-CC-02 | 목록 열어 둔 채 다른 탭에서 메시지 읽음 | 소켓 `room:read`(내 다른 세션에서, `user:{id}` 룸) → 해당 행 배지 0. 포커스 복귀 재조회는 보조 → [WebSocket 기술 노트](../tech-notes.md#websocket과-socketio) | — |
| CL-CC-03 | [더 보기] 도중 새 메시지로 순서 변경 | 커서 기반이라 이미 불러온 행이 다시 올 수 있음 → 클라이언트에서 `roomId` 기준 중복 제거 | — |
| CL-CC-04 | 메시지 10개가 1초 안에 도착 | 이벤트마다 재정렬하지 않고 100ms 디바운스 후 한 번 | — |
| CL-CC-05 | 새 방이 생성됨 (상대가 내 상품에 [채팅하기]) | 메시지가 없는 방은 목록에 즉시 뜨지 않는다. 첫 메시지가 오면 CL-OK-09로 등장. 빈 방은 판매자가 할 행동이 없으므로 `room:created` 이벤트를 두지 않음 | — |
| CL-CC-06 | 내가 보고 있는 행의 상품이 삭제됨 | 다음 재조회에서 CL-ST-03 | — |

### 네트워크

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CL-NW-01 | 첫 로드 실패 | → CM-NW-01 | — |
| CL-NW-02 | [더 보기] 실패 | → PL-NW-02 | — |
| CL-NW-03 | 소켓 연결 실패 (HTTP는 됨) | 목록은 HTTP로 정상. 상단에 얇은 바 "실시간 연결이 끊겼어요. 다시 연결 중…" (NT 문서) | — |
| CL-NW-04 | 아바타 · 썸네일 로드 실패 | 플레이스홀더 | — |

### 접근성 · 화면

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CL-A11Y-01 | 행의 접근 가능한 이름 | "{상대 닉네임}, {상품 제목}, {마지막 메시지}, {시각}, 읽지 않은 메시지 N개". 배지는 `aria-label="읽지 않은 메시지 3개"` | — |
| CL-A11Y-02 | 새 메시지로 행이 위로 이동 | 포커스가 그 행에 있었으면 유지(DOM 이동 시 포커스 잃지 않게 key 안정). `aria-live` 알림은 NT 문서의 전역 알림에 맡김 | — |
| CL-A11Y-03 | 목록 구조 | `<ul>` + 각 행 `<a>` | — |
| CL-A11Y-04 | 상태 배지 (예약중 등) | 텍스트 포함 | — |
| CL-UI-01 | 360px | 행 높이 72px. 썸네일 48px | — |
| CL-UI-02 | 1024px | 폭 640px 단일 열. 2단 레이아웃 없음 → [결정 0014](../decisions.md#0014--pc-화면도-640px-단일-열로-간다) | — |
| CL-UI-03 | 스켈레톤 | 행 모양 6개 | — |
| CL-UI-04 | 탭바 [채팅] 배지 | NT 문서 | — |
| CL-UI-05 | 시각 표시 | 오늘이면 "오후 3:24", 어제면 "어제", 7일 미만 "N일 전", 그 이상 "M월 D일" (CM-DT-01의 채팅 변형 — 목록 · 채팅방 공통) | — |

### 데이터

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CL-DT-20 | 목록 API | `GET /chat-rooms?cursor=&limit=30&productId=` → `items: [{ id, product: {id, title, thumbnailUrl, status, deletedAt}, partner: 공개용 user, lastMessage: {content, createdAt, senderId} \| null, unreadCount, myRole: "seller"\|"buyer" }]` | — |
| CL-DT-21 | `unreadCount` 계산 | `ChatRoom.lastSeq − 내 lastReadSeq`. 뜻은 `COUNT(Message WHERE roomId AND senderId != me AND seq > myLastReadSeq)`와 같다 — 내 메시지는 저장할 때 내 `lastReadSeq`를 그 번호로 올리므로 그 뒤 번호는 전부 상대 메시지이고, 번호에는 빈틈이 없다. Message를 세지 않아 목록 쿼리가 하나로 끝난다. `ChatRoomMember.lastReadSeq` 방식 → [결정 0007](../decisions.md#0007--읽음은-방-단위-위치-하나로-센다) · [0016](../decisions.md#0016--방-안-순서와-읽음-위치는-시각이-아니라-방별-번호seq로-센다) | — |
| CL-DT-22 | 비정규화 컬럼 | `ChatRoom.lastMessageAt · lastMessagePreview · lastMessageSenderId`. 메시지 저장 트랜잭션에서 갱신 | — |
| CL-DT-23 | 상대(partner) 결정 | `myRole === "seller" ? buyer : seller` | — |
| CL-DT-24 | 삭제된 상품 포함 조회 | `withDeleted()` 명시 (→ PX-DT-04) | — |
| CL-DT-25 | 방 나가기 · 숨기기 · 고정 · 알림 끄기 | 없음 | ⛔ |
| CL-DT-26 | 안 읽은 방만 필터 | 없음 | ⛔ |
