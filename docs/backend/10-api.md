# 백엔드 10 · API 명세

[백엔드 설계](README.md) · 앞: [09 소켓 서버](09-socket-server.md) · 권한: [04](04-authorization.md) · 에러: [06](06-errors.md) · 트랜잭션: [03](03-transactions.md)

**이 문서는 프론트엔드·백엔드 간 HTTP 요청·응답과 소켓 이벤트의 계약을 정의합니다.** 엔드포인트별 권한, 입력, 응답, 에러, 트랜잭션, 수용 조건을 함께 정리했습니다. 구현 단계에서는 타입과 Zod 스키마를 `shared-schema/`로 옮겨 두 앱이 같은 정의를 사용하도록 합니다.

---

## 1. 공통 규칙

| 항목 | 규칙 | 근거 |
| --- | --- | --- |
| 경로 | 브라우저는 `/api/*`로 부르고, Next.js 프록시가 `/api`를 떼고 백엔드로 넘긴다. 이 문서의 경로는 **백엔드 기준** (`/products` = 브라우저의 `/api/products`) | 결정 0004 |
| 버전 | 경로에 `/v1`을 붙이지 않는다 | 클라이언트가 같은 저장소의 프론트 하나뿐이고 함께 배포된다. 외부 클라이언트가 생기면 그때 붙인다 |
| 형식 | 요청 · 응답 본문 JSON (`application/json; charset=utf-8`). 업로드만 `multipart/form-data` | |
| 시각 | ISO 8601 UTC 문자열 (`2026-11-10T00:12:34.567Z`) | AC-CM-50 |
| 금액 | 원 단위 정수. 0 = 나눔 | AC-CM-51 |
| ID | 불투명 문자열 (cuid). 클라이언트는 해석하지 않는다 | AC-CM-35 |
| `null`과 생략 | 응답은 값이 없으면 **`null`로 명시**하고 키를 생략하지 않는다. 요청의 `PATCH`는 생략 = 바꾸지 않음, `null` = 비움 | 타입이 흔들리지 않게 |
| 인증 | 쿠키 `nb_session` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`). 응답마다 연장될 수 있음 | AC-CM-03 |
| 요청 ID | 모든 응답에 `X-Request-Id` | AC-CM-13 |
| 성공 본문 | 자원을 이름 붙여 담는다 `{ product }` · 목록은 `{ items, nextCursor }` · 본문 없는 성공은 `204` | AC-CM-12 |
| 에러 본문 | `{ error: { code, message, fields } }` — `fields`는 없으면 `null` | AC-CM-10, [06](06-errors.md) |
| 쓰기 요청 | `Origin` 헤더가 허용 목록 밖이면 `403 ORIGIN_MISMATCH` | AC-CM-31 |
| 한도 | 본문 1MB (업로드 4MB) · `limit` 최대 50 (메시지 100) | AC-CM-34, AC-PL-04 |

### 페이지네이션

```
GET /products?limit=20                  → { items: [...20], nextCursor: "eyJ0Ijoi..." }
GET /products?limit=20&cursor=eyJ0Ijoi... → { items: [...20], nextCursor: null }   // 마지막
```

- 커서는 **불투명 문자열**이다. 내부는 마지막 항목의 `(정렬 시각, id)`(메시지는 `seq`)를 base64url로 감싼 것이지만 클라이언트는 만들거나 해석하지 않는다.
- 서버는 `limit + 1`개를 조회해 다음이 있을 때만 `nextCursor`를 준다 — 빈 마지막 페이지 요청이 생기지 않는다 [PL-DT-02].
- 잘못된 커서는 `400 INVALID_CURSOR` [AC-PL-04].

---

## 2. 공유 타입

```ts
type ISODate = string;        // ISO 8601 UTC
type Id = string;             // cuid

type ProductStatus = 'ON_SALE' | 'RESERVED' | 'SOLD';
type MemberRole = 'SELLER' | 'BUYER';

// 다른 사람에게 보이는 사용자 — 이메일 없음 [AC-CM-14]
interface UserPublic {
  id: Id;
  nickname: string;
  avatarUrl: string | null;
  createdAt: ISODate;
}

