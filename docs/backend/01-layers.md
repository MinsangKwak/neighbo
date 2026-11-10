# 백엔드 01 · 요청 계층

[백엔드 설계](README.md) · 다음: [02 데이터 모델](02-data-model.md)

**요청은 진입 → 인증 → 검증 → 컨트롤러 → 서비스 → 저장소 순서로 처리하도록 설계했습니다.** 인증 미들웨어는 토큰으로 요청자를 확인하고, 서비스는 자원을 조회해 소유권·권한·업무 규칙을 판단합니다. 각 계층의 책임과 오류 전달 경로는 아래와 같습니다.

## 계층과 각 계층의 질문

```
요청 ─▶ ① 진입 ─▶ ② 인증 ─▶ ③ 검증 ─▶ ④ 컨트롤러 ─▶ ⑤ 서비스(권한 · 규칙 · 트랜잭션) ─▶ ⑥ 저장소 ─▶ DB
                                                         │
          ◀──────────────── ⑦ 에러 처리 ◀──────────────── 어디서든 AppError
```

| 계층 | 답하는 질문 | 아는 것 | **모르는 것** | 실패 시 |
| --- | --- | --- | --- | --- |
| ① 진입 | 이 요청을 받아도 되나 | 헤더 · 본문 크기 · Origin | 사용자 | `413 PAYLOAD_TOO_LARGE` · `403 ORIGIN_MISMATCH` · `429 RATE_LIMITED` |
| ② 인증 | 누구인가 | 쿠키의 JWT, `User.tokenVersion` | 어떤 자원에 접근하려는지 | `requireAuth`: `401 UNAUTHORIZED` · `optionalAuth`: 비로그인으로 통과 |
| ③ 검증 | 요청 모양이 맞나 | Zod 스키마, 정규화 함수 | DB 상태 (중복 여부 등) | `400 VALIDATION_FAILED` + `fields` |
| ④ 컨트롤러 | 어느 서비스를 부를까 | `req` · `res` | 업무 규칙 | — (판단하지 않음) |
| ⑤ 서비스 | 이 사람이 이 자원에 이걸 해도 되나, 규칙상 가능한가 | 정책 함수 · 상태 전이 표 · 트랜잭션 | HTTP (`req` · `res` · 상태 코드) | `AppError(code)` 던짐 |
| ⑥ 저장소 | 어떻게 읽고 쓰나 | Prisma, `deletedAt` 자동 주입 | 업무 규칙 | DB 오류 → 서비스가 해석 (예: 유니크 위반 → `EMAIL_TAKEN`) |
| ⑦ 에러 처리 | 사용자에게 무엇을 돌려주나 | 에러 코드 카탈로그 | — | 알 수 없는 오류는 `500 INTERNAL` + 로그 |

## 계층별 책임과 선택 근거

### ① 진입 — 싸고 빠른 거절을 먼저

| 순서 | 미들웨어 | 이유 |
| --- | --- | --- |
| 1 | `requestId` — 프록시가 보낸 `X-Request-Id`를 쓰고 없으면 생성, 응답 헤더에도 | 로그 한 줄과 사용자 문의를 잇는 열쇠 ([08 관찰 가능성](08-observability.md)) |
| 2 | 보안 헤더 (`X-Content-Type-Options` · `Referrer-Policy` 등) | 응답 전부에 동일하게 |
| 3 | 본문 크기 1MB (`/uploads`만 4MB) | 파싱 전에 자른다. 크게 파싱한 뒤 거절하면 이미 메모리를 썼다 [AC-CM-34] |
| 4 | 쓰기 요청의 `Origin` 검사 | 쿠키 인증이라 CSRF 대비. 프록시는 브라우저의 `Origin`을 **그대로 넘긴다**(서버 쪽 `fetch`는 `Origin`을 붙이지 않으므로 명시적으로 복사). 허용 목록은 운영이면 프론트 도메인 하나, staging이면 Vercel 미리보기 주소 패턴(`^https://neighbo-[a-z0-9-]+-<팀>\.vercel\.app$`)까지 — PR마다 주소가 바뀌어 목록으로는 못 적는다 [AC-CM-31] |
| 5 | IP 단위 rate limit (인증 경로) | 인증 전에 막아야 bcrypt 비용을 아낀다. IP는 프록시가 비밀 헤더와 함께 넘긴 값만 믿는다 ([07 보호 장치](07-protection.md)) |

