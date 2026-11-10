# 백엔드 04 · 권한 매트릭스

[백엔드 설계](README.md) · 앞: [03 트랜잭션 경계](03-transactions.md) · 다음: [05 멱등성](05-idempotency.md)

**권한은 요청자의 역할과 자원의 상태를 함께 확인해 판단합니다.** 판매자도 삭제된 상품은 수정할 수 없고, 구매자도 거래완료 상품에는 새 채팅방을 만들 수 없습니다. 아래 매트릭스는 엔드포인트별 정책 함수와 테스트의 기준입니다.

## 요청자 구분

| 기호 | 요청자 | 판정 위치 |
| --- | --- | --- |
| 비 | 비로그인 | 인증 미들웨어 |
| 타 | 로그인, 이 자원과 관계없는 사람 | 서비스 (자원을 읽은 뒤) |
| 판 | 이 상품의 판매자 | 서비스 |
| 구 | 이 채팅방의 구매자 | 서비스 |
| 참 | 이 채팅방의 참여자 (판 또는 구) | 서비스 |

## 엔드포인트 초안

API 명세(예정)에서 요청 · 응답 모양을 확정하며, 여기서는 경로와 권한만 정합니다.

| 묶음 | 엔드포인트 |
| --- | --- |
| 인증 | `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/email-available` · `GET /auth/nickname-available` · `GET /auth/socket-token` |
| 상품 | `GET /products` · `GET /products/:id` · `POST /products` · `PATCH /products/:id` · `PATCH /products/:id/status` · `DELETE /products/:id` · `GET /products/:id/chat-partners` (거래완료 바텀시트용) |
| 업로드 | `POST /uploads` |
| 채팅 | `POST /chat-rooms` · `GET /chat-rooms` · `GET /chat-rooms/:id` · `GET /chat-rooms/:id/messages` · `POST /chat-rooms/:id/read` |
| 내 정보 | `GET /me` · `PATCH /me` · `PATCH /me/password` · `GET /me/products` · `GET /me/purchases` · `GET /me/unread` |

## 매트릭스

✅ 허용 · 숫자는 거절 시 응답 코드. 상태 열은 상품 상태.

### 인증 · 내 정보

| 엔드포인트 | 비 | 로그인 | 비고 |
| --- | --- | --- | --- |
| `POST /auth/signup` · `login` | ✅ | ✅ (프론트가 홈으로 보냄, 서버는 막지 않음) | IP rate limit |
| `POST /auth/logout` | ✅ (쿠키 없으면 그냥 `204`) | ✅ | 멱등 |
| `GET /auth/email-available` · `nickname-available` | ✅ | ✅ | IP rate limit — 계정 존재 여부를 노출하므로 [SU-IN-10] |
| `GET /auth/socket-token` | 401 | ✅ | 60초 · `purpose: socket` [결정 0004] |
| `/me` 전부 | 401 | ✅ (항상 본인 — 경로에 사용자 ID 없음) | `PATCH /me`는 `nickname` · `avatarUploadId`만 받는다 [AC-MP-12] |

### 상품

