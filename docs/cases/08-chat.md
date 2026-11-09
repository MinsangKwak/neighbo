# CH · 채팅방 · 메시지 · 소켓

[경우의 수 목차](README.md) · 공통: [00-common.md](00-common.md) · 앞: [07-chat-list.md](07-chat-list.md)

**상품 하나를 두고 판매자와 구매자가 1:1로 텍스트를 주고받습니다.** 실시간은 Socket.IO([결정 0005](../decisions/0005-socket-io.md)), 이력 조회는 HTTP. 읽음의 정의는 [결정 0007](../decisions/0007-read-state.md)로 확정했고, 끊김 복구 · 전송 실패 처리의 남은 `❓`는 [기술 노트 `websocket.md`](../tech/README.md)의 스파이크를 돌린 뒤 닫습니다.

## 핵심 정의 (제안)

| 항목 | 제안 | 결정 |
| --- | --- | --- |
| 읽음 | 방마다 `ChatRoomMember.lastReadAt` 하나. "읽음" = **방 화면이 보이는 상태(탭 활성 + 문서 visible)에서 메시지 목록이 렌더된 시점.** 메시지별 `readAt` 없음 → [결정 0007](../decisions/0007-read-state.md) | — |
| 읽음 갱신 시점 | ① 방 입장 시 ② 방이 보이는 동안 새 메시지 수신 시 ③ 백그라운드에서 포그라운드로 복귀 시. 각각 `room:read { roomId }` 소켓 이벤트 (HTTP 폴백 `POST /chat-rooms/{id}/read`) | — |
| 상대 읽음 표시 ("읽음" / "1") | **표시한다.** 내 마지막 메시지 아래 "읽음" 한 번만. 상대 `lastReadAt >= 메시지 createdAt`이면 읽음 → [결정 0007](../decisions/0007-read-state.md) | — |
| 전송 흐름 | 클라이언트가 `tempId` 생성 → 즉시 화면에 "전송 중" 말풍선 → `message:send` emit → 서버 저장 → ack `{ tempId, message }` → 말풍선 확정. 상대에게는 `message:new` | — |
| 끊김 복구 | 재연결 시 `room:join { roomId, after: 마지막 메시지 id }` → 서버가 누락분 반환. 소켓 재연결 자체는 Socket.IO 기본(지수 백오프) | — |
| 전송 실패 | ack가 5초 안에 안 오면 말풍선에 "전송 실패 [재시도] [삭제]". 재시도는 같은 `tempId`로 — 서버는 `(roomId, senderId, tempId)` 유니크로 중복 저장 방지 | — |
| 타이핑 표시 | 1차 없음 | ⛔ |
| 메시지 종류 | 텍스트만. 시스템 메시지(상태 변경 안내 등) 없음 | — |

## 정상

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

## 입력

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

## 권한 · 상태

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-AU-01 | 참여자가 아닌 사용자가 방 URL | 404 (존재 숨김) | — |
| CH-AU-02 | 참여자가 아닌 사용자가 소켓 `room:join` | `error: FORBIDDEN`, 조인 거부 | — |
| CH-AU-03 | 참여자가 아닌 사용자가 `message:send` | `error: FORBIDDEN`. 조인하지 않은 방에는 보낼 수 없음 (서버가 소켓별 조인 방 추적) | — |
| CH-AU-04 | 비로그인 소켓 연결 | 핸드셰이크 거부 → `connect_error` (→ LI-TK-07) | — |
| CH-AU-05 | 세션 만료된 채 방 열려 있음 | 서버가 소켓 이벤트를 처리할 때마다 토큰 `exp`를 검사. 만료면 `error: UNAUTHORIZED` 후 `disconnect`. 클라이언트는 재로그인 유도 | — |
| CH-ST-01 | 상품 거래완료 | 전송 **가능** (거래 후 연락 필요). 상품 요약 바에 "거래완료" 배지 | — |
| CH-ST-02 | 상품 예약중 | 전송 가능 | — |
| CH-ST-03 | 상품 삭제됨 | 전송 불가, 입력창 비활성 + 안내 (→ PX-ST-07) → [결정 0006](../decisions/0006-always-soft-delete.md) | — |
| CH-ST-04 | 방 보는 중 상품이 삭제됨 | 소켓 `room:product_updated { deletedAt }` → 즉시 입력창 비활성. 1차는 다음 HTTP 조회에서 반영도 허용 | ❓ 스파이크 뒤 |
| CH-ST-05 | 방 보는 중 상품 상태 변경 | CH-ST-04와 같은 이벤트로 요약 바 갱신 | ❓ 스파이크 뒤 |
| CH-ST-06 | 상대가 탈퇴 | 1차 범위 밖 | ⛔ |
| CH-ST-07 | 상대가 방을 나감 | 나가기 없음 | ⛔ |