### ② 인증 — 두 모드, 토큰 검증 순서

`requireAuth`와 `optionalAuth` 두 가지만 둔다. 목록 · 상세는 `optionalAuth`라 비로그인도 통과하고, 로그인했으면 `viewer.isSeller` 같은 값을 계산할 수 있다 [결정 0011].

검증 순서: 쿠키 존재 → 서명 → 만료 → `sub`로 사용자 조회 → `ver === user.tokenVersion` → `req.user` 주입 → 남은 기간이 절반 아래면 새 쿠키 [AC-CM-03, 04]. 새 쿠키는 브라우저가 프록시로 부른 요청에서만 실제로 저장된다 — 프론트 서버 렌더의 요청은 `Set-Cookie`를 버린다([프론트 01](../frontend/01-rendering.md)). 사용자 조회를 생략하면 비밀번호 변경 후 옛 토큰을 막을 수 없어서(`tokenVersion`), 요청마다 기본키 조회 한 번을 감수한다.

`optionalAuth`에서 토큰이 만료 · 변조됐으면 **401을 내지 않고** 비로그인으로 처리하면서 쿠키 삭제 헤더를 보낸다. 상품을 보러 온 사람에게 "세션 만료"를 띄울 이유가 없다.

### ③ 검증 — 정규화가 먼저, 스키마는 공유

1. `normalizeEmail` · `normalizePassword` · `normalizeText`로 값을 정리하고 [AC-CM-62, 63]
2. 공유 패키지의 Zod 스키마로 `params` · `query` · `body`를 각각 검증
3. 실패한 필드 **전부**를 `fields`에 담는다 [AC-CM-11]

검증은 "모양"만 본다. 이메일 중복처럼 DB를 봐야 아는 것은 서비스에서 한다 — 검증 계층이 DB를 부르기 시작하면 순수 함수로 테스트할 수 없다.

### ④ 컨트롤러 — 얇게

`req`에서 값을 꺼내 서비스에 넘기고, 반환값을 상태 코드와 함께 응답한다. 분기 · 판단이 들어가면 서비스로 옮긴다. 상태 코드 선택(`200` vs `201`)도 서비스가 돌려준 `{ created: boolean }`을 보고 한다.

### ⑤ 서비스 — 권한은 여기서

**권한을 미들웨어가 아니라 서비스에서 판단하는 이유**: "이 상품의 주인인가"는 상품을 읽어야 안다. 미들웨어에서 읽으면 서비스가 또 읽거나 `req`에 실어 넘겨야 하고, 그 사이 상태가 바뀔 수 있다. 서비스가 트랜잭션 안에서 한 번 읽고 그 값으로 권한과 규칙을 함께 판단한다. 권한 판단은 정책 함수로 모은다 ([04 권한 매트릭스](04-authorization.md)):

```ts
// 정책 함수는 순수 함수 — DB를 부르지 않고 읽어 온 값만 판단
export function canChangeStatus(user: AuthUser, product: Product): PolicyResult
```

서비스는 HTTP를 모른다. `AppError('INVALID_TRANSITION')`을 던지면 상태 코드는 ⑦이 카탈로그에서 찾는다. 그래서 같은 서비스를 소켓 핸들러가 그대로 부를 수 있다 ([09 소켓 서버](09-socket-server.md)).

### ⑥ 저장소 — 삭제된 것을 실수로 보지 않게

