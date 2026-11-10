# 08 · 채팅

[문서 목차](../README.md) · 앞: [07 · 채팅 목록](07-chat-list.md) · 다음: [09 · 마이페이지](09-mypage.md) · 설계: [흐름](../architecture/flow.md) · [프론트엔드](../architecture/frontend.md) · [백엔드](../architecture/backend.md)

**채팅은 상품별 판매자·구매자 간 1:1 텍스트 대화입니다.** 실시간 전달에는 [Socket.IO](../decisions.md#0005--실시간-전달은-socketio-누락-복구는-db-커서로-처리한다), 이력 조회에는 HTTP를 사용하도록 정했습니다. 읽음 정책은 [결정 0007](../decisions.md#0007--읽음은-방-단위-위치-하나로-센다), 읽음·복구의 번호 단위는 [결정 0016](../decisions.md#0016--방-안-순서와-읽음-위치는-시각이-아니라-방별-번호seq로-센다)에 있습니다. 연결 동작은 [WebSocket 실험](../tech-notes.md#websocket과-socketio)에서 확인했습니다.

## 요구사항

**유저 스토리** — 구매자와 판매자로서, 물건 하나를 두고 실시간으로 문자를 주고받고, 끊겼다 돌아와도 놓친 메시지 없이 이어가고 싶다.

**권한** — 참여자만. 비참여자는 화면 404, 소켓 `FORBIDDEN`.

### 8.1 읽음 · 전송 · 복구 (핵심 정의)

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CH-01 | 읽음은 방 단위 `ChatRoomMember.lastReadSeq` 하나이며, 방 화면이 보이는 상태에서 **실제로 그린 마지막 메시지의 `seq`**로 갱신된다 — 입장 · 보이는 동안 수신 · 포그라운드 복귀 세 순간에 `room:read { roomId, seq }`(HTTP 폴백 `POST /chat-rooms/{id}/read`) | 세 순간에 그린 마지막 `seq`로 `room:read` · `visibilitychange` [F07](../architecture/frontend.md#07--소켓-클라이언트) | T8 `GREATEST(lastReadSeq, LEAST(seq, lastSeq))` [B03](../architecture/backend.md#03--트랜잭션-경계) | 핵심 정의, 결정 0007 · 0016 |
| AC-CH-02 | 내 마지막 메시지 아래에 상대 `lastReadSeq >= 그 메시지의 seq`이면 "읽음"이 한 번 표시된다 | 상대 `lastReadSeq`와 비교해 "읽음" [F03](../architecture/frontend.md#03--캐시와-낙관적-갱신) | `room:read` 전달 · 방 상세에 상대 `lastReadSeq` [B09](../architecture/backend.md#09--소켓-서버) | 핵심 정의, CH-CC-12 |
| AC-CH-03 | 전송은 `tempId`를 만들어 즉시 "전송 중" 말풍선을 그리고 `message:send`를 emit하며, ack `{ ok, message }`로 확정한다 | `tempId` · 대기열 · `emitWithAck` [F07](../architecture/frontend.md#07--소켓-클라이언트) | T7 · ack [B03](../architecture/backend.md#03--트랜잭션-경계) [B09](../architecture/backend.md#09--소켓-서버) | 핵심 정의 |
| AC-CH-04 | 5초 안에 ack가 없으면 "전송 실패 [재시도] [삭제]"가 되고, 재시도는 같은 `tempId`로 보내며 서버는 `(roomId, senderId, tempId)` 유니크로 중복 저장을 막는다 | 5초 실패 · 같은 `tempId` 재시도 · 말풍선 유지 [F07](../architecture/frontend.md#07--소켓-클라이언트) | `(roomId, senderId, tempId)` 유니크 → 기존 반환 [B05](../architecture/backend.md#05--멱등성) | 핵심 정의, CH-CC-02, 03 |
| AC-CH-05 | 재연결 시 `room:join { roomId, after: 마지막 seq }`로 누락분(최대 100개 + `hasMore`)을 받고, 넘치면 HTTP로 나머지를 가져온다. 연결 중이라도 `message:new`의 `seq`가 마지막 + 1이 아니면 같은 방법으로 틈을 채운다 | 재연결 · 틈 감지 시 `after`로 조인 · 합침 [F07](../architecture/frontend.md#07--소켓-클라이언트) | `seq > after` 101개 조회 · `hasMore` [B09](../architecture/backend.md#09--소켓-서버) | 핵심 정의, CH-CC-08, 결정 0016 |
| AC-CH-06 | 메시지 저장은 한 트랜잭션에서 참여자 검사 → 상품 삭제 검사 → 방 행 잠금 · `tempId` 중복 확인 → `lastSeq` +1 · 비정규화 갱신 → insert(`seq`) → 발신자 `lastReadSeq` 갱신 순으로 처리하고, 커밋 후 참여자에게 `message:new`, 수신자 전 세션에 `notification:unread`를 보낸다 | — | T7 순서 · 커밋 후 emit [B03](../architecture/backend.md#03--트랜잭션-경계) | CH-DT-12 |

### 8.2 화면 · 입력

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CH-10 | `/chats/{roomId}`는 헤더(← · 상대 닉네임) · 상품 요약 바 · 메시지 목록 · 입력창으로 구성되고, 최신 50개를 HTTP로 받은 뒤 맨 아래로 스크롤하고 `room:join` · `room:read`를 보낸다 | 서버에서 방 · 50개 → 마지막 `seq`를 `after`로 조인 [F01](../architecture/frontend.md#01--렌더링-전략) | 방 상세 · 메시지 API · 비참여자 404 [B04](../architecture/backend.md#04--권한-매트릭스) | CH-OK-01, 02 |
| AC-CH-11 | 상단에 도달하면 이전 50개를 `?before=`로 받아 스크롤 위치를 유지하며, [이전 메시지 보기] 버튼도 함께 있다 | 위 방향 무한 쿼리 · 스크롤 유지 · 버튼 병행 [F03](../architecture/frontend.md#03--캐시와-낙관적-갱신) | `before` 커서 · 역방향 인덱스 [B02](../architecture/backend.md#02--데이터-모델) | CH-OK-03, CH-A11Y-08 |
| AC-CH-12 | PC는 Enter 전송 · Shift+Enter 줄바꿈, 모바일은 Enter 줄바꿈 · 버튼 전송이며 IME 조합 중 Enter는 무시한다 | 포인터 종류 · `isComposing` 판별 [F05](../architecture/frontend.md#05--폼) | — | CH-OK-04, CH-IN-07 |
| AC-CH-13 | 빈 · 공백 · 줄바꿈만인 메시지는 보낼 수 없고, 1,000자를 넘으면 입력이 막히며 900자부터 카운터가 보인다 | 전송 비활성 · 카운터 | 스키마 + CHECK [B02](../architecture/backend.md#02--데이터-모델) | CH-IN-01, 02, 06 |
| AC-CH-14 | 상대 메시지 수신 시 스크롤이 맨 아래 100px 이내면 자동 스크롤, 아니면 [새 메시지 ↓] 버튼이 뜬다. 내 전송은 항상 맨 아래로 | 스크롤 위치 판단 · [새 메시지 ↓] [F07](../architecture/frontend.md#07--소켓-클라이언트) | — | CH-OK-08, 09 |
| AC-CH-15 | 같은 사람 · 같은 분의 연속 메시지는 마지막에만 시각을 보이고, 날짜가 바뀌면 `role="separator"` 구분선이 들어간다 | 연속 묶음 · 날짜 구분선 | ISO 시각 | CH-OK-07, CH-A11Y-07 |
| AC-CH-16 | 링크는 평문이고 이모지는 그대로 표시된다 | 평문 렌더 | 원문 저장 | CH-OK-13, 14 |
| AC-CH-17 | 상품 요약 바를 누르면 상세로 가며 삭제된 상품이면 클릭 불가다 | 삭제 시 링크 제거 | 방 상세에 `product.deletedAt` | CH-OK-10 |
| AC-CH-18 | 거래완료 · 예약중 상품의 방은 전송 가능하고 삭제된 상품의 방은 전송 불가다 | 삭제면 입력창 비활성 | `canSendMessage` [B04](../architecture/backend.md#04--권한-매트릭스) | CH-ST-01~03 |
| AC-CH-19 | 메시지 0개면 "{상대}님에게 첫 메시지를 보내 보세요"가 보인다 | 빈 상태 문구 | — | CH-UI-05 |
| AC-CH-20 | 채팅방 안에서는 하단 탭바를 숨기고 입력창이 `100dvh` 기준 하단에 고정된다 | `(tabs)` 밖 경로 · `100dvh` [F01](../architecture/frontend.md#01--렌더링-전략) | — | CH-UI-01, 07 |
| AC-CH-21 | 말풍선의 접근 가능한 이름은 "{보낸 사람}, {내용}, {시각}"이고 전송 실패는 `role="alert"`다 | 말풍선 이름 · 실패 `alert` [F06](../architecture/frontend.md#06--포커스와-라이브-리전) | — | CH-A11Y-02, 05 |
| AC-CH-22 | 뒤로가기는 채팅 목록으로, 히스토리가 없으면 `/chats`로 간다 | 히스토리 없으면 `/chats` | — | CH-OK-11 |

### 8.3 권한 · 보안 · 소켓

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CH-30 | 비참여자의 `room:join` · `message:send`는 `error: FORBIDDEN`이며 조인하지 않은 방에는 보낼 수 없다 | 방 화면이면 404 처리 | 참여자 · 조인 확인 `FORBIDDEN` [B09](../architecture/backend.md#09--소켓-서버) | CH-AU-02, 03, CH-SEC-01 |
| AC-CH-31 | 비로그인 소켓 연결은 핸드셰이크에서 거부되고, 이벤트 처리 시 토큰이 만료돼 있으면 `error: UNAUTHORIZED` 후 끊는다. 클라이언트는 끊긴 이유가 `io server disconnect`면 자동 재연결을 기다리지 않고 재로그인 화면으로 보내며, 로그인 후 직접 다시 연결한다 | `io server disconnect` → `needs_login` → 재로그인 후 수동 연결 [F07](../architecture/frontend.md#07--소켓-클라이언트) | 이벤트마다 `exp` 확인 → `UNAUTHORIZED` + 끊기 [B09](../architecture/backend.md#09--소켓-서버) | CH-AU-04, 05 |
| AC-CH-32 | 모든 수신 이벤트는 Zod로 검증하고 실패 시 `error: INVALID_PAYLOAD`로 연결은 유지한다. 페이로드 한도는 80KB다 (1,000자 메시지가 이모지로만 이뤄져도 통과하는 값) | — | Zod 검증 · `maxHttpBufferSize` 80KB [B09](../architecture/backend.md#09--소켓-서버) | CH-SEC-03, 04 |
| AC-CH-33 | 전송은 사용자당 토큰 버킷(용량 10, 초당 5개 충전)으로 제한하고, 넘으면 ack `{ ok: false, code: RATE_LIMITED, retryAfterMs }`다. 대기열 재전송은 200ms 간격으로 보내고, `RATE_LIMITED`를 받은 대기 메시지는 실패로 바꾸지 않고 `retryAfterMs` 뒤 다시 보낸다. 소켓 연결은 사용자당 5개까지다 | 재전송 간격 · 거절 시 대기 유지 · 직접 입력은 그동안 [전송] 비활성 + 이유 [F07](../architecture/frontend.md#07--소켓-클라이언트) | 토큰 버킷 · 연결 5개 [B07](../architecture/backend.md#07--보호-장치와-배치) | CH-SEC-02, 05, 트러블슈팅 T-03 |
| AC-CH-34 | 소켓 이벤트는 클라→서버 `room:join · room:leave · message:send · room:read`, 서버→클라 `message:new · room:read · room:product_updated · notification:unread · error`이며 ack 형식은 CH-DT-08을 따른다 | `useChatSocket` 훅이 이벤트 이름 · 타입 공유 | 이벤트 핸들러 [B09](../architecture/backend.md#09--소켓-서버) | CH-DT-06~08 |
| AC-CH-35 | WebSocket이 막힌 네트워크에서는 long-polling으로 폴백한다 | `transports` 기본 유지 | `["websocket", "polling"]` [B09](../architecture/backend.md#09--소켓-서버) | CH-NW-07 |
| AC-CH-36 | 서버 재시작 후 클라이언트가 자동 재연결해 누락분을 복구하며 서버 메모리에 조인 상태를 의존하지 않는다 | 자동 재연결 + 복구 절차 [F07](../architecture/frontend.md#07--소켓-클라이언트) | 메모리 상태 없음 · DB가 출처 [B09](../architecture/backend.md#09--소켓-서버) | CH-CC-13 |
| AC-CH-37 | `message:send`는 항상 5초 ack 타임아웃과 함께 보낸다. 타임아웃 없는 emit은 lint로 막는다 | `emitWithAck`만, `socket.emit` 직접 호출 lint 금지 [F07](../architecture/frontend.md#07--소켓-클라이언트) | ack를 반드시 응답 | websocket.md ⑤ |
| AC-CH-38 | 연결이 끊긴 상태에서 보낸 메시지는 앱 대기열에 "연결 중…"으로 남고, 재연결 시 같은 `tempId`로 순서대로 재전송되며, 30초가 지나면 "전송 실패"가 된다 | 대기열 `queued` · 재연결 시 순서대로 · 30초 실패 [F07](../architecture/frontend.md#07--소켓-클라이언트) | — | CH-CC-09 |
| AC-CH-39 | 연결이 5초 넘게 끊기면 상단에 "실시간 연결이 끊겼어요. 다시 연결 중…" 바가 `role="status"`로 뜨고, 별도 HTTP 폴링은 하지 않는다 | 5초 넘으면 끊김 바 `role="status"` [F07](../architecture/frontend.md#07--소켓-클라이언트) | — | CH-NW-03 |
| AC-CH-40 | 내 다른 탭에서 방을 읽으면 이 탭의 배지도 즉시 줄어든다 | `room:read`(내 세션) → 배지 [F03](../architecture/frontend.md#03--캐시와-낙관적-갱신) | `user:{id}` 룸 전달 [B09](../architecture/backend.md#09--소켓-서버) | CH-CC-05 |
| AC-CH-41 | 방을 보는 중 상품이 삭제 · 상태 변경 · 가격 수정되면 `room:product_updated`로 요약 바와 입력창 상태가 즉시 바뀐다 | 요약 바 · 입력창 즉시 갱신 [F07](../architecture/frontend.md#07--소켓-클라이언트) | 커밋 후 `Realtime.productUpdated` [B09](../architecture/backend.md#09--소켓-서버) | CH-ST-04, 05 |
| AC-CH-42 | 메시지 목록은 `role="log"`이되 `aria-live`를 끄고, 상대 메시지만 시각 숨김 `role="status"` 영역에 "{닉네임}: {내용}"으로 알린다 | `role="log"` + 상대 메시지 전용 리전 [F06](../architecture/frontend.md#06--포커스와-라이브-리전) | — | CH-A11Y-01 |
| AC-CH-43 | 하트비트는 `pingInterval 10s` · `pingTimeout 5s`이고, 재연결은 최대 간격 5초 · 지터 0.5다 | `reconnectionDelayMax` 5s · 지터 0.5 | `pingInterval` 10s · `pingTimeout` 5s [B09](../architecture/backend.md#09--소켓-서버) | CH-CC-15, websocket.md ② ③ |
| AC-CH-44 | 메시지는 DB 커밋 후에 emit한다. 복구는 DB `after` 커서 한 가지로 하고 Socket.IO `connectionStateRecovery`는 쓰지 않는다 | — | 커밋 후 emit · `connectionStateRecovery` 끔 [B09](../architecture/backend.md#09--소켓-서버) | websocket.md ③ ⑤ |

범위 밖: 타이핑 표시, 시스템 메시지, 메시지 삭제 · 수정 · 복사, 사진 · 파일, 약속 · 장소, 방 안 상태 변경, 금칙어 [핵심 정의, CH-OK-15~19, CH-IN-08].

---

## 경우의 수

**채팅은 상품별 판매자·구매자 간 1:1 텍스트 대화입니다.** 실시간 전달에는 [Socket.IO](../decisions.md#0005--실시간-전달은-socketio-누락-복구는-db-커서로-처리한다), 이력 조회에는 HTTP를 사용하도록 정했습니다. 읽음 정책은 [결정 0007](../decisions.md#0007--읽음은-방-단위-위치-하나로-센다), 읽음·복구의 번호 단위는 [결정 0016](../decisions.md#0016--방-안-순서와-읽음-위치는-시각이-아니라-방별-번호seq로-센다)에 있습니다. 연결 동작은 [WebSocket 실험](../tech-notes.md#websocket과-socketio)에서 확인했습니다.

### 핵심 정의 (제안)

| 항목 | 제안 | 결정 |
| --- | --- | --- |
| 읽음 | 방마다 `ChatRoomMember.lastReadSeq` 하나. "읽음" = **방 화면이 보이는 상태(탭 활성 + 문서 visible)에서 렌더된 마지막 메시지의 번호.** 메시지별 `readAt` 없음 → [결정 0007](../decisions.md#0007--읽음은-방-단위-위치-하나로-센다) | — |
| 읽음 갱신 시점 | ① 방 입장 시 ② 방이 보이는 동안 새 메시지 수신 시 ③ 백그라운드에서 포그라운드로 복귀 시. 각각 `room:read { roomId }` 소켓 이벤트 (HTTP 폴백 `POST /chat-rooms/{id}/read`) | — |
| 상대 읽음 표시 ("읽음" / "1") | **표시한다.** 내 마지막 메시지 아래 "읽음" 한 번만. 상대 `lastReadSeq >= 메시지 seq`이면 읽음 → [결정 0007](../decisions.md#0007--읽음은-방-단위-위치-하나로-센다) | — |
| 전송 흐름 | 클라이언트가 `tempId` 생성 → 즉시 화면에 "전송 중" 말풍선 → `message:send` emit → 서버 저장 → ack `{ tempId, message }` → 말풍선 확정. 상대에게는 `message:new` | — |
| 끊김 복구 | 재연결 시 `room:join { roomId, after: 마지막 메시지 seq }` → 서버가 누락분 반환. 연결 중에도 번호가 건너뛰면 같은 방법으로 채운다. 소켓 재연결 자체는 Socket.IO 기본(지수 백오프) | — |
| 전송 실패 | ack가 5초 안에 안 오면 말풍선에 "전송 실패 [재시도] [삭제]". 재시도는 같은 `tempId`로 — 서버는 `(roomId, senderId, tempId)` 유니크로 중복 저장 방지 | — |
| 타이핑 표시 | 1차 없음 | ⛔ |
| 메시지 종류 | 텍스트만. 시스템 메시지(상태 변경 안내 등) 없음 | — |

### 정상

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-OK-01 | 방 진입 `/chats/{roomId}` | 로그인 필요. 상단: ← + 상대 닉네임. 그 아래 상품 요약 바(썸네일 · 제목 · 가격 · 상태, 클릭 시 상세). 본문: 메시지 목록(최신이 아래). 하단: 입력창 + [전송] | — |
| CH-OK-02 | 첫 로드 | HTTP `GET /chat-rooms/{id}/messages?limit=50` 최신 50개 → 맨 아래로 스크롤 → 소켓 `room:join` → `room:read` | — |
| CH-OK-03 | 위로 스크롤해 과거 메시지 | 상단 도달 시 자동으로 이전 50개 (`?before=` 커서). 스크롤 위치 유지(점프 없음). 무한 스크롤이지만 위 방향이라 접근성 문제 적음 — 그래도 [이전 메시지 보기] 버튼 병행 | — |
| CH-OK-04 | 메시지 입력 | 텍스트영역 자동 높이(1~5줄). Enter = 전송, Shift+Enter = 줄바꿈 (PC). 모바일은 Enter = 줄바꿈, [전송] 버튼으로만 전송 | — |
| CH-OK-05 | 전송 | → 핵심 정의 "전송 흐름". 입력창 즉시 비움, 포커스 유지 | — |
| CH-OK-06 | 내 말풍선 · 상대 말풍선 | 내 것 우측 브랜드 색, 상대 좌측 회색. 상대 말풍선엔 아바타 없음(1:1이라 불필요) | — |
| CH-OK-07 | 시각 표시 | 말풍선 옆 "오후 3:24". 연속 메시지(같은 사람 · 같은 분)는 마지막에만. 날짜가 바뀌면 가운데 날짜 구분선 "2026년 11월 9일 (일)" | — |
| CH-OK-08 | 상대 메시지 수신 (방 보는 중) | 아래에 추가. 스크롤이 맨 아래 근처(100px 이내)면 자동 스크롤, 아니면 하단에 [새 메시지 ↓] 플로팅 버튼 | — |
| CH-OK-09 | 내 메시지 전송 시 스크롤 | 항상 맨 아래로 | — |
| CH-OK-10 | 상품 요약 바 클릭 | 상세로. 삭제된 상품이면 클릭 불가 (→ PX-ST-08) | — |
| CH-OK-11 | 뒤로가기 | 채팅 목록으로. 히스토리 없으면(알림 링크 직접 진입) `/chats` | — |
| CH-OK-12 | 방 나간 뒤 다시 들어옴 | 캐시된 메시지 즉시 + 소켓으로 누락분 (→ 끊김 복구와 같은 경로) | — |
| CH-OK-13 | 링크 포함 메시지 | 평문 (→ PC-IN-24와 일관). 링크 자동 변환은 2차에 외부 링크 경고와 함께 | — |
| CH-OK-14 | 이모지 | 그대로 표시. 이모지만 있는 메시지를 크게 보여주는 처리 없음 | — |
| CH-OK-15 | 메시지 길게 누르기 (복사 · 삭제) | 1차 없음. 브라우저 기본 텍스트 선택만 | ⛔ |
| CH-OK-16 | 메시지 삭제 · 수정 | 없음 | ⛔ |
| CH-OK-17 | 사진 · 파일 전송 | 없음 (00 범위 밖) | ⛔ |
| CH-OK-18 | 약속 잡기 · 장소 공유 | 없음 | ⛔ |
| CH-OK-19 | 판매자가 방 안에서 거래완료 처리 | 1차 상품 요약 바에 상태 변경 없음. 상세로 가서 변경 | — |

### 입력

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-IN-01 | 빈 메시지 · 공백 · 줄바꿈만 | [전송] 비활성. Enter 무시 | — |
| CH-IN-02 | 1,000자 초과 | 입력 막음 + 카운터는 900자부터 표시 `950/1000` | — |
| CH-IN-03 | 앞뒤 공백 · 끝 줄바꿈 | `trim` 후 전송 (→ CM-DT-11) | — |
| CH-IN-04 | 연속 줄바꿈 | → CM-DT-13 | — |
| CH-IN-05 | HTML · 스크립트 | → CM-SEC-01 | — |
| CH-IN-06 | 붙여넣기로 5,000자 | 1,000자에서 잘림 + 토스트 "1,000자까지 보낼 수 있어요" | — |
| CH-IN-07 | IME 조합 중 Enter (한글 입력) | `isComposing`이면 전송하지 않음 (한글 마지막 글자 두 번 전송 버그 방지) | — |
| CH-IN-08 | 금칙어 · 전화번호 자동 마스킹 | 없음 | ⛔ |

### 권한 · 상태

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-AU-01 | 참여자가 아닌 사용자가 방 URL | 404 (존재 숨김) | — |
| CH-AU-02 | 참여자가 아닌 사용자가 소켓 `room:join` | `error: FORBIDDEN`, 조인 거부 | — |
| CH-AU-03 | 참여자가 아닌 사용자가 `message:send` | `error: FORBIDDEN`. 조인하지 않은 방에는 보낼 수 없음 (서버가 소켓별 조인 방 추적) | — |
| CH-AU-04 | 비로그인 소켓 연결 | 핸드셰이크 거부 → `connect_error` (→ LI-TK-07) | — |
| CH-AU-05 | 세션 만료된 채 방 열려 있음 | 서버가 소켓 이벤트를 처리할 때마다 토큰 `exp`를 검사. 만료면 `error: UNAUTHORIZED` 후 `disconnect`. 서버가 끊으면 Socket.IO는 자동 재연결하지 않으므로(`io server disconnect`, 스파이크 ⑤) 클라이언트가 이 이유를 보고 재로그인 화면으로, 로그인 후 수동 `connect()` | — |
| CH-ST-01 | 상품 거래완료 | 전송 **가능** (거래 후 연락 필요). 상품 요약 바에 "거래완료" 배지 | — |
| CH-ST-02 | 상품 예약중 | 전송 가능 | — |
| CH-ST-03 | 상품 삭제됨 | 전송 불가, 입력창 비활성 + 안내 (→ PX-ST-07) → [결정 0006](../decisions.md#0006--상품-삭제는-항상-soft-delete-채팅방은-열람만) | — |
| CH-ST-04 | 방 보는 중 상품이 삭제됨 | 서버가 상품 삭제 시 그 상품의 모든 방에 `room:product_updated { deletedAt }` → 즉시 입력창 비활성 + 안내 → [WebSocket 기술 노트](../tech-notes.md#websocket과-socketio) | — |
| CH-ST-05 | 방 보는 중 상품 상태 변경 | 상태 변경 · 가격 수정도 같은 이벤트로 요약 바 갱신 → [WebSocket 기술 노트](../tech-notes.md#websocket과-socketio) | — |
| CH-ST-06 | 상대가 탈퇴 | 1차 범위 밖 | ⛔ |
| CH-ST-07 | 상대가 방을 나감 | 나가기 없음 | ⛔ |

### 동시성 · 실시간

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-CC-01 | 전송 중 두 번 Enter | 첫 Enter에서 입력창이 비므로 두 번째는 빈 메시지 → 무시 | — |
| CH-CC-02 | ack 전에 재시도 버튼 (5초 안) | 재시도 버튼은 5초 후에만 표시 | — |
| CH-CC-03 | ack는 못 받았지만 서버는 저장함 → 재시도 | `tempId` 유니크로 서버가 기존 메시지 반환 → 중복 없음 | — |
| CH-CC-04 | 내 두 탭에서 같은 방 | 둘 다 `room:join`. 한 탭이 보낸 메시지는 다른 탭에도 `message:new`로 (내 다른 세션에게도 브로드캐스트) | — |
| CH-CC-05 | 내 두 탭 중 한 탭만 보는 중 | 보는 탭이 `room:read` → 서버가 `user:{id}` 룸으로 내 모든 세션에 `room:read` → 다른 탭 배지도 0. 스파이크 ⑤에서 두 탭 동기화 확인 → [WebSocket 기술 노트](../tech-notes.md#websocket과-socketio) | — |
| CH-CC-06 | 상대와 동시에 전송 | 서버 도착 순 = `createdAt` 순. 클라이언트는 ack 받은 뒤 서버 `createdAt`으로 재정렬 (전송 중 말풍선은 임시로 맨 아래) | — |
| CH-CC-07 | 같은 밀리초 메시지 2개 · 먼저 시작해 늦게 커밋된 메시지 | 방별 번호 `seq` 정렬 — 방 행 잠금으로 번호 순서 = 커밋 순서. 시각(`createdAt`)은 트랜잭션 시작 시각이라 순서 · 커서에 쓰지 않는다 → [결정 0016](../decisions.md#0016--방-안-순서와-읽음-위치는-시각이-아니라-방별-번호seq로-센다) | — |
| CH-CC-08 | 끊긴 동안 메시지 200개 | 재연결 시 `after` 기준 최대 100개 반환 + `hasMore`. 넘으면 클라이언트가 HTTP로 나머지 | — |
| CH-CC-09 | 소켓은 끊겼는데 사용자가 전송 | `connected=false`면 emit하지 않고 앱 대기열에 보관, 말풍선 "연결 중…". `connect` 이벤트에서 같은 `tempId`로 순서대로 재전송, 30초 넘으면 "전송 실패". Socket.IO 내부 버퍼에 기대지 않는다 — 타임아웃 없이 버퍼에 남으면 재연결 후 몰래 전송되는 것을 스파이크 ⑤에서 확인 → [WebSocket 기술 노트](../tech-notes.md#websocket과-socketio) | — |
| CH-CC-10 | 소켓 재연결 직후 `room:join` 전에 메시지 도착 | 서버는 조인 안 된 소켓에 안 보냄. 조인 응답의 누락분에 포함됨 | — |
| CH-CC-11 | 백그라운드 탭 (모바일 사파리가 소켓 끊음) | `visibilitychange`로 복귀 감지 → 연결 확인 → `room:join` 누락분 → `room:read` | — |
| CH-CC-12 | 상대가 읽음 → 내 "읽음" 표시 | `room:read` 수신 시 상대 `lastReadSeq` 갱신 → 내 마지막 메시지 아래 "읽음" | — |
| CH-CC-13 | 서버 재시작 (배포) | 모든 소켓 끊김 → 클라이언트 자동 재연결 → 누락분 복구. 서버 메모리에 상태 없음(조인 정보는 재연결 시 다시 받음) | — |
| CH-CC-14 | 서버 인스턴스 2개 이상 | 1차: 단일 인스턴스. 수평 확장 시 Redis 어댑터 필요 — 06 규칙에 "확장 시 할 일"로 기록 | — |
| CH-CC-15 | 하트비트 | Socket.IO `pingInterval 10s` · `pingTimeout 5s` → 최대 15초 안에 끊김 감지. 기본값(25s + 20s = 45초)은 "보낸 줄 아는 창"이 너무 길다 → [WebSocket 기술 노트](../tech-notes.md#websocket과-socketio) | — |

### 네트워크 · 실패

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-NW-01 | 첫 메시지 로드 실패 | → CM-NW-01 (본문 영역만, 입력창은 비활성) | — |
| CH-NW-02 | 과거 메시지 로드 실패 | 상단에 "불러오지 못했어요 [다시 시도]" | — |
| CH-NW-03 | 소켓 연결 안 됨 (HTTP는 됨) | 5초 넘게 끊기면 상단 얇은 바 "실시간 연결이 끊겼어요. 다시 연결 중…"(`role="status"`). 별도 HTTP 폴링 루프는 두지 않는다 — Socket.IO가 WebSocket 실패 시 long-polling으로 폴백하고, 재연결 최대 간격 5초 + `after` 커서 복구로 충분 → [WebSocket 기술 노트](../tech-notes.md#websocket과-socketio) | — |
| CH-NW-04 | 소켓 연결은 됐는데 ack가 안 옴 | 5초 후 전송 실패 표시 | — |
| CH-NW-05 | `room:join` 실패 | 재시도 3회 후 CH-NW-03 바 표시 | — |
| CH-NW-06 | 느린 네트워크 | 전송 중 말풍선이 오래 보임 — 허용. 실패 기준은 시간(5초) | — |
| CH-NW-07 | WebSocket이 차단된 네트워크 (회사 프록시) | Socket.IO가 long-polling으로 폴백. 설정에서 `transports: ["websocket", "polling"]` 유지 | — |

### 접근성 · 화면

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-A11Y-01 | 메시지 목록 | 메시지 목록은 `role="log"`이되 `aria-live`를 끄고, 별도의 시각 숨김 `role="status"` 영역에 **상대 메시지만** "{닉네임}: {내용}"으로 넣는다. 내 메시지 · 과거 메시지 로드가 읽히지 않게 | — |
| CH-A11Y-02 | 말풍선 접근 가능한 이름 | "{보낸 사람}, {내용}, {시각}". 내 것은 "나" | — |
| CH-A11Y-03 | 입력창 | `<label>` 시각 숨김 "메시지 입력". [전송] `aria-label="보내기"` | — |
| CH-A11Y-04 | [새 메시지 ↓] 버튼 | 포커스 가능, 누르면 맨 아래 + 마지막 메시지로 포커스 | — |
| CH-A11Y-05 | 전송 실패 | `role="alert"` "메시지를 보내지 못했어요". 재시도 버튼 포커스 가능 | — |
| CH-A11Y-06 | 연결 끊김 바 | `role="status"` | — |
| CH-A11Y-07 | 날짜 구분선 | `role="separator"` + 텍스트 | — |
| CH-A11Y-08 | 키보드만으로 과거 메시지 | [이전 메시지 보기] 버튼 (→ CH-OK-03) | — |
| CH-A11Y-09 | 말풍선 색 명암비 | 브랜드 색 배경 + 흰 글자 4.5:1 확인 | — |
| CH-UI-01 | 360px · 키보드 올라옴 | `100dvh` + 입력창 하단 고정. 키보드 올라오면 목록이 줄고 맨 아래 유지 (→ CM-UI-07) | — |
| CH-UI-02 | 1024px | 폭 640px. (2단 레이아웃은 → CL-UI-02) | — |
| CH-UI-03 | 긴 메시지 (1,000자) | 말풍선 최대 폭 75%, 줄바꿈 | — |
| CH-UI-04 | 공백 없는 긴 영문 · URL | `break-all` | — |
| CH-UI-05 | 메시지 0개 (방금 만든 방) | 본문 중앙 "{상대 닉네임}님에게 첫 메시지를 보내 보세요" + 상품 요약은 그대로 | — |
| CH-UI-06 | 스켈레톤 | 말풍선 모양 5개 (좌우 번갈아) | — |
| CH-UI-07 | 하단 탭바 | 채팅방 안에서는 **숨김** (입력창 공간) | — |
| CH-UI-08 | 전송 중 · 실패 말풍선 | 전송 중: 투명도 60%. 실패: 빨간 ! 아이콘 + 버튼 | — |

### 보안

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-SEC-01 | 소켓으로 다른 방 ID에 전송 | 조인 여부 + 참여자 검사 (→ CH-AU-03) | — |
| CH-SEC-02 | 초당 50개 전송 | 소켓 레벨 토큰 버킷: 용량 10, 초당 5개 충전. 비면 ack `RATE_LIMITED` + `retryAfterMs`. 끊긴 동안 쌓인 대기열의 재전송(200ms 간격)은 막지 않는다 | — |
| CH-SEC-03 | 소켓 이벤트 페이로드 검증 | 모든 수신 이벤트를 Zod로 검증. 실패 시 `error: INVALID_PAYLOAD`, 연결 유지 | — |
| CH-SEC-04 | 거대 페이로드 (1MB) | Socket.IO `maxHttpBufferSize` 80KB — 정상 최대 메시지(64KB)는 통과 | — |
| CH-SEC-05 | 소켓 연결 수 폭주 (한 사용자가 100 연결) | 사용자당 최대 5 연결. 초과 시 가장 오래된 연결 끊음 | — |
| CH-SEC-06 | CORS (소켓) | 허용 오리진 목록만 | — |
| CH-SEC-07 | `tempId`를 다른 사용자 것으로 위조 | 유니크 키에 `senderId` 포함이라 영향 없음 | — |

### 데이터

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-DT-01 | ChatRoom | `id, productId, sellerId, buyerId, lastMessageAt, lastMessagePreview, lastMessageSenderId, createdAt`. 유니크 `(productId, buyerId)` | — |
| CH-DT-02 | ChatRoomMember | `roomId, userId, lastReadSeq, lastActivityAt, joinedAt`. 복합 PK. 방 생성 시 두 행 생성. `ChatRoom` 두 컬럼 안과의 선택은 동작에 영향이 없어 데이터 모델에서 쿼리 단순성으로 결정 (01 12절) → [결정 0007](../decisions.md#0007--읽음은-방-단위-위치-하나로-센다) | — |
| CH-DT-03 | Message | `id(cuid), roomId, senderId, seq, content, tempId, createdAt`. 유니크 `(roomId, seq)` · `(roomId, senderId, tempId)` | — |
| CH-DT-04 | 메시지 삭제 · 수정 컬럼 | 없음 (`deletedAt` 등 두지 않음) | — |
| CH-DT-05 | 메시지 보존 기간 | 영구 | — |
| CH-DT-06 | 소켓 이벤트 목록 (클라 → 서버) | `room:join {roomId, after?}` · `room:leave {roomId}` · `message:send {roomId, tempId, content}` · `room:read {roomId, seq}` | — |
| CH-DT-07 | 소켓 이벤트 목록 (서버 → 클라) | `message:new {message}` · `room:read {roomId, userId, lastReadSeq}` · `room:product_updated {roomId, product}` · `notification:unread {total}` · `error {code, message}` | — |
| CH-DT-08 | ack 형식 | `message:send` ack `{ ok: true, message } \| { ok: false, code }`. `room:join` ack `{ ok, missed: Message[], hasMore }` | — |
| CH-DT-09 | 메시지 조회 API | `GET /chat-rooms/{id}/messages?before=&limit=50` → `{ items, nextCursor }` (과거 방향) | — |
| CH-DT-10 | 읽음 HTTP 폴백 | `POST /chat-rooms/{id}/read` — 소켓 없이도 배지가 맞도록 | — |
| CH-DT-11 | 방 상세 API | `GET /chat-rooms/{id}` → 방 + 상품(삭제 포함) + 상대 + 내 역할 + 상대 `lastReadSeq` | — |
| CH-DT-12 | 전송 시 서버 처리 (트랜잭션) | 참여자 검사 → 상품 삭제 검사 → 방 행 잠금 → tempId 있으면 기존 반환 → `lastSeq` +1 · 비정규화 갱신 → Message insert(`seq`) → 발신자 `lastReadSeq = seq` → 커밋 → 방 참여자 소켓에 `message:new` → 수신자 전체 세션에 `notification:unread` | — |