## 동시성 · 실시간

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-CC-01 | 전송 중 두 번 Enter | 첫 Enter에서 입력창이 비므로 두 번째는 빈 메시지 → 무시 | — |
| CH-CC-02 | ack 전에 재시도 버튼 (5초 안) | 재시도 버튼은 5초 후에만 표시 | — |
| CH-CC-03 | ack는 못 받았지만 서버는 저장함 → 재시도 | `tempId` 유니크로 서버가 기존 메시지 반환 → 중복 없음 | — |
| CH-CC-04 | 내 두 탭에서 같은 방 | 둘 다 `room:join`. 한 탭이 보낸 메시지는 다른 탭에도 `message:new`로 (내 다른 세션에게도 브로드캐스트) | — |
| CH-CC-05 | 내 두 탭 중 한 탭만 보는 중 | 보는 탭이 `room:read` → 서버는 내 모든 세션에 `room:read_synced` → 다른 탭 배지도 0 | ❓ 스파이크 뒤 |
| CH-CC-06 | 상대와 동시에 전송 | 서버 도착 순 = `createdAt` 순. 클라이언트는 ack 받은 뒤 서버 `createdAt`으로 재정렬 (전송 중 말풍선은 임시로 맨 아래) | — |
| CH-CC-07 | 같은 밀리초 메시지 2개 | `(createdAt, id)` 정렬. `id`는 시간 순 정렬 가능한 cuid2/ulid | — |
| CH-CC-08 | 끊긴 동안 메시지 200개 | 재연결 시 `after` 기준 최대 100개 반환 + `hasMore`. 넘으면 클라이언트가 HTTP로 나머지 | — |
| CH-CC-09 | 소켓은 끊겼는데 사용자가 전송 | 즉시 "전송 실패"가 아니라 "연결 중…" 상태로 큐에 보관. 재연결 후 순서대로 emit. 30초 넘으면 실패 처리 | ❓ 스파이크 뒤 |
| CH-CC-10 | 소켓 재연결 직후 `room:join` 전에 메시지 도착 | 서버는 조인 안 된 소켓에 안 보냄. 조인 응답의 누락분에 포함됨 | — |
| CH-CC-11 | 백그라운드 탭 (모바일 사파리가 소켓 끊음) | `visibilitychange`로 복귀 감지 → 연결 확인 → `room:join` 누락분 → `room:read` | — |
| CH-CC-12 | 상대가 읽음 → 내 "읽음" 표시 | `room:read` 수신 시 상대 `lastReadAt` 갱신 → 내 마지막 메시지 아래 "읽음" | — |
| CH-CC-13 | 서버 재시작 (배포) | 모든 소켓 끊김 → 클라이언트 자동 재연결 → 누락분 복구. 서버 메모리에 상태 없음(조인 정보는 재연결 시 다시 받음) | — |
| CH-CC-14 | 서버 인스턴스 2개 이상 | 1차: 단일 인스턴스. 수평 확장 시 Redis 어댑터 필요 — 06 규칙에 "확장 시 할 일"로 기록 | — |
| CH-CC-15 | 하트비트 | Socket.IO 기본 (`pingInterval 25s`). 별도 구현 없음 | — |

## 네트워크 · 실패

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-NW-01 | 첫 메시지 로드 실패 | → CM-NW-01 (본문 영역만, 입력창은 비활성) | — |
| CH-NW-02 | 과거 메시지 로드 실패 | 상단에 "불러오지 못했어요 [다시 시도]" | — |
| CH-NW-03 | 소켓 연결 안 됨 (HTTP는 됨) | 상단 얇은 바 "실시간 연결이 끊겼어요. 다시 연결 중…". 전송은 CH-CC-09 큐. 수신은 안 됨 — ❓ HTTP 폴링 폴백(10초마다) | ❓ 스파이크 뒤 |
| CH-NW-04 | 소켓 연결은 됐는데 ack가 안 옴 | 5초 후 전송 실패 표시 | — |
| CH-NW-05 | `room:join` 실패 | 재시도 3회 후 CH-NW-03 바 표시 | — |
| CH-NW-06 | 느린 네트워크 | 전송 중 말풍선이 오래 보임 — 허용. 실패 기준은 시간(5초) | — |
| CH-NW-07 | WebSocket이 차단된 네트워크 (회사 프록시) | Socket.IO가 long-polling으로 폴백. 설정에서 `transports: ["websocket", "polling"]` 유지 | — |