Prisma 클라이언트 확장으로 `Product` 조회에 `deletedAt IS NULL`을 자동으로 넣는다. 삭제된 것까지 봐야 하는 곳은 `withDeleted()`를 명시하고, 그 사용처는 두 곳뿐이다 — 채팅방 · 채팅 목록의 상품 요약, 구매 내역 [AC-PX-05, 결정 0006]. 이 규칙을 지키는지 테스트로 확인한다 [AC-PL-16].

**자동 주입이 닿지 않는 곳 두 군데**: 클라이언트 확장의 쿼리 훅은 최상위 모델 호출에만 걸린다. ① `$queryRaw` · `$executeRaw`(T6 · T7의 `FOR SHARE` 등)는 SQL을 그대로 보내므로 확장이 보지 못한다 ② 다른 모델에서 관계로 따라 들어가는 조회(`user.findUnique({ include: { products: true } })`, 관계 `_count`)도 `Product` 훅을 거치지 않는다. 그래서 원시 SQL은 저장소 함수 안에서만 쓰고 삭제 조건을 직접 적으며, `Product`로 가는 관계 조회는 `where: { deletedAt: null }`을 명시한다. 통합 테스트는 "삭제된 상품 하나를 만든 뒤 모든 목록 · 개수 API에서 그 상품이 새지 않는지"를 엔드포인트마다 확인한다 — 규칙이 아니라 결과를 검사한다. 확인 과정은 [기술 노트](../tech/README.md) `prisma.md` ②.

저장소는 DB 오류를 그대로 올린다. 유니크 위반(`P2002`)을 `EMAIL_TAKEN`으로 바꾸는 것은 **어느 제약이 깨졌는지에 따라 의미가 다르므로** 서비스가 한다.

### ⑦ 에러 처리 — 코드 하나, 문구는 카탈로그

`AppError(code, fields?)` → 카탈로그에서 HTTP 상태 · 한국어 메시지를 찾아 `{ error: { code, message, fields } }`로 응답 [AC-CM-10]. `AppError`가 아닌 예외는 `500 INTERNAL`, 스택은 로그에만 [AC-CM-13]. 카탈로그는 [06 에러 코드](06-errors.md).

## 폴더 구조 (예정)

```
backend-node/src/
├─ app.ts                 # 미들웨어 조립 순서가 이 파일 한 곳에 보이게
├─ middleware/            # requestId · origin · rateLimit · auth · validate · errorHandler
├─ modules/
│  ├─ auth/               # route · controller · service · schema
│  ├─ products/
│  ├─ uploads/
│  ├─ chat/
│  └─ me/
├─ policies/              # 순수 권한 함수 + 테스트
├─ db/                    # Prisma 클라이언트 · 확장(soft delete) · 트랜잭션 헬퍼
├─ socket/                # 연결 미들웨어 · 이벤트 핸들러 (서비스를 재사용)
├─ storage/               # ImageStorage 인터페이스 · local · s3 구현
├─ jobs/                  # 정리 배치
└─ errors/                # AppError · 카탈로그
```

기능별 모듈(`modules/products/`) 안에 계층을 두는 이유: 상품 규칙을 고칠 때 열어야 할 파일이 한 폴더에 모인다. 계층별 최상위 폴더(`controllers/` · `services/`)는 파일 수가 늘면 한 기능을 고치려고 다섯 폴더를 오가게 된다.

## 버린 대안

| 대안 | 버린 이유 |
| --- | --- |
| 권한을 라우트 미들웨어로 (`requireOwner('product')`) | 자원을 두 번 읽거나 `req`로 넘겨야 함. 트랜잭션 밖에서 읽은 값으로 판단하면 경합 시 틀림 |
| 서비스가 `req` · `res`를 받음 | 소켓에서 재사용 불가, 테스트에 가짜 HTTP 객체가 필요 |
| 검증 계층에서 중복 확인까지 | 검증이 DB에 의존하면 스키마를 프론트와 공유할 수 없음 |
| NestJS의 가드 · 파이프 · 인터셉터 | 같은 계층이지만 데코레이터 뒤에 순서가 숨음. 지금은 `app.ts`에서 순서가 보이는 쪽 [결정 0001] |