| 엔드포인트 | 요청자 | 판매중 | 예약중 | 거래완료 | 삭제됨 | 없음 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /products` | 누구나 | 포함 | 포함 | 포함 (`hideSold`면 제외) | 제외 | — |
| `GET /products/:id` | 누구나 | ✅ | ✅ | ✅ | 404 (판매자에게도) | 404 |
| `POST /products` | 비 | 401 | | | | |
| | 로그인 | ✅ (항상 판매중으로 생성) | | | | |
| `PATCH /products/:id` | 비 | 401 | 401 | 401 | 401 | 401 |
| | 타 | 403 | 403 | 403 | 404 | 404 |
| | 판 | ✅ | ✅ | ✅ (상태는 못 바꿈) | 404 | — |
| `PATCH /products/:id/status` | 비 | 401 | 401 | 401 | 401 | 401 |
| | 타 · 구 | 403 | 403 | 403 | 404 | 404 |
| | 판 | → 예약중 · 거래완료 | → 판매중 · 거래완료 | → 판매중만 (예약중 409) | 404 | — |
| `DELETE /products/:id` | 비 | 401 | 401 | 401 | 401 | 401 |
| | 타 | 403 | 403 | 403 | 404 | 404 |
| | 판 | ✅ | ✅ | ✅ | 404 | — |
| `GET /products/:id/chat-partners` | 비 | 401 | 401 | 401 | 401 | 401 |
| | 타 · 구 | 403 | 403 | 403 | 404 | 404 |
| | 판 | ✅ | ✅ | ✅ | 404 | — |
| `POST /uploads` | 비 | 401 | | | | |
| | 로그인 | ✅ (업로더 기록) | | | | |

### 채팅

| 엔드포인트 | 요청자 | 판매중 | 예약중 | 거래완료 | 삭제됨 |
| --- | --- | --- | --- | --- | --- |
| `POST /chat-rooms` | 비 | 401 | 401 | 401 | 401 |
| | 판 (자기 상품) | 400 `CANNOT_CHAT_OWN_PRODUCT` | 400 | 400 | 404 |
| | 타 (방 없음) | ✅ `201` | ✅ `201` | 409 `PRODUCT_SOLD` | 404 |
| | 구 (방 있음) | ✅ `200` 기존 방 | ✅ `200` | ✅ `200` 기존 방 | 404 |
| `GET /chat-rooms` | 비 | 401 | | | |
| | 로그인 | 내가 참여한 방만 (상품 상태 무관, 삭제 포함) | | | |
| `GET /chat-rooms/:id` · `messages` | 비 | 401 | 401 | 401 | 401 |
| | 참여자 아님 | **404** | 404 | 404 | 404 |
| | 참 | ✅ | ✅ | ✅ | ✅ (열람 가능) |
| `POST /chat-rooms/:id/read` | 참 | ✅ | ✅ | ✅ | ✅ |
| 소켓 `message:send` | 참 | ✅ | ✅ | ✅ | `PRODUCT_DELETED` |
| 소켓 `room:join` | 참여자 아님 | `FORBIDDEN` | | | |

거래완료 상품에 **기존 구매자는 들어갈 수 있고 새 사람은 못 만드는** 이유: 거래 후 연락은 필요하지만, 끝난 거래에 새 대화를 여는 것은 판매자에게 불필요한 알림이다 [PD-ST-03, CH-ST-01].

## 401 · 403 · 404 고르는 기준

| 상황 | 코드 | 이유 |
| --- | --- | --- |
| 로그인 안 함 | 401 | 로그인하면 될 수도 있다는 뜻 — 프론트가 로그인 화면으로 |
| 공개 자원(상품)에 남이 쓰기 | 403 | 상품은 누구나 볼 수 있어 존재를 숨길 이유가 없음. 프론트가 원인을 구분해 "권한이 없어요" |
| 비공개 자원(채팅방)에 남이 접근 | **404** | 403이면 "그 ID의 방이 있다"는 사실이 새어 나간다 |
| 삭제된 자원 | 404 | 사용자 입장에서 없는 것과 같다 [결정 0006] |
| 상태 때문에 안 됨 | 409 | 권한은 있지만 지금은 안 됨 — 프론트가 재조회 |
| 규칙상 영원히 안 됨 (자기 상품 채팅) | 400 | 요청 자체가 잘못 |

수정 **화면**(`/products/:id/edit`)은 남에게 404를 보여주고 수정 **API**는 403을 돌려준다 [AC-PC-03 근거 PC-AU-03]. 화면은 URL 추측을 막는 것이 목적이고, API는 클라이언트가 원인을 구분해야 하기 때문이다.

## 정책 함수

매트릭스의 각 셀은 정책 함수 하나의 결과다. 정책 함수는 **순수 함수**로 DB를 부르지 않고, 서비스가 트랜잭션 안에서 읽은 값을 받아 판단한다 ([01 요청 계층 ⑤](01-layers.md)).

```ts
type PolicyResult = { ok: true } | { ok: false; code: ErrorCode };

canEditProduct(user, product)             // 판매자 · 삭제 안 됨
canChangeStatus(user, product, next)      // 판매자 · 삭제 안 됨 · 전이 표
canDeleteProduct(user, product)           // 판매자 · 삭제 안 됨
canOpenChat(user, product, existingRoom)  // 로그인 · 남의 상품 · 삭제 안 됨 · (거래완료면 기존 방만)
canReadRoom(user, room)                   // 참여자
canSendMessage(user, room, product)       // 참여자 · 상품 삭제 안 됨
canAssignBuyer(product, buyerId, rooms)   // buyerId가 이 상품 방의 구매자
```

**테스트**: 이 문서의 매트릭스 셀 하나 = 정책 함수 테스트 하나. DB 없이 돈다. 거기에 더해 엔드포인트별 통합 테스트가 "정책 함수를 실제로 부르는가"를 대표 셀 몇 개로 확인한다.

## 프론트와의 경계

| 프론트가 하는 것 | 서버가 하는 것 |
| --- | --- |
| 판매자에게만 `⋯` 메뉴 · 상태 `<select>` 표시 | 같은 판단을 다시 하고 어기면 403 |
| 거래완료면 [채팅하기]를 `aria-disabled` | 409 `PRODUCT_SOLD` |
| 남의 수정 URL에 404 화면 | 403 |

프론트의 숨김은 **편의**다. 서버 테스트는 프론트가 막는 요청을 직접 보내서 서버도 막는지 확인한다.