## 접근성 · 화면

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-A11Y-01 | 메시지 목록 | `role="log" aria-live="polite" aria-relevant="additions"`. 새 메시지가 읽힘. 내 메시지는 읽지 않도록 `aria-live` 영역 밖에서 추가 후 이동 — 복잡하므로 1차는 상대 메시지만 별도 `aria-live` 영역에 텍스트 복제 | ❓ 스파이크 뒤 |
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

## 보안

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-SEC-01 | 소켓으로 다른 방 ID에 전송 | 조인 여부 + 참여자 검사 (→ CH-AU-03) | — |
| CH-SEC-02 | 초당 50개 전송 | 소켓 레벨 rate limit: 사용자당 초당 5개, 초과 시 `error: RATE_LIMITED` + 10초 차단 | — |
| CH-SEC-03 | 소켓 이벤트 페이로드 검증 | 모든 수신 이벤트를 Zod로 검증. 실패 시 `error: INVALID_PAYLOAD`, 연결 유지 | — |
| CH-SEC-04 | 거대 페이로드 (1MB) | Socket.IO `maxHttpBufferSize` 10KB | — |
| CH-SEC-05 | 소켓 연결 수 폭주 (한 사용자가 100 연결) | 사용자당 최대 5 연결. 초과 시 가장 오래된 연결 끊음 | — |
| CH-SEC-06 | CORS (소켓) | 허용 오리진 목록만 | — |
| CH-SEC-07 | `tempId`를 다른 사용자 것으로 위조 | 유니크 키에 `senderId` 포함이라 영향 없음 | — |

## 데이터

| ID | 상황 | 기대 동작 (제안) | 결정 |
| --- | --- | --- | --- |
| CH-DT-01 | ChatRoom | `id, productId, sellerId, buyerId, lastMessageAt, lastMessagePreview, lastMessageSenderId, createdAt`. 유니크 `(productId, buyerId)` | — |
| CH-DT-02 | ChatRoomMember | `roomId, userId, lastReadAt, joinedAt`. 복합 PK. 방 생성 시 두 행 생성. `ChatRoom`에 두 컬럼으로 두는 안은 차선으로 허용, 02에서 최종 → [결정 0007](../decisions/0007-read-state.md) | ❓ 스파이크 뒤 |
| CH-DT-03 | Message | `id(ulid), roomId, senderId, content, tempId, createdAt`. 인덱스 `(roomId, createdAt, id)`. 유니크 `(roomId, senderId, tempId)` | — |
| CH-DT-04 | 메시지 삭제 · 수정 컬럼 | 없음 (`deletedAt` 등 두지 않음) | — |
| CH-DT-05 | 메시지 보존 기간 | 영구 | — |
| CH-DT-06 | 소켓 이벤트 목록 (클라 → 서버) | `room:join {roomId, after?}` · `room:leave {roomId}` · `message:send {roomId, tempId, content}` · `room:read {roomId}` | — |
| CH-DT-07 | 소켓 이벤트 목록 (서버 → 클라) | `message:new {message}` · `room:read {roomId, userId, lastReadAt}` · `room:product_updated {roomId, product}` · `notification:unread {total}` · `error {code, message}` | — |
| CH-DT-08 | ack 형식 | `message:send` ack `{ ok: true, message } \| { ok: false, code }`. `room:join` ack `{ ok, missed: Message[], hasMore }` | — |
| CH-DT-09 | 메시지 조회 API | `GET /chat-rooms/{id}/messages?before=&limit=50` → `{ items, nextCursor }` (과거 방향) | — |
| CH-DT-10 | 읽음 HTTP 폴백 | `POST /chat-rooms/{id}/read` — 소켓 없이도 배지가 맞도록 | — |
| CH-DT-11 | 방 상세 API | `GET /chat-rooms/{id}` → 방 + 상품(삭제 포함) + 상대 + 내 역할 + 상대 `lastReadAt` | — |
| CH-DT-12 | 전송 시 서버 처리 (트랜잭션) | 참여자 검사 → 상품 삭제 검사 → Message insert(tempId 충돌 시 기존 반환) → ChatRoom 비정규화 갱신 → 발신자 `lastReadAt = now` → 커밋 → 방 참여자 소켓에 `message:new` → 수신자 전체 세션에 `notification:unread` | — |