// 본인에게만 [AC-CM-14]
interface UserSelf extends UserPublic {
  email: string;
}

interface Image {
  url: string;
  width: number;
  height: number;
}

interface ProductImage {
  id: Id;
  url: string;          // 긴 변 1600px
  thumbnailUrl: string; // 400px
  width: number;
  height: number;
}

// 목록 카드 [AC-PL-01]
interface ProductCard {
  id: Id;
  title: string;
  price: number;
  status: ProductStatus;
  thumbnail: Image | null;   // 대표 사진의 400px 썸네일
  chatRoomCount: number;
  createdAt: ISODate;
}

// 마이페이지 판매 탭 [AC-MP-03]
interface MyProductCard extends ProductCard {
  buyer: UserPublic | null;  // 거래완료 + 구매자 지정 시
}

// 마이페이지 구매 내역 — 삭제된 상품 포함 [AC-MP-04, 결정 0012]
interface PurchaseCard {
  id: Id;
  title: string;
  soldPrice: number;         // 거래 시점 가격
  thumbnail: Image | null;
  seller: UserPublic;
  soldAt: ISODate;
  deleted: boolean;          // true면 클릭 불가 · "삭제됨"
}

// 상세 [AC-PD-10, 22]
interface ProductDetail {
  id: Id;
  title: string;
  price: number;
  description: string;
  status: ProductStatus;
  images: ProductImage[];    // order 순
  seller: UserPublic;
  chatRoomCount: number;
  soldAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// 상세를 보는 사람 기준 정보 — 비로그인이면 null [결정 0011]
interface Viewer {
  isSeller: boolean;
  existingChatRoomId: Id | null;
}

// 채팅방 · 채팅 목록 안의 상품 요약 — 삭제된 상품도 [결정 0006]
interface ProductSummary {
  id: Id;
  title: string;
  price: number;
  status: ProductStatus;
  thumbnail: Image | null;   // 30일 정리 후엔 null
  deleted: boolean;
}

// 채팅 목록 행 [AC-CL-02, 14]
interface ChatRoomItem {
  id: Id;
  product: ProductSummary;
  partner: UserPublic;
  myRole: MemberRole;
  lastMessage: { content: string; senderId: Id; createdAt: ISODate } | null;
  unreadCount: number;
  lastActivityAt: ISODate;
}

// 채팅방 [AC-CH-10]
interface ChatRoomDetail {
  id: Id;
  product: ProductSummary;
  partner: UserPublic;
  myRole: MemberRole;
  partnerLastReadSeq: number;   // "읽음" 표시 — 내 메시지 seq 이상이면 읽음 [AC-CH-02]
  createdAt: ISODate;
}

interface Message {
  id: Id;
  roomId: Id;
  senderId: Id;
  seq: number;                  // 방 안 순서 — 정렬 · 커서 · 읽음 · 틈 감지의 기준 [결정 0016]
  content: string;
  tempId: string;               // 보낸 클라이언트가 만든 값 — 중복 제거용
  createdAt: ISODate;
}

interface Upload {
  id: Id;
  url: string;
  thumbnailUrl: string | null;  // 아바타는 null
  width: number;
  height: number;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
```

**타입을 화면 단위로 나눈 이유**: `Product` 하나에 모든 필드를 넣고 화면마다 일부만 쓰면, 목록 응답에 설명 전문이 실리거나 삭제된 상품이 목록 타입으로 새어 나간다. 화면이 필요한 것만 담은 타입을 따로 두면 **응답 크기와 노출 범위가 타입으로 고정**된다.

---

## 3. 인증

### `POST /auth/signup` — 회원가입

| 항목 | 내용 |
| --- | --- |
| 권한 | 누구나 · IP 분당 10 |
| 트랜잭션 | T1 |
| 근거 | AC-SU-01~23 |

```ts
// 요청
{ email: string; password: string; passwordConfirm: string; nickname: string }
// 201 + Set-Cookie: nb_session
{ user: UserSelf }
```

| 필드 | 규칙 (공유 스키마) |
| --- | --- |
| `email` | `normalizeEmail()` 후 ASCII 이메일 형식, 254자 이하 |
| `password` | 8~64자, 앞뒤 공백 없음, 흔한 비밀번호 · 이메일 · 닉네임과 다름 |
| `passwordConfirm` | `password`와 같음 (오류는 `fields.passwordConfirm`) |
| `nickname` | 2~12 grapheme, 한글 · 영문 · 숫자 · 중간 공백 · `_ . -`, 금칙어 아님 |

| 에러 | 언제 |
| --- | --- |
| `400 VALIDATION_FAILED` | 위 규칙 위반 — 실패한 필드 전부 |
| `409 EMAIL_TAKEN` · `409 NICKNAME_TAKEN` | 유니크 위반 (`fields`에 해당 칸) |
| `429 RATE_LIMITED` | |

### `POST /auth/login` — 로그인

| 권한 | 트랜잭션 | 근거 |
| --- | --- | --- |
| 누구나 · IP 분당 10 | 단일 UPDATE(`lastLoginAt`) | AC-LI-01~20 |

```ts
// 요청
{ email: string; password: string }
// 200 + Set-Cookie
{ user: UserSelf }
```

`401 INVALID_CREDENTIALS` — 없는 이메일 · 틀린 비밀번호 같은 응답, 같은 시간 [AC-LI-06]. `400 VALIDATION_FAILED`는 형식 위반만 (비밀번호 규칙은 검사하지 않음 [AC-LI-05]).

### `POST /auth/logout` — 로그아웃

`204` + 쿠키 삭제. 쿠키가 없어도 `204` [B05]. 본문 없음.

### `GET /auth/email-available?email=` · `GET /auth/nickname-available?nickname=`

| 권한 | 근거 |
| --- | --- |
| 누구나 · IP 분당 10 | AC-SU-08, 16 |

```ts
// 200
{ available: boolean; message: string | null }  // available=false면 칸 아래 그대로 보일 문구
```

형식 위반은 `400 VALIDATION_FAILED`. 이 응답은 **참고용**이고, 가입 요청의 `409`가 최종이다 [SU-CC-03].

### `GET /auth/socket-token` — 소켓 연결 토큰

| 권한 | 근거 |
| --- | --- |
| 로그인 | AC-LI-18a, 결정 0004 |

```ts
// 200 — Cache-Control: no-store
{ token: string; expiresAt: ISODate }  // 60초, purpose: "socket"
```

---

## 4. 상품

### `GET /products` — 목록 · 검색

| 권한 | 근거 |
| --- | --- |
| 누구나 | AC-PL-01~16 |

| 쿼리 | 타입 | 기본 | 규칙 |
| --- | --- | --- | --- |
| `cursor` | string | — | 불투명 |
| `limit` | number | 20 | 1~50 (넘으면 50) |
| `q` | string | — | `normalizeText()` 후 2자 이상, 있으면 제목 검색 |
| `hideSold` | `1` | — | 있으면 거래완료 제외 |

```ts
// 200
Page<ProductCard>   // createdAt DESC, id DESC · 삭제된 상품 없음
```

### `GET /products/:id` — 상세

| 권한 | 근거 |
| --- | --- |
| 누구나 (`optionalAuth`) | AC-PD-10~24 |

```ts
// 200 — Cache-Control: no-store (viewer가 사람마다 다름)
{ product: ProductDetail; viewer: Viewer | null }
```

`404 NOT_FOUND` — 없음 · 삭제됨 (판매자에게도) [AC-PD-19].

### `POST /products` — 등록

| 권한 | 트랜잭션 | 근거 |
| --- | --- | --- |
| 로그인 · 사용자 분당 30 | T2 | AC-PC-01~20 |

```ts
// 요청
{
  title: string;          // 2~40 grapheme, 줄바꿈 → 공백
  price: number;          // 0~100,000,000 정수
  description: string;    // 0~2,000 grapheme
  imageIds: Id[];         // Upload id, 0~10개, 순서 = 표시 순서 (첫째가 대표)
  idempotencyKey: string; // uuid, 폼을 열 때 생성
}
// 201 — 새로 만듦 / 200 — 같은 idempotencyKey의 기존 상품 [B05]
{ product: ProductDetail }
```

| 에러 | 언제 |
| --- | --- |
| `400 VALIDATION_FAILED` | 규칙 위반. `imageIds`의 업로드가 없거나 만료(24시간)되면 `fields.imageIds = "사진을 다시 올려 주세요"` |
| `403 FORBIDDEN` | 남이 올린 업로드 id [AC-PC-18] |

### `PATCH /products/:id` — 수정

| 권한 | 트랜잭션 | 근거 |
| --- | --- | --- |
| 판매자 · 삭제 안 됨 | T3 | AC-PC-30~36 |

```ts
// 요청 — 생략한 필드는 그대로
{
  title?: string;
  price?: number;
  description?: string;
  images?: Array<{ imageId: Id } | { uploadId: Id }>;  // 최종 사진 목록 (순서 포함), 0~10개
}
// 200
{ product: ProductDetail }
```

**사진을 "최종 목록"으로 받는 이유**: `{ add: [...], remove: [...], order: [...] }`처럼 변경분을 받으면, 셋이 서로 어긋나는 요청(지운 사진의 순서 지정 등)을 모두 검증해야 한다. 최종 목록 하나면 "여기 없는 기존 사진 = 삭제, `uploadId` = 추가, 배열 순서 = 순서"로 해석이 하나뿐이다. `images`를 생략하면 사진은 그대로.

`status`가 본문에 있으면 무시한다 [AC-PC-34]. 에러: `400` · `401` · `403 FORBIDDEN` (남의 것) · `404` (없음 · 삭제됨).

### `PATCH /products/:id/status` — 상태 변경

| 권한 | 트랜잭션 | 근거 |
| --- | --- | --- |
| 판매자 · 삭제 안 됨 · 전이 표 | T4 | AC-PD-01~08 |

```ts
// 요청
{ status: ProductStatus; buyerId?: Id | null }  // buyerId는 status=SOLD일 때만, 생략·null = 지정 안 함
// 200
{ product: ProductDetail }
```

| 에러 | 언제 |
| --- | --- |
| `400 VALIDATION_FAILED` | `SOLD`가 아닌데 `buyerId`가 있음 |
| `400 NOT_A_CHAT_PARTNER` | `buyerId`가 이 상품 방의 구매자가 아님 |
| `403 FORBIDDEN` | 판매자 아님 |
| `404 NOT_FOUND` | 없음 · 삭제됨 |
| `409 INVALID_TRANSITION` | 전이 표 밖 (`message`가 어떤 전이인지 말함) |

같은 상태로 바꾸면 `200`, 변경 없음 [AC-PD-02]. 거래완료 → 판매중은 `buyerId · soldAt · soldPrice`가 비워진다.

### `DELETE /products/:id` — 삭제

| 권한 | 트랜잭션 | 근거 |
| --- | --- | --- |
| 판매자 · 삭제 안 됨 | T5 | AC-PX-01~13 |

`204`. 에러: `403` · `404` (이미 삭제 포함 — 프론트는 자기 삭제 요청의 404를 성공으로 본다 [B05]).

### `GET /products/:id/chat-partners` — 거래완료 바텀시트

| 권한 | 근거 |
| --- | --- |
| 판매자 · 삭제 안 됨 | AC-PD-04 |

```ts
// 200 — 최근 활동순, 페이지 없음 (상품 하나의 방 수는 작다)
{ items: Array<{ roomId: Id; user: UserPublic; lastActivityAt: ISODate }> }
```

---

## 5. 업로드

### `POST /uploads` — 사진 한 장

| 권한 | 근거 |
| --- | --- |
| 로그인 · 사용자 분당 30 · 서버 처리 동시 2 | AC-PC-10~19, AC-MP-08, [B07](07-protection.md) |

```
POST /uploads?kind=PRODUCT | AVATAR
Content-Type: multipart/form-data
file: (이진)          — 4MB 이하, jpeg · png · webp
```

`kind`를 multipart 필드가 아니라 **쿼리**로 받는 이유: 서버는 파일 스트림을 읽기 시작하기 전에 처리 방식(한도 · 크기)을 알아야 하는데, multipart 필드 순서는 클라이언트가 정해 파일이 먼저 올 수 있다.

```ts
// 201
{ upload: Upload }
```

| 에러 | 언제 |
| --- | --- |
| `400 UNSUPPORTED_IMAGE` | 매직 바이트가 jpeg · png · webp가 아님 |
| `400 INVALID_FILE` | 0바이트 · 손상 · 5,000만 픽셀 초과 |
| `413 PAYLOAD_TOO_LARGE` | 4MB 초과 |
| `429 RATE_LIMITED` | 사용자 한도 · 처리 대기열 가득 |

`kind`별 처리: `PRODUCT`는 1600px + 400px 썸네일, `AVATAR`는 512px 하나(정사각 크롭은 클라이언트가 이미 함). **업로드는 멱등하지 않다** — 중복은 상품에 연결되지 않아 24시간 뒤 배치가 지운다 [B05].

> **프록시 본문 한도**: 업로드는 Next.js 프록시를 지나므로 Vercel 함수 본문 한도에 걸릴 수 있다 [결정 0004 트레이드오프]. 클라이언트가 먼저 1600px로 줄여 보통 1MB 이하로 보내므로 1차는 프록시를 그대로 쓰고, 구현 단계에서 한도를 실측해 [기술 노트](../tech/README.md) `image-pipeline.md`에 남긴다. 넘치면 업로드만 소켓 토큰과 같은 단기 토큰으로 백엔드에 직접 보낸다.

---

## 6. 채팅

### `POST /chat-rooms` — 방 열기

| 권한 | 트랜잭션 | 근거 |
| --- | --- | --- |
| 로그인 · 남의 상품 · 삭제 안 됨 · (거래완료면 기존 방만) | T6 | AC-PD-12~16, 20 |

```ts
// 요청
{ productId: Id }
// 201 — 새 방 / 200 — 기존 방 (같은 이동)
{ chatRoom: ChatRoomDetail }
```

| 에러 | 언제 |
| --- | --- |
| `400 CANNOT_CHAT_OWN_PRODUCT` | 자기 상품 |
| `404 NOT_FOUND` | 상품 없음 · 삭제됨 |
| `409 PRODUCT_SOLD` | 거래완료 상품에 새 방 |

### `GET /chat-rooms` — 채팅 목록

| 권한 | 근거 |
| --- | --- |
| 로그인 (내 방만) | AC-CL-01~16 |

| 쿼리 | 기본 | 규칙 |
| --- | --- | --- |
| `cursor` | — | |
| `limit` | 30 | 1~50 |
| `productId` | — | 있으면 그 상품의 방만 |

```ts
// 200 — lastActivityAt DESC, id DESC · 삭제된 상품의 방 포함
Page<ChatRoomItem>
```

### `GET /chat-rooms/:id` — 방 정보

`200 { chatRoom: ChatRoomDetail }`. 참여자 아니면 **`404`** (존재를 숨김 [B04]).

### `GET /chat-rooms/:id/messages` — 메시지 (과거 방향)

| 쿼리 | 기본 | 규칙 |
| --- | --- | --- |
| `before` | — | 커서. 없으면 최신부터 |
| `limit` | 50 | 1~100 |

```ts
// 200 — 한 페이지 안은 seq DESC (최신이 앞). 화면은 뒤집어 그린다
Page<Message>
```

**페이지 안을 최신순으로 주는 이유**: "최신 50개"와 "그보다 이전 50개"가 같은 정렬 · 같은 커서 방향이 되어 서버 쿼리가 하나다. 오래된 순으로 주려면 서버가 역순 조회 후 다시 뒤집어야 한다. 이후 방향(재연결 누락분)은 소켓 `room:join`이 맡는다 [AC-CH-05].

참여자 아니면 `404`.

### `POST /chat-rooms/:id/read` — 읽음 (소켓 폴백)

```ts
// 요청
{ seq: number }           // 화면에 그린 마지막 메시지 번호
// 200
{ lastReadSeq: number }   // GREATEST · LEAST를 거친 값 [T8]
```

소켓이 연결돼 있으면 `room:read` 이벤트를 쓰고, 이 엔드포인트는 소켓이 없을 때만 [AC-CH-01].

---

## 7. 내 정보

### `GET /me`

```ts
// 200 — Cache-Control: no-store
{
  user: UserSelf;
  counts: { onSale: number; reserved: number; sold: number; purchased: number };
}
```

비로그인 `401` — 프론트 서버 렌더가 이 응답으로 로그인 여부를 판단한다 [F01].

### `PATCH /me` — 닉네임 · 아바타

```ts
// 요청 — 생략 = 그대로
{
  nickname?: string;
  avatarUploadId?: Id | null;   // Upload id(kind=AVATAR) · null = 기본 이미지로
}
// 200
{ user: UserSelf }
```

본문의 다른 키(`id` · `email` 등)는 무시한다 [AC-MP-12]. 아바타를 **URL이 아니라 업로드 id로** 받는 이유: URL을 받으면 아무 외부 주소나 넣을 수 있다. 업로드 id면 서버가 "이 사람이 올린 아바타용 파일"인지 확인할 수 있다.

에러: `400` · `409 NICKNAME_TAKEN` · `403 FORBIDDEN` (남의 업로드).

### `PATCH /me/password`

```ts
// 요청
{ currentPassword: string; newPassword: string; newPasswordConfirm: string }
// 204 + Set-Cookie (새 tokenVersion의 토큰)
```

에러: `400 WRONG_PASSWORD` (현재 비밀번호) · `400 VALIDATION_FAILED` (새 비밀번호 규칙 · 현재와 같음 · 확인 불일치). 성공하면 다른 기기의 세션은 무효 [AC-MP-09].

### `GET /me/products?status=&cursor=&limit=`

`status` 필수 (`ON_SALE` · `RESERVED` · `SOLD`). `200 Page<MyProductCard>` — `createdAt DESC`, 삭제 제외 [AC-MP-02, 03].

### `GET /me/purchases?cursor=&limit=`

`200 Page<PurchaseCard>` — `soldAt DESC`, **삭제된 상품 포함** [AC-MP-04].

### `GET /me/unread`

```ts
// 200 — 사용자 분당 60
{ rooms: number }
```

[AC-NT-01, 결정 0008]

---

## 8. 운영

| 엔드포인트 | 응답 | 근거 |
| --- | --- | --- |
| `GET /healthz` | `200 { ok: true }` — DB 안 봄 | [B08](08-observability.md) |
| `GET /readyz` | `200 { ok: true }` / `503` — `SELECT 1` | |

프록시는 이 둘을 외부에 노출하지 않는다.

---

## 9. 소켓 이벤트

연결: `io(SOCKET_URL, { auth: (cb) => cb({ token }) })` — 토큰은 `GET /auth/socket-token` [3절]. 처리 순서와 대상은 [09 소켓 서버](09-socket-server.md).

### 클라이언트 → 서버

```ts
// ack 있음
'room:join'    (p: { roomId: Id; after: number | null },   // 마지막으로 받은 seq
                ack: (r: { ok: true; missed: Message[]; hasMore: boolean } | { ok: false; code: SocketErrorCode }) => void)
'message:send' (p: { roomId: Id; tempId: string; content: string },
                ack: (r: { ok: true; message: Message } | { ok: false; code: SocketErrorCode; retryAfterMs: number | null }) => void)

// ack 없음
'room:leave'   (p: { roomId: Id })
'room:read'    (p: { roomId: Id; seq: number })
```

| 이벤트 | 규칙 |
| --- | --- |
| `room:join` | `missed`는 `seq > after`, 오래된 순, 최대 100. `hasMore`면 HTTP 메시지 API로 나머지 [AC-CH-05] |
| `message:send` | `content`는 HTTP와 같은 메시지 스키마. 클라이언트는 **반드시 5초 타임아웃**으로 보냄 [AC-CH-37] |

### 서버 → 클라이언트

```ts
'message:new'           (p: { message: Message })
'room:read'             (p: { roomId: Id; userId: Id; lastReadSeq: number })
'notification:unread'   (p: { total: number;
                              latest: { roomId: Id; partner: UserPublic; preview: string; count: number; createdAt: ISODate } | null })
'room:product_updated'  (p: { roomId: Id; product: ProductSummary })
'error'                 (p: { code: SocketErrorCode; message: string })

type SocketErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'PRODUCT_DELETED' | 'INVALID_PAYLOAD' | 'RATE_LIMITED';
```

`notification:unread.latest.count`는 같은 방 5초 안 메시지를 합친 수 — 프론트 토스트 합치기 [AC-NT-06]에 쓴다. 서버가 합치지 않고 매 메시지 `count: 1`을 보내도 프론트가 합칠 수 있지만, 서버가 이미 아는 값을 내려 주면 탭 여러 개가 같은 숫자를 보인다.

---

## 10. 엔드포인트 요약

| 메서드 · 경로 | 권한 | 성공 | 트랜잭션 |
| --- | --- | --- | --- |
| `POST /auth/signup` | 누구나 | 201 `{ user }` | T1 |
| `POST /auth/login` | 누구나 | 200 `{ user }` | — |
| `POST /auth/logout` | 누구나 | 204 | — |
| `GET /auth/email-available` | 누구나 | 200 `{ available, message }` | — |
| `GET /auth/nickname-available` | 누구나 | 200 `{ available, message }` | — |
| `GET /auth/socket-token` | 로그인 | 200 `{ token, expiresAt }` | — |
| `GET /products` | 누구나 | 200 `Page<ProductCard>` | — |
| `GET /products/:id` | 누구나 | 200 `{ product, viewer }` | — |
| `POST /products` | 로그인 | 201 · 200 `{ product }` | T2 |
| `PATCH /products/:id` | 판매자 | 200 `{ product }` | T3 |
| `PATCH /products/:id/status` | 판매자 | 200 `{ product }` | T4 |
| `DELETE /products/:id` | 판매자 | 204 | T5 |
| `GET /products/:id/chat-partners` | 판매자 | 200 `{ items }` | — |
| `POST /uploads?kind=` | 로그인 | 201 `{ upload }` | — |
| `POST /chat-rooms` | 로그인 | 201 · 200 `{ chatRoom }` | T6 |
| `GET /chat-rooms` | 로그인 | 200 `Page<ChatRoomItem>` | — |
| `GET /chat-rooms/:id` | 참여자 | 200 `{ chatRoom }` | — |
| `GET /chat-rooms/:id/messages` | 참여자 | 200 `Page<Message>` | — |
| `POST /chat-rooms/:id/read` | 참여자 | 200 `{ lastReadSeq }` | T8 |
| `GET /me` | 로그인 | 200 `{ user, counts }` | — |
| `PATCH /me` | 로그인 | 200 `{ user }` | T10 · T11 |
| `PATCH /me/password` | 로그인 | 204 | T9 |
| `GET /me/products` | 로그인 | 200 `Page<MyProductCard>` | — |
| `GET /me/purchases` | 로그인 | 200 `Page<PurchaseCard>` | — |
| `GET /me/unread` | 로그인 | 200 `{ rooms }` | — |
| `GET /healthz` · `/readyz` | 내부 | 200 | — |

HTTP 25개 (운영 2개 제외) + 소켓 이벤트 9개 (클라이언트 → 서버 4 · 서버 → 클라이언트 5).

## 11. 계약을 지키는 방법

| 장치 | 무엇을 막나 |
| --- | --- |
| 공유 패키지에 요청 · 응답 Zod 스키마와 타입 | 프론트와 백엔드가 다른 모양을 가정하는 것 |
| 백엔드 통합 테스트가 **응답**도 스키마로 `parse` | 서버가 문서와 다른 키를 내려보내는 것 (예: `null` 대신 키 생략, 해시 노출) |
| 이 문서를 고치는 PR = 스키마를 고치는 PR | 문서와 코드가 어긋난 채 병합되는 것 [00 개요 7절] |
