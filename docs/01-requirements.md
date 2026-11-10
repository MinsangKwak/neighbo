# 01 · 요구사항

[문서 목차](README.md) · 앞: [00 개요](00-overview.md) · [경우의 수](cases/README.md) · 다음: [백엔드 설계](backend/README.md) · [프론트엔드 설계](frontend/README.md)

**이 문서는 기능별 권한과 수용 조건을 정의하는 기준 명세입니다.** 각 기능은 유저 스토리, 권한, 수용 조건 순서로 구성했습니다. 수용 조건에는 [경우의 수](cases/README.md)의 ID를 연결했으며, 구현과 테스트는 이 조건을 기준으로 진행합니다.

표기: **AC-기능-번호** = 수용 조건. 근거 열 = [경우의 수](cases/README.md) ID · 결정 기록. 소켓 동작은 [`websocket.md`](tech/websocket.md) 스파이크로 확인한 뒤 확정했습니다.

**역할 열** — 같은 수용 조건을 두 역할이 각자 어떻게 맡는지 적습니다. 원칙은 하나입니다: **규칙은 백엔드가 강제하고, 프론트는 그 규칙을 사용자가 어기기 전에 알려 줍니다.** 프론트가 버튼을 숨겨도 백엔드는 같은 판단을 다시 하고, 백엔드가 거절해도 프론트는 사용자가 무엇을 할 수 있는지 보여줍니다. `—`는 그 역할이 할 일이 없다는 뜻입니다.

| 코드 | 프론트엔드 설계 | 코드 | 백엔드 설계 |
| --- | --- | --- | --- |
| F01 | [렌더링](frontend/01-rendering.md) | B01 | [요청 계층](backend/01-layers.md) |
| F02 | [상태 소유권](frontend/02-state.md) | B02 | [데이터 모델](backend/02-data-model.md) |
| F03 | [캐시 · 낙관적 갱신](frontend/03-cache.md) | B03 | [트랜잭션 경계](backend/03-transactions.md) (T1~T11) |
| F04 | [에러 경계](frontend/04-errors.md) | B04 | [권한 매트릭스](backend/04-authorization.md) |
| F05 | [폼](frontend/05-forms.md) | B05 | [멱등성](backend/05-idempotency.md) |
| F06 | [포커스 · 라이브 리전](frontend/06-focus.md) | B06 | [에러 코드](backend/06-errors.md) |
| F07 | [소켓 클라이언트](frontend/07-socket-client.md) | B07 | [보호 장치 · 배치](backend/07-protection.md) |
| | | B08 | [관찰 가능성](backend/08-observability.md) |
| | | B09 | [소켓 서버](backend/09-socket-server.md) |

---

## 0. 공통 요구사항

모든 기능에 적용됩니다. 기능별 절에서는 반복하지 않습니다.

### 0.1 인증 · 세션

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CM-01 | 로그인이 필요한 화면에 비로그인으로 접근하면 로그인 화면으로 보내고, 로그인 후 원래 URL로 돌아온다. `next`는 같은 오리진 경로만 허용한다 | 미들웨어가 쿠키 유무로 즉시 이동, 서버 컴포넌트가 `/me` 401이면 이동. `next`는 같은 오리진 경로만 [F01](frontend/01-rendering.md) | — (API는 401만 돌려줌) | CM-AU-01, LI-AU-03 |
| AC-CM-02 | 로그인이 필요한 API를 비로그인으로 호출하면 `401 UNAUTHORIZED`를 돌려준다 | 전역 401 처리 → 캐시 비우고 로그인 화면 [F04](frontend/04-errors.md) | `requireAuth`가 판정해 `401 UNAUTHORIZED` [B01](backend/01-layers.md) | CM-AU-02 |
| AC-CM-03 | 세션은 httpOnly 쿠키의 JWT이며 7일 동안 유효하고, 남은 기간이 절반 아래인 요청에서 새 쿠키로 연장된다. 연장은 브라우저가 부른 `/api/*` 응답에서만 일어난다 — 서버 컴포넌트는 쿠키를 쓸 수 없다 | `serverFetch()`는 백엔드의 `Set-Cookie`를 버린다. 로그인 상태의 모든 화면은 클라이언트에서 `/api/me/unread`를 부르므로 화면을 열기만 해도 연장된다 [F01](frontend/01-rendering.md) | JWT 발급 · httpOnly 쿠키 · 절반 아래면 응답에 새 쿠키 [B01](backend/01-layers.md) | CM-AU-04, LI-TK-01, LI-TK-04 |
| AC-CM-04 | 서명이 틀리거나 `tokenVersion`이 맞지 않는 토큰은 `401`이며 쿠키 삭제 헤더를 함께 보낸다 | 401이면 로그인 화면 [F04](frontend/04-errors.md) | 서명 · 만료 · `tokenVersion` 검증, 실패 시 401 + 쿠키 삭제 헤더 [B01](backend/01-layers.md) | CM-AU-05, LI-TK-05 |
| AC-CM-05 | 로그인 상태에서 로그인 · 회원가입 화면에 접근하면 홈으로 보낸다 | 미들웨어가 쿠키 있으면 홈으로 [F01](frontend/01-rendering.md) | — (막지 않음) | CM-AU-09 |
| AC-CM-06 | 서버는 요청 본문의 사용자 ID를 신뢰하지 않고 항상 토큰의 사용자 ID를 쓴다 | 본문에 사용자 ID를 넣지 않음 | `req.user.id`만 사용, 본문의 사용자 ID 무시 [B01](backend/01-layers.md) | CM-SEC-03 |

### 0.2 응답 형식

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CM-10 | 모든 에러 응답은 `{ error: { code, message, fields? } }` 모양이다. `code`는 대문자 스네이크, `message`는 한국어 | `apiFetch`가 `ApiError` 한 모양으로 변환 [F04](frontend/04-errors.md) | 에러 처리기가 카탈로그로 응답 [B06](backend/06-errors.md) | CM-ER-01 |
| AC-CM-11 | 검증 실패는 `400 VALIDATION_FAILED`이며 `fields`에 실패한 필드 전부가 담긴다 | `fields`를 각 칸에, 첫 오류 포커스 [F05](frontend/05-forms.md) | Zod 실패 필드 전부를 `fields`로 [B01](backend/01-layers.md) | CM-ER-02 |
| AC-CM-12 | 성공 응답은 자원을 그대로 담고(`{ product }`), 목록은 `{ items, nextCursor }`다 | 무한 쿼리가 `nextCursor`로 다음 페이지 판단 [F03](frontend/03-cache.md) | 직렬화 규칙 · `limit+1` 조회로 `nextCursor` 계산 | CM-ER-03 |
| AC-CM-13 | 예상 못 한 예외는 `500 INTERNAL`이며 스택은 응답에 없고 `X-Request-Id` 헤더가 있다 | 5xx 토스트에 요청 ID 앞 6자를 문의 번호로 [F04](frontend/04-errors.md) | `500 INTERNAL`, 스택은 로그에만, `X-Request-Id` 헤더 [B08](backend/08-observability.md) | CM-ER-04 |
| AC-CM-14 | 공개용 사용자 객체는 `id · nickname · avatarUrl · createdAt`만, 본인용은 `+ email`이며 어떤 응답에도 비밀번호 해시가 없다 | 공개용 · 본인용 타입을 구분해 사용 | 직렬화 함수 두 개만 존재, 해시는 어디에도 없음 [B07](backend/07-protection.md) | CM-SEC-07 |

### 0.3 화면 상태 · 네트워크

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CM-20 | 데이터를 불러오는 모든 화면은 로딩(스켈레톤) · 빈 상태 · 에러 상태 UI가 있다 | 경로마다 `loading.tsx` 스켈레톤 · 빈 상태 · 에러 컴포넌트 [F01](frontend/01-rendering.md) [F04](frontend/04-errors.md) | — | CM-NW-01, CM-NW-06 |
| AC-CM-21 | 조회 실패 시 본문 자리에 "불러오지 못했어요"와 [다시 시도]를 보여주고 헤더 · 내비는 유지한다 | 페이지 · 영역 에러 경계가 본문만 대체 [F04](frontend/04-errors.md) | — | CM-NW-01, CM-NW-02 |
| AC-CM-22 | 쓰기 실패 시 입력을 유지하고 토스트로 알리며, 재시도는 사용자가 누른다 | 입력 유지 · 토스트 · 자동 재시도 없음 [F03](frontend/03-cache.md) [F04](frontend/04-errors.md) | 재시도가 안전한 쓰기는 멱등 보장 [B05](backend/05-idempotency.md) | CM-NW-03 |
| AC-CM-23 | 없는 자원은 404 화면("찾을 수 없는 페이지예요" + [홈으로])과 404 상태 코드를 돌려준다 | `not-found.tsx` + `notFound()` [F04](frontend/04-errors.md) | `404 NOT_FOUND` (없음 · 삭제 · 비참여자) [B04](backend/04-authorization.md) | CM-NW-08 |
| AC-CM-24 | 제출 버튼은 첫 클릭에서 비활성 + 로딩이 되어 두 번 눌리지 않는다 | `submitting` 동안 버튼 비활성 [F05](frontend/05-forms.md) | 중복 요청이 와도 결과 하나 [B05](backend/05-idempotency.md) | CM-CC-01 |
| AC-CM-25 | 뒤로가기로 돌아온 화면은 캐시를 즉시 보여주고 백그라운드로 재조회한다 | 캐시 즉시 표시 + 백그라운드 재조회 [F03](frontend/03-cache.md) | — | CM-CC-05 |
| AC-CM-26 | `429`를 받으면 "잠시 후 다시 시도해 주세요" 토스트와 함께 `Retry-After` 동안 버튼이 비활성이다 | 전역 처리: 토스트 + `retryAfter`초 버튼 비활성 [F04](frontend/04-errors.md) | `429` + `Retry-After` [B07](backend/07-protection.md) | CM-NW-10 |

### 0.4 보안

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CM-30 | 사용자 입력은 원문 그대로 저장하고 출력 시 이스케이프한다. `dangerouslySetInnerHTML`을 쓰지 않는다 | React 이스케이프에 맡기고 `dangerouslySetInnerHTML` 금지(lint) | 원문 저장, HTML 태그 제거 안 함 | CM-SEC-01 |
| AC-CM-31 | 쿠키는 `HttpOnly; Secure; SameSite=Lax`이며 쓰기 API는 `Origin` 헤더를 검사한다. 허용 목록은 환경마다 다르고(staging은 Vercel 미리보기 주소 패턴), HTTP와 소켓이 같은 함수를 쓴다 | 같은 오리진 프록시로만 요청 [F01](frontend/01-rendering.md) | 쿠키 속성 · 쓰기 요청 `Origin` 검사 [B01](backend/01-layers.md) | CM-SEC-02 |
| AC-CM-32 | 로그인 · 회원가입 · 이메일/닉네임 중복 확인은 IP당 분당 10회, 그 외 쓰기 API는 사용자당 분당 30회를 넘으면 `429`다 | 429 처리 [F04](frontend/04-errors.md) | 경로별 rate limit (IP · 사용자) [B07](backend/07-protection.md) | CM-SEC-04, CM-SEC-05 |
| AC-CM-33 | 업로드 파일은 매직 바이트로 형식을 검사하고 불일치면 `400 INVALID_FILE`이다 | — (확장자 검사는 편의) | 매직 바이트 검사 [B07](backend/07-protection.md) | CM-SEC-06 |
| AC-CM-34 | 요청 본문은 1MB, 이미지 업로드는 장당 4MB를 넘으면 `413`이다. 4MB는 업로드가 지나는 Vercel 프록시의 요청 본문 한도(4.5MB) 아래로 잡은 값이다 | 업로드 전 클라이언트 재인코딩으로 한도 아래로 [F05](frontend/05-forms.md) | 본문 1MB · 업로드 4MB, 스트림에서 차단 [B07](backend/07-protection.md) | CM-SEC-10, PC-IM-06, 트러블슈팅 T-04 |
| AC-CM-35 | 외부에 노출되는 모든 ID는 추측 불가능한 형식(cuid)이다 | ID를 해석하지 않고 불투명 문자열로 다룸 | Prisma `cuid()` [B02](backend/02-data-model.md) | CM-DT-10 |

### 0.5 접근성 · 화면

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CM-40 | 모든 조작 요소에 Tab으로 도달할 수 있고, 순서는 시각 순서와 같으며, 포커스 링이 3:1 이상으로 보인다 | Tab 순서 · `focus-visible` 포커스 링 [F06](frontend/06-focus.md) | — | CM-A11Y-01 |
| AC-CM-41 | 페이지 전환 후 포커스가 `h1`로 이동한다 | `<RouteFocus />`가 경로 변화 시 `h1` 포커스 [F06](frontend/06-focus.md) | — | CM-A11Y-02 |
| AC-CM-42 | 모달 · 바텀시트는 포커스를 가두고 Esc로 닫히며 닫힌 뒤 열었던 요소로 돌아간다 | 네이티브 `<dialog>` + 연 요소 복귀 [F06](frontend/06-focus.md) | — | CM-A11Y-03 |
| AC-CM-43 | 토스트는 `role="status"`, 에러 토스트는 `role="alert"`이며 호버 · 포커스 중에는 사라지지 않는다 | 토스트 영역 역할 · 호버/포커스 시 정지 [F06](frontend/06-focus.md) | — | CM-A11Y-04 |
| AC-CM-44 | 폼 오류는 `aria-describedby`로 필드에 연결되고 `aria-invalid`가 설정되며 제출 시 첫 오류 필드로 포커스가 간다 | `<Field>`가 `aria-*`를 자동 연결 [F05](frontend/05-forms.md) | `fields`로 칸별 문구 제공 [B06](backend/06-errors.md) | CM-A11Y-05 |
| AC-CM-45 | 아이콘만 있는 버튼은 `aria-label`이 있고, 상품 사진 `alt`는 상품 제목, 아바타 `alt`는 닉네임이다 | 아이콘 버튼 `aria-label`, 이미지 `alt` 규칙 | 상품 제목 · 닉네임을 응답에 포함 | CM-A11Y-06, CM-A11Y-07 |
| AC-CM-46 | 본문 텍스트 명암비 4.5:1, UI 경계 3:1을 만족하고 색만으로 상태를 전달하지 않는다 | Tailwind 토큰 조합 명암비 표 · 상태에 텍스트 병행 | — | CM-A11Y-09, CM-A11Y-11 |
| AC-CM-47 | 페이지 이동은 `<a>`, 동작은 `<button>`이며 `div onClick`이 없다 | 링크 · 버튼 구분 (lint) | — | CM-A11Y-12 |
| AC-CM-48 | 360px에서 가로 스크롤 없이 동작하고, 1024px 이상에서는 본문이 640px 중앙 정렬이며, 터치 대상은 44×44px 이상이다 | 640px 컨테이너 · 360px 기준 레이아웃 · 44px 터치 대상 | — | CM-UI-01, CM-UI-02, CM-UI-04 |
| AC-CM-49 | 200% 확대에서 가로 스크롤 없이 모든 내용에 접근할 수 있고 `prefers-reduced-motion`에서 애니메이션이 제거된다 | 상대 단위 · `prefers-reduced-motion` [F06](frontend/06-focus.md) | — | CM-A11Y-08, CM-A11Y-09 |

### 0.6 데이터 규칙

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CM-50 | 시각은 UTC로 저장하고 브라우저 로컬로 표시하며, 상대 시간 규칙(방금 전 · N분 전 · N시간 전 · N일 전 · M월 D일 · YYYY년 M월 D일)을 따른다 | `Intl` 기반 상대 시간 함수 하나 | `timestamptz` UTC 저장 · ISO 문자열 응답 [B02](backend/02-data-model.md) | CM-DT-01, CM-DT-02 |
| AC-CM-51 | 금액은 천 단위 콤마 + "원"이고 0원은 "나눔"으로 표시한다 | 가격 표시 함수 하나 (0 → "나눔") | 정수 원 단위 저장 | CM-DT-04 |
| AC-CM-52 | 문자열은 서버에서 앞뒤 공백과 제로폭 문자를 제거한 뒤 검증 · 저장한다. 비밀번호는 1.2절 규칙을 따른다 | 칸을 떠날 때 같은 정규화 [F05](frontend/05-forms.md) | 검증 전 정규화 [B01](backend/01-layers.md) | CM-DT-11, CM-IN-04 |
| AC-CM-53 | 길이 제한은 grapheme 기준이며 프론트 · 서버가 같은 함수를 쓴다 | 카운터 · 칸 검증에 공유 함수 | 공유 스키마로 검증, DB엔 넉넉한 CHECK [B02](backend/02-data-model.md) | CM-DT-12 |
| AC-CM-54 | 설명 · 메시지의 줄바꿈은 보존하되 3줄을 넘는 연속 줄바꿈은 2줄로 줄인다 | 줄바꿈 보존 표시 (`white-space: pre-wrap`) | `normalizeText`가 연속 줄바꿈 축소 | CM-DT-13 |

### 0.7 입력 처리

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CM-60 | 정답이 하나뿐인 입력은 `inputmode` · `autocapitalize` · `autocorrect` · `spellcheck` · 최대 길이로 애초에 잘못 입력되지 않게 한다 | 칸 종류별 입력 속성 묶음 [F05](frontend/05-forms.md) | — | CM-IN-01 |
| AC-CM-61 | 친 글자를 말없이 지우지 않고, 한글 조합 중에는 입력을 막지 않는다. 길이 제한은 카운터와 함께 보여준다 | `isComposing` 중 판단 안 함, 카운터 표시 [F05](frontend/05-forms.md) | — | CM-IN-02, 03 |
| AC-CM-62 | 앞뒤 공백 · 제로폭 문자처럼 의도하지 않은 게 확실한 것은 칸을 떠날 때 고치고, 칸 안의 값도 고친 값으로 바꿔 보여준다 | blur 시 정규화 값으로 칸 교체 [F05](frontend/05-forms.md) | 같은 정규화를 최종 적용 [B01](backend/01-layers.md) | CM-IN-04 |
| AC-CM-63 | `normalizeEmail()` · `normalizePassword()` · `normalizeText()`는 공유 패키지 하나에 있고 프론트와 서버가 같은 함수를 쓴다 | 공유 패키지 import | 공유 패키지 import | CM-IN-06 |
| AC-CM-64 | 붙여넣은 값에도 같은 정규화를 적용하고, 길이를 넘으면 잘라내며 "N자까지 입력할 수 있어요"를 알린다 | 붙여넣기 처리 · 잘라냄 안내 [F05](frontend/05-forms.md) | 길이 검증으로 최종 거절 | CM-IN-07 |
| AC-CM-65 | 모든 폼 칸에 알맞은 `autocomplete` 값이 있다 | `<Field>` 종류별 `autocomplete` [F05](frontend/05-forms.md) | — | CM-IN-08 |

---

## 1. 회원가입

**유저 스토리** — 처음 온 사람으로서, 이메일 · 비밀번호 · 닉네임만으로 계정을 만들고 바로 쓰기 시작하고 싶다.

**권한** — 비로그인만. 로그인 상태면 홈으로.

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-SU-01 | 이메일 · 비밀번호 · 비밀번호 확인 · 닉네임이 모두 유효하면 `201`과 쿠키를 받고 "환영해요, {닉네임}님" 토스트 후 홈(또는 `next`)으로 이동한다 | 성공 시 캐시 비우고 `next`로 `replace`, 환영 토스트 [F02](frontend/02-state.md) | T1 INSERT · 쿠키 발급 · `201` [B03](backend/03-transactions.md) | SU-OK-01 |
| AC-SU-02 | 가입 직후 사용자는 상품 0개 · 채팅방 0개 · 기본 아바타다 | — | 기본값 (`avatarUrl` null 등) [B02](backend/02-data-model.md) | SU-OK-02 |
| AC-SU-03 | 검증은 필드를 떠날 때 실행되고 오류가 있던 필드는 입력마다 재검증된다 | `useForm` blur 검증 · 오류 칸 재검증 [F05](frontend/05-forms.md) | — | SU-OK-03 |
| AC-SU-04 | 제출 버튼은 항상 활성이며 누르면 전체 검증 후 첫 오류로 포커스한다 | 버튼 항상 활성 · 전체 검증 · 첫 오류 포커스 [F05](frontend/05-forms.md) | — | SU-OK-04 |
| AC-SU-05 | 이메일은 비면 "이메일을 입력해 주세요", 형식이 틀리면 "이메일 형식이 아니에요", 254자를 넘으면 "이메일이 너무 길어요"다 | 공유 스키마 문구 표시 | 같은 스키마로 최종 검증 | SU-IN-01, 02, 05 |
| AC-SU-06 | 이메일은 `normalizeEmail()`로 앞뒤 공백 · 제로폭 문자 제거 → NFKC(전각→반각) → 소문자 순으로 정규화해 저장 · 비교하고, 정규화 후 ASCII만 허용한다 | blur 시 `normalizeEmail` 결과로 칸 교체 | `normalizeEmail` 후 저장 · 비교 [B02](backend/02-data-model.md) | SU-IN-03, 04, 06, 12, 13 |
| AC-SU-06a | 이메일 칸은 `type="email"` · `inputmode="email"` · `autocapitalize="off"` · `autocorrect="off"` · `spellcheck="false"` · 254자다 | `<Field kind="email">` 속성 묶음 [F05](frontend/05-forms.md) | — | SU-IN-14 |
| AC-SU-07 | 이미 가입된 이메일은 `409 EMAIL_TAKEN`이며 필드 오류에 [로그인하기] 링크가 있다 | 이메일 칸 오류 + [로그인하기] [F04](frontend/04-errors.md) | 유니크 위반 → `409 EMAIL_TAKEN` [B03](backend/03-transactions.md) [B06](backend/06-errors.md) | SU-IN-09 |
| AC-SU-08 | 이메일 칸을 떠나면 `GET /auth/email-available`로 중복을 미리 알리되, 실패하면 조용히 넘어가고 제출 시 서버가 최종 판단한다 | blur 시 미리 확인, 실패는 무시 [F05](frontend/05-forms.md) | `email-available` + IP rate limit [B07](backend/07-protection.md) | SU-IN-10, 11, SU-CC-03 |
| AC-SU-09 | 비밀번호는 8자 이상 64자 이하이며 문자 종류 규칙은 없고, 상위 1만 개 흔한 비밀번호와 이메일 · 닉네임과 같은 값은 거부한다 | 공유 스키마로 길이 안내 | 흔한 비밀번호 1만 개 · 이메일/닉네임 동일 검사 [B07](backend/07-protection.md) | SU-IN-21, 22, 23, 25 |
| AC-SU-09a | 비밀번호 앞뒤에 공백이 있으면 "비밀번호 앞뒤에 공백을 넣을 수 없어요"로 거부하고, 중간 공백은 허용한다 | 앞뒤 공백 오류 표시 (값은 고치지 않음) | 같은 규칙으로 거부 | SU-IN-24 |
| AC-SU-09b | 비밀번호는 `normalizePassword()`로 제로폭 문자 제거 + NFC 정규화 후 해시한다 | — | `normalizePassword` 후 bcrypt 12 [B07](backend/07-protection.md) | SU-IN-30, 32 |
| AC-SU-10 | 비밀번호 확인이 다르면 확인 칸에 "비밀번호가 일치하지 않아요"가 뜨고, 원본을 고치면 확인 칸도 재검증된다 | `superRefine` 결과를 확인 칸에, 원본 변경 시 재검증 [F05](frontend/05-forms.md) | 같은 교차 검증 | SU-IN-27 |
| AC-SU-11 | 비밀번호 보기 토글은 `aria-pressed`를 갖고, 칸은 `autocomplete="new-password"`다 | 토글 `aria-pressed` · `new-password` [F05](frontend/05-forms.md) | — | SU-IN-26, 29 |
| AC-SU-12 | 비밀번호 규칙은 입력 전부터 칸 아래에 보인다 | `hint`를 처음부터 표시 · `describedby` [F05](frontend/05-forms.md) | — | SU-A11Y-03 |
| AC-SU-13 | 닉네임은 2~12자(grapheme), 한글 · 영문 · 숫자 · 중간 공백 · `_ . -`만 허용하고 이모지는 거부한다. 허용 안 된 문자는 친 순간 막지 않고 칸을 떠날 때 알리며, 허용 문자 안내는 처음부터 보인다 | blur 검증, 친 순간 막지 않음, 허용 문자 안내 [F05](frontend/05-forms.md) | 같은 스키마로 거부 | SU-IN-41~43, 51 |
| AC-SU-14 | 닉네임은 소문자 정규화로 중복을 판단하고(`Kim` = `kim`) 표시는 입력한 대로 한다. 중복이면 `409 NICKNAME_TAKEN` | 칸 오류 [F04](frontend/04-errors.md) | `nicknameLower` 유니크 → `409 NICKNAME_TAKEN` [B02](backend/02-data-model.md) | SU-IN-45, 46 |
| AC-SU-15 | `관리자` · `neighbo` 등 소규모 금칙어 목록은 "사용할 수 없는 닉네임이에요"로 거부한다 | 서버 `fields` 표시 | 금칙어 목록 검사 | SU-IN-48 |
| AC-SU-16 | 닉네임 칸을 떠나면 이메일과 같은 방식으로 중복을 미리 알린다 | blur 시 미리 확인 [F05](frontend/05-forms.md) | `nickname-available` + IP rate limit | SU-IN-50 |
| AC-SU-17 | 여러 필드가 동시에 틀리면 모두 표시하고 상단 요약 "입력 내용 N곳을 확인해 주세요"를 `role="alert"`로 알린다 | 모든 오류 표시 · 상단 요약 `role="alert"` [F05](frontend/05-forms.md) [F06](frontend/06-focus.md) | 실패 필드 전부 반환 | SU-IN-60, SU-A11Y-02 |
| AC-SU-18 | 서버 검증 결과가 프론트와 다르면 서버의 `fields`를 그대로 각 필드에 표시한다 | 서버 `fields`가 최종 [F05](frontend/05-forms.md) | 최종 검증자 | SU-IN-61 |
| AC-SU-19 | 약관 체크박스는 없고 버튼 아래 한 줄 안내 문구만 있다 | 안내 문구 한 줄 | — | SU-IN-62 |
| AC-SU-20 | 같은 이메일로 동시에 가입하면 DB 유니크 제약으로 한쪽만 성공하고 다른 쪽은 `409`다 | 409 처리 | 유니크 제약이 한쪽만 통과 [B03](backend/03-transactions.md) | SU-CC-02 |
| AC-SU-21 | 제출 중 끊긴 뒤 재시도해서 `409`가 오면 "이미 가입됐어요. 로그인해 주세요"로 안내를 바꾼다 | 재시도 후 409면 안내 문구 전환 | — (409만 돌려줌) [B05](backend/05-idempotency.md) | SU-NW-01 |
| AC-SU-22 | 가입 성공 후 뒤로가기로 가입 화면에 돌아오지 않는다 | `router.replace` | — | SU-AU-02 |
| AC-SU-23 | 저장 필드는 `email(소문자) · passwordHash(bcrypt cost 12) · nickname · nicknameLower(유니크) · avatarUrl(null) · tokenVersion(0)`이다 | — | 스키마대로 저장 [B02](backend/02-data-model.md) | SU-DT-01 |

범위 밖: 휴대폰 · 동네 인증, 만 14세 확인, 가입 시 프로필 사진, 이메일 변경, 비밀번호 찾기 [SU-IN-63~65, SU-DT-05, 06].

---

## 2. 로그인 · 로그아웃

**유저 스토리** — 가입한 사람으로서, 이메일 · 비밀번호로 들어가서 7일 동안은 다시 묻지 않았으면 한다. 끝나면 로그아웃하고 싶다.

**권한** — 로그인: 비로그인만. 로그아웃: 로그인만.

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-LI-01 | 올바른 이메일 · 비밀번호로 `200`과 쿠키를 받고 홈(또는 `next`)으로 이동한다. 토스트는 없다 | 캐시 비우기 → `next`로 `replace` → `refresh` [F02](frontend/02-state.md) | 비교 · 쿠키 발급 · `200` | LI-OK-01 |
| AC-LI-02 | 이메일 대소문자가 달라도 로그인된다 | — | `normalizeEmail` 후 조회 | LI-OK-02 |
| AC-LI-03 | 새로고침하면 서버 렌더 시점에 로그인 상태로 그려져 깜빡임이 없다 | 루트 레이아웃이 서버에서 `/me` → `['me']` 하이드레이트 [F01](frontend/01-rendering.md) [F02](frontend/02-state.md) | `/me`가 쿠키로 사용자 반환 | LI-OK-04 |
| AC-LI-04 | 브라우저를 닫았다 열어도 7일 안이면 로그인이 유지된다. "로그인 유지" 체크박스는 없다 | 체크박스 없음 | 쿠키 `Max-Age` 7일 [B01](backend/01-layers.md) | LI-OK-05 |
| AC-LI-05 | 이메일 형식 · 비어 있음은 서버 호출 전에 막고, 비밀번호 규칙은 로그인 화면에서 검증하지 않는다 | 형식 · 비어 있음만 사전 검증 | — | LI-IN-01~04 |
| AC-LI-05a | 이메일은 가입과 같은 `normalizeEmail()`로 정규화해 비교한다 — 앞뒤 공백 · 제로폭 문자 · 전각 · 대문자가 섞여도 로그인된다 | blur 시 정규화 표시 | 같은 정규화 후 조회 | LI-IN-08, 11 |
| AC-LI-05b | 비밀번호는 `normalizePassword()`로 앞뒤 공백 제거 + 제로폭 제거 + NFC 후 비교한다. 가입에서 앞뒤 공백을 거부하므로 안전하다 | — | `normalizePassword`(앞뒤 공백 제거) 후 비교 | LI-IN-08, 13, SU-IN-24 |
| AC-LI-05c | 이메일 칸은 AC-SU-06a와 같고, 비밀번호 칸은 `autocomplete="current-password"` · `autocapitalize="off"` · `spellcheck="false"`다 | `<Field>` 속성 묶음 [F05](frontend/05-forms.md) | — | LI-IN-12 |
| AC-LI-06 | 없는 이메일과 틀린 비밀번호는 같은 `401 INVALID_CREDENTIALS`와 같은 문구 "이메일 또는 비밀번호가 맞지 않아요"를 돌려주며, 없는 이메일에도 더미 해시 비교를 수행해 응답 시간이 같다 | 폼 상단 문구 (전역 401 처리를 타지 않음) [F04](frontend/04-errors.md) | 같은 코드 · 문구 · 더미 해시로 응답 시간 평탄화 [B06](backend/06-errors.md) [B07](backend/07-protection.md) | LI-IN-05, 06, CM-SEC-08 |
| AC-LI-07 | 실패 후 비밀번호 칸은 비우고 포커스하며 이메일은 유지한다. 실패 문구는 `role="alert"`다 | 비밀번호 칸 비우고 포커스, `role="alert"` [F06](frontend/06-focus.md) | — | LI-IN-07, LI-A11Y-01 |
| AC-LI-08 | Caps Lock이 켜져 있으면 비밀번호 칸 아래 안내가 뜬다 | `getModifierState('CapsLock')` 안내 | — | LI-IN-10 |
| AC-LI-09 | 로그인 직후 뒤로가기로 로그인 화면에 돌아오지 않는다 | `router.replace` | — | LI-AU-02 |
| AC-LI-10 | `next`가 외부 URL이거나 로그인 · 가입 화면이면 홈으로 간다 | `next` 검증 함수 (같은 오리진 경로 · 인증 화면 제외) | — | LI-AU-03, 04 |
| AC-LI-11 | 계정 잠금은 없고 IP rate limit만 적용된다 | 429 처리 | IP rate limit만, 계정 잠금 없음 [B07](backend/07-protection.md) | LI-ST-01 |
| AC-LI-12 | 로그아웃 버튼은 마이페이지 하단에 있고, 누르면 확인 없이 `POST /auth/logout` → 쿠키 삭제 → 홈 이동 → "로그아웃했어요" 토스트다 | 마이페이지 하단 버튼 · 확인 없이 호출 · 토스트 | 쿠키 삭제 · 쿠키 없어도 `204` [B05](backend/05-idempotency.md) | LI-LO-01, 02 |
| AC-LI-13 | 로그아웃 시 클라이언트 캐시를 전부 비우고 소켓을 끊으며 배지를 0으로 한다. 보호 화면은 `Cache-Control: no-store`다 | 소켓 끊기 → `queryClient.clear()` [F02](frontend/02-state.md) [F07](frontend/07-socket-client.md) | 보호 응답 `Cache-Control: no-store` | LI-LO-03, 04 |
| AC-LI-14 | 한 탭에서 로그아웃하면 다른 탭은 `storage` 이벤트로 즉시 로그인 화면으로 간다 | `storage` 이벤트 감지 → 로그인 화면 [F02](frontend/02-state.md) | — | LI-LO-06 |
| AC-LI-15 | 두 탭에서 다른 계정으로 로그인하면 먼저 탭에 "다른 계정으로 로그인됐어요. 새로고침해 주세요" 안내가 뜬다 | `storage`의 사용자 id 비교 → 안내 [F02](frontend/02-state.md) | — | LI-CC-02 |
| AC-LI-16 | 제출 중 끊기면 비밀번호 칸을 유지한다 | 끊김 시 비밀번호 칸 유지 | — | LI-NW-01 |
| AC-LI-17 | 토큰 페이로드는 `sub · ver · iat · exp`만이다 | — | 페이로드 `sub · ver · iat · exp` [B01](backend/01-layers.md) | LI-TK-03 |
| AC-LI-18 | 프론트는 `/api/*`를 Next.js Route Handler로 백엔드에 프록시해 브라우저는 같은 오리진하고만 통신한다 | `/api/[...path]` Route Handler 프록시 · 요청 ID 생성 [F01](frontend/01-rendering.md) | 프록시를 유일한 HTTP 출처로 CORS 없음 [B08](backend/08-observability.md) | LI-TK-02 |
| AC-LI-18a | 소켓은 프록시하지 않고 백엔드에 직접 연결하며, 인증은 같은 오리진의 `/api/auth/socket-token`이 발급한 60초짜리 소켓 전용 토큰을 `auth`로 넘긴다. 재연결마다 새 토큰을 받는다 | 연결마다 `/api/auth/socket-token` → `auth` [F07](frontend/07-socket-client.md) | 60초 `purpose: socket` 토큰 발급 · 핸드셰이크 검증 [B09](backend/09-socket-server.md) | LI-TK-07, 결정 0004 |
| AC-LI-19 | 로그인 폼 아래에 데모 계정 안내와 [채워 넣기] 버튼이 있다 | 안내 + [채워 넣기] | 데모 계정 시드 (Staging · Production) | LI-UI-04 |
| AC-LI-20 | 로그인 시 `User.lastLoginAt`을 갱신한다 | — | 로그인 시 `lastLoginAt` 갱신 | LI-DT-01 |

범위 밖: 비밀번호 찾기 링크, 소셜 로그인, 다른 기기 모두 로그아웃, 로그인 이력 [LI-UI-02, 03, LI-LO-07, LI-DT-02].

---

## 3. 중고 목록

**유저 스토리** — 누구든(비로그인 포함), 동네에 올라온 물건을 최신순으로 훑어보고 마음에 드는 것을 눌러 자세히 보고 싶다.

**권한** — 비로그인 열람 가능 [결정 0011]. 등록 버튼은 로그인 필요.

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-PL-01 | 홈은 삭제되지 않은 상품 20개를 `createdAt DESC`로 서버 렌더하고, 카드는 대표 사진 · 제목(2줄 말줄임) · 가격 · 상태 배지 · 상대 시간 · 채팅 수를 보여준다 | 서버에서 첫 20개 → 같은 키로 하이드레이트 · 카드 [F01](frontend/01-rendering.md) | `(deletedAt, createdAt, id)` 인덱스 · 채팅 수 집계 [B02](backend/02-data-model.md) | PL-OK-01, 02 |
| AC-PL-02 | 판매중 · 예약중 · 거래완료를 모두 포함하되 거래완료 카드는 60% 투명 + 배지이며 클릭은 가능하다 | 거래완료 카드 투명도 · 배지 텍스트 | 상태 무관 포함 | PL-OK-03, PL-UI-05 |
| AC-PL-03 | 목록 끝의 [더 보기]를 누르면 커서 `(createdAt, id)`로 다음 20개를 붙이고, 새로 붙은 첫 카드로 포커스가 이동하며 "N개 더 불러왔어요"를 `aria-live`로 알린다. `nextCursor`가 null이면 버튼이 없다 | `useInfiniteQuery` · 새 첫 카드 포커스 · 라이브 리전 [F03](frontend/03-cache.md) [F06](frontend/06-focus.md) | 복합 커서 인코딩 · `limit+1` [B02](backend/02-data-model.md) | PL-OK-04~06, PL-DT-02, PL-A11Y-03 |
| AC-PL-04 | `limit`은 최대 50으로 클램프하고 조작된 커서는 `400 INVALID_CURSOR`다 | `INVALID_CURSOR`면 첫 페이지로 조용히 [F04](frontend/04-errors.md) | `limit` 클램프 · 커서 디코드 실패 400 [B07](backend/07-protection.md) | PL-SEC-01, 02 |
| AC-PL-05 | 카드 전체가 하나의 `<a>`이며 안에 중첩 버튼이 없다. 접근 가능한 이름은 제목 → 가격 → 상태 → 시간 순이다 | 카드 = `<a>` 하나, 이름 순서 | — | PL-OK-07, PL-A11Y-01 |
| AC-PL-06 | 360px · 640px 모두 2열 그리드다 | `grid-cols-2` | — | PL-UI-01, 02 |
| AC-PL-07 | 플로팅 `+` 버튼(1024px에서는 헤더 [판매하기])은 `aria-label="물건 올리기"`이며 비로그인이면 로그인으로 보낸다 | 버튼 · 비로그인 시 로그인으로 | — | PL-OK-08, PL-A11Y-05 |
| AC-PL-08 | 뒤로가기로 돌아오면 스크롤 위치와 불러온 페이지가 복원된다 | 무한 쿼리 캐시 + 스크롤 복원 [F03](frontend/03-cache.md) | 커서가 안정적이라 같은 페이지 재현 | PL-OK-09 |
| AC-PL-09 | 사진 없는 상품은 플레이스홀더, 사진은 1:1 `cover` 썸네일(400px)이고 첫 6장은 우선 로드다 | `next/image` · 플레이스홀더 · 첫 6장 `priority` [F01](frontend/01-rendering.md) | 400px 썸네일 URL 제공 [B07](backend/07-protection.md) | PL-OK-12~14 |
| AC-PL-10 | 상품 0개면 "아직 올라온 물건이 없어요"와 (로그인 시) [첫 물건 올리기]를 보여준다 | 빈 상태 컴포넌트 | — | PL-DT-01 |
| AC-PL-11 | 채팅 수는 0이면 숨기고 100 이상은 `99+`다 | 0 숨김 · `99+` 표시 | 방 수 집계 | PL-DT-08, 09 |
| AC-PL-12 | 헤더 검색으로 제목을 `ILIKE` 검색한다. 2자 미만은 "2자 이상 입력해 주세요", `%` `_`는 이스케이프, 결과 없음은 "'{q}'에 대한 검색 결과가 없어요", 검색어는 `?q=`에 반영된다 | 검색 화면 · 2자 미만 안내 · `?q=` [F02](frontend/02-state.md) | `ILIKE` · `%` `_` 이스케이프 [B02](backend/02-data-model.md) | PL-FL-01~05 |
| AC-PL-13 | "거래완료 숨기기" 토글(`?hideSold=1`)이 있고 기본은 꺼짐이다 | URL `hideSold` → 쿼리 키 [F02](frontend/02-state.md) | `status <> SOLD` 필터 | PL-FL-08 |
| AC-PL-14 | 내가 등록 · 삭제하고 홈으로 돌아오면 목록 캐시가 즉시 반영된다 | 등록 · 삭제 성공 시 목록 무효화 · 제거 [F03](frontend/03-cache.md) | — | PL-CC-04, 05 |
| AC-PL-15 | [더 보기] 실패 시 기존 항목은 유지하고 버튼 자리에 "불러오지 못했어요 [다시 시도]"가 뜬다 | 영역 에러 · 기존 항목 유지 [F04](frontend/04-errors.md) | — | PL-NW-02 |
| AC-PL-16 | 목록 API 응답에 삭제된 상품이 포함되지 않음을 테스트로 보장한다 | — | soft delete 자동 주입 + 통합 테스트 [B01](backend/01-layers.md) | PL-SEC-03 |

범위 밖: 카테고리 · 가격 필터 · 정렬 변경 · 거리 필터 · 커스텀 pull-to-refresh [PL-FL-06, 07, 09, 10, PL-CC-02].

---

## 4. 거래 등록 · 수정

**유저 스토리** — 판매자로서, 사진 몇 장과 제목 · 가격 · 설명으로 1분 안에 물건을 올리고, 나중에 오타나 가격을 고치고 싶다.

**권한** — 등록: 로그인. 수정: 작성자만 (화면 404 · API 403) [PC-AU-03].

### 4.1 등록

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-PC-01 | `/products/new`에서 사진(0~10장) · 제목 · 가격 · 나눔 토글 · 설명을 입력하고 [등록하기]를 누르면 `201` 후 상세로 `replace` 이동하고 "물건을 올렸어요" 토스트가 뜬다 | 폼 · 성공 시 `replace` · 토스트 [F05](frontend/05-forms.md) | T2 [B03](backend/03-transactions.md) | PC-OK-01, 02 |
| AC-PC-02 | 사진 없이도 등록할 수 있다 | 사진 0장 허용 | `imageIds` 빈 배열 허용 | PC-OK-04 |
| AC-PC-03 | 상품은 항상 `판매중`으로 생성된다 | 상태 선택 UI 없음 | 항상 `ON_SALE`로 생성 | PC-OK-05 |
| AC-PC-04 | 내용이 하나라도 있는 상태에서 이탈하면 "작성 중인 내용이 사라져요. 나갈까요?" 확인이 뜬다 | `useLeaveGuard` 세 경로 [F05](frontend/05-forms.md) | — | PC-OK-07 |
| AC-PC-05 | 제목은 2~40자이며 `maxLength`와 `12/40` 카운터가 있고 줄바꿈은 공백으로 치환된다 | 카운터 · 줄바꿈 → 공백 [F05](frontend/05-forms.md) | 같은 스키마 | PC-IN-01~05 |
| AC-PC-06 | 가격은 `inputmode="numeric"`, 입력 중 천 단위 콤마, 정수 0~100,000,000이며 나눔 토글을 켜면 0으로 고정되고 칸이 비활성이다 | 숫자 입력 · 콤마(커서 보존) · 나눔 토글 [F05](frontend/05-forms.md) | 스키마 + CHECK `0~1억` [B02](backend/02-data-model.md) | PC-IN-10~16 |
| AC-PC-07 | 설명은 비어도 되고 2,000자까지이며 자동 높이(5줄~화면 50%)다. URL은 자동 링크하지 않는다 | 자동 높이 · 평문 표시 | 같은 스키마 | PC-IN-20~24 |
| AC-PC-08 | 폼에 `idempotencyKey`(uuid)가 있어 같은 키의 두 번째 등록 요청은 기존 상품을 `200`으로 돌려준다 | 폼 마운트 시 uuid 생성 · 재시도에도 같은 값 [F02](frontend/02-state.md) | `(sellerId, idempotencyKey)` 유니크 · 기존 반환 [B05](backend/05-idempotency.md) | PC-CC-01, PC-NW-04 |
| AC-PC-09 | 등록 응답을 못 받고 재시도해도 상품이 중복되지 않는다 | 같은 키로 재시도 | 멱등 처리 [B05](backend/05-idempotency.md) | PC-NW-04 |

### 4.2 사진

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-PC-10 | 사진은 선택 즉시 `POST /uploads`로 올라가고(동시 3개) 썸네일 위에 진행률이 보이며, 등록 요청은 `imageIds`만 보낸다 | 선택 즉시 업로드 · 동시 3 · 진행률 [F05](frontend/05-forms.md) | `POST /uploads` · 처리 대기열 동시 2 [B07](backend/07-protection.md) | PC-OK-03, PC-IM-15, PC-CC-02 |
| AC-PC-11 | 최대 10장이며 11장째는 "사진은 10장까지 올릴 수 있어요"와 함께 앞 10장만 채택한다 | 10장 초과 안내 · 앞 10장 채택 | `imageIds` 10개 초과 거부 | PC-IM-02 |
| AC-PC-12 | 서버는 `jpeg · png · webp`만 받는다. HEIC 등 다른 형식은 클라이언트가 디코드해 JPEG로 다시 인코딩해 보내고, 브라우저가 열지 못하면 "이 사진은 열 수 없어요. jpg · png로 바꿔 올려 주세요"를 띄운다. GIF는 거부한다 | `accept="image/*"` · `createImageBitmap` 디코드 실패 처리 · JPEG 재인코딩 [F05](frontend/05-forms.md) | 매직 바이트로 세 형식만 [B07](backend/07-protection.md) | PC-IM-03~05, 트러블슈팅 T-04 |
| AC-PC-13 | 클라이언트가 긴 변 1600px · JPEG 품질 0.85로 다시 인코딩해 보내고(4MB를 넘으면 품질 0.7로 한 번 더), 서버는 4MB · 5,000만 픽셀을 넘으면 거부한다 | `createImageBitmap` + `canvas`로 1600px 재인코딩 [F05](frontend/05-forms.md) | 4MB · 5천만 픽셀 한도 [B07](backend/07-protection.md) | PC-IM-06, 11 |
| AC-PC-14 | 서버는 EXIF 회전을 적용한 뒤 EXIF를 제거하고 1600px 원본 · 400px 썸네일 두 벌을 webp로 저장한다 | — | EXIF 회전 · 제거 · webp 두 벌 [B07](backend/07-protection.md) | PC-IM-07, 08, PC-DT-05 |
| AC-PC-15 | 0바이트 · 손상 · 형식 불일치 파일은 `400 INVALID_FILE`이며 해당 썸네일에 오류와 [다시 시도]가 표시된다 | 썸네일 오류 · [다시 시도] [F04](frontend/04-errors.md) | `400 INVALID_FILE` [B06](backend/06-errors.md) | PC-IM-12, PC-IM-17 |
| AC-PC-16 | 업로드 중에는 [등록하기]가 비활성이고 "사진 올리는 중 N/M"이 보인다 | 업로드 중 버튼 비활성 + 이유 문구 [F05](frontend/05-forms.md) | — | PC-IM-16 |
| AC-PC-17 | 첫 번째 사진이 대표이며 [대표로] 버튼으로 맨 앞으로 옮길 수 있다. 드래그 정렬은 없다 | [대표로] 버튼 · 순서 배열 | `order` 저장 | PC-IM-14 |
| AC-PC-18 | 업로드 API는 업로더를 기록하고, 다른 사람의 업로드를 내 상품에 연결하면 `403`이다 | — | 업로더 기록 · 연결 시 소유 확인 `403` [B03](backend/03-transactions.md) [B04](backend/04-authorization.md) | PC-AU-05, 06 |
| AC-PC-19 | 24시간 안에 상품에 연결되지 않은 업로드는 하루 한 번 배치가 파일과 행을 삭제한다 | — | 고아 업로드 배치 [B07](backend/07-protection.md) | PC-DT-12 |
| AC-PC-20 | 사진 선택 버튼은 "사진 추가, 현재 N장", 썸네일 삭제는 "N번째 사진 삭제"로 읽히고 진행은 `aria-live`로 알린다 | 버튼 이름 · 라이브 리전 [F06](frontend/06-focus.md) | — | PC-A11Y-01~03 |

### 4.3 수정

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-PC-30 | 상세의 `⋯` → [수정]으로 `/products/{id}/edit`에 들어가면 기존 값과 사진이 채워져 있다 | 서버에서 상품 조회 · 소유자 아니면 `notFound()` · 초기값 복사 [F01](frontend/01-rendering.md) [F02](frontend/02-state.md) | 상세 API + `viewer.isSeller` | PC-ED-02, 03 |
| AC-PC-31 | 기존 사진 삭제와 새 사진 추가를 합쳐 10장까지이며, 저장 시 삭제된 사진은 DB 커밋 후 파일이 지워진다 | 기존 + 새 합계 10장 제한 | T3 — 커밋 후 파일 삭제 [B03](backend/03-transactions.md) | PC-ED-04, 05 |
| AC-PC-32 | 변경 없이 저장해도 `200`이며 `updatedAt`만 갱신된다 | 변경 없어도 저장 허용 | `updatedAt`만 갱신 | PC-ED-06 |
| AC-PC-33 | 저장 후 상세로 `replace` 이동하고 "수정했어요" 토스트가 뜬다. "(수정됨)" 표시는 없다 | `replace` · 토스트 · 상품 캐시 갱신 [F03](frontend/03-cache.md) | — | PC-ED-07, 08 |
| AC-PC-34 | 거래완료 상품도 제목 · 가격 · 설명을 수정할 수 있고 상태는 수정 폼에서 바꾸지 않는다 | 상태 칸 없음 | `PATCH`가 `status` 무시 | PC-ED-09 |
| AC-PC-35 | 수정 중 상품이 삭제되면 저장 시 `404` → "삭제된 물건이에요" 토스트 → 홈이다 | 404 → 토스트 → 홈 [F04](frontend/04-errors.md) | 조건부 UPDATE 0행 → `404` [B03](backend/03-transactions.md) | PC-ED-12 |
| AC-PC-36 | 동시 수정은 마지막 저장이 이긴다 | — | 낙관적 잠금 없음 [B03](backend/03-transactions.md) | PC-ED-13 |

범위 밖: 임시 저장, 금칙어, 가격 제안, 드래그 정렬, 드래그 앤 드롭 · 붙여넣기 업로드, 조회수, 끌어올리기, 거래 장소 [PC-OK-08, PC-IN-06, 17, PC-IM-19, 20, PC-DT-09~11].

---

## 5. 거래 상세 · 상태 변경

**유저 스토리** — 구매자로서, 물건의 사진 · 설명 · 상태를 보고 바로 채팅을 걸고 싶다. 판매자로서, 내 물건의 상태를 바꾸고 누구와 거래했는지 남기고 싶다.

**권한** — 열람: 누구나 [결정 0011]. 상태 변경 · 수정 · 삭제: 판매자만. [채팅하기]: 로그인한 비판매자만.

### 5.1 상태 전이

| 현재 \ 행위 | 예약중으로 | 거래완료로 | 판매중으로 |
| --- | --- | --- | --- |
| 판매중 | ✅ | ✅ | — |
| 예약중 | — | ✅ | ✅ |
| 거래완료 | ❌ | — | ✅ (`buyerId · soldAt` 초기화) |

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-PD-01 | 표 밖의 전이는 `409 INVALID_TRANSITION`이며 메시지가 어떤 전이가 안 되는지 말한다 | `<select>` 되돌림 · 토스트 · 재조회 [F04](frontend/04-errors.md) | 조건부 UPDATE 0행 → 재조회로 원인 구분 → `409` [B03](backend/03-transactions.md) | PD-TR-01 |
| AC-PD-02 | 같은 상태로의 변경은 `200`이고 변경이 없다 | — | 같은 상태면 `200` 변경 없음 [B05](backend/05-idempotency.md) | PD-TR-02 |
| AC-PD-03 | 판매자에게만 상태 `<select>`(레이블 "거래 상태")가 보이고 선택 즉시 `PATCH /products/{id}/status`가 호출되며 결과를 `aria-live`로 알린다 | `viewer.isSeller`일 때만 `<select>` · 낙관적 값 · 라이브 리전 [F03](frontend/03-cache.md) [F06](frontend/06-focus.md) | 정책 `canChangeStatus` [B04](backend/04-authorization.md) | PD-TR-03, PD-A11Y-03 |
| AC-PD-04 | 거래완료를 고르면 "누구와 거래했나요?" 바텀시트에 이 상품 채팅 상대 목록과 "선택 안 함"이 뜨고, 채팅 상대가 0명이면 바로 완료된다 | 바텀시트 · `chatPartners` 열 때마다 조회 [F03](frontend/03-cache.md) | `GET /products/:id/chat-partners` (판매자만) [B04](backend/04-authorization.md) | PD-TR-04 |
| AC-PD-05 | 지정한 `buyerId`가 이 상품 채팅방의 구매자가 아니면 `400 NOT_A_CHAT_PARTNER`다 | 목록 재조회 [F04](frontend/04-errors.md) | `canAssignBuyer` · `400` [B04](backend/04-authorization.md) | PD-AU-04 |
| AC-PD-06 | 거래완료 → 판매중은 "구매자 정보가 지워져요" 확인 모달을 거치고, 예약 취소는 확인 없이 즉시다 | 완료 취소만 확인 모달 | `buyerId · soldAt · soldPrice` 초기화 · CHECK가 보증 [B02](backend/02-data-model.md) | PD-TR-05, 06 |
| AC-PD-07 | 구매자가 상태 변경 API를 호출하면 `403`이다 | UI에 없음 (편의) | `403` [B04](backend/04-authorization.md) | PD-AU-01 |
| AC-PD-08 | 상태 변경 중 실패하면 `<select>`를 이전 값으로 되돌리고 토스트를 띄운다 | 낙관적 값 롤백 [F03](frontend/03-cache.md) | — | PD-CC-06 |

### 5.2 화면 · 채팅 시작

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-PD-10 | 상세는 사진 캐러셀 → 판매자 → 제목 · 상태 배지 · 상대 시간 → 설명 → 하단 고정 바(가격 + [채팅하기]) 순서로 서버 렌더된다 | 서버 렌더 구성 · 하단 고정 바 [F01](frontend/01-rendering.md) | 상세 API | PD-OK-01 |
| AC-PD-11 | 판매자 본인에게는 [채팅하기] 대신 [대화 중인 채팅 N]이 보이고 `⋯` 메뉴에 [수정] · [삭제]가 있다. 남의 상품에는 `⋯` 메뉴가 없다 | `viewer.isSeller`로 버튼 · 메뉴 분기 | `viewer` 계산 (`optionalAuth`) [B01](backend/01-layers.md) | PD-OK-03, PD-AU-05 |
| AC-PD-12 | 이미 이 상품으로 채팅방이 있으면 버튼이 [채팅 이어하기]로 바뀌고 기존 방으로 간다 | `viewer.existingChatRoomId`면 버튼 문구 · 이동 | `viewer.existingChatRoomId` 계산 | PD-OK-04 |
| AC-PD-13 | [채팅하기]는 `POST /chat-rooms { productId }`를 호출해 기존 방이면 `200`, 새 방이면 `201`을 받고 `/chats/{roomId}`로 이동한다. 자동 인사 메시지는 없다 | `200` · `201` 같은 이동 [F03](frontend/03-cache.md) | T6 [B03](backend/03-transactions.md) | PD-OK-05 |
| AC-PD-14 | 판매자가 자기 상품에 채팅방 생성 API를 호출하면 `400 CANNOT_CHAT_OWN_PRODUCT`다 | 버튼 자체가 없음 | 정책 + CHECK `buyerId <> sellerId` [B02](backend/02-data-model.md) [B04](backend/04-authorization.md) | PD-AU-02 |
| AC-PD-15 | 두 번 클릭 · 두 탭 동시 요청에도 `(productId, buyerId)` 유니크로 방은 하나만 생긴다 | 첫 클릭에 버튼 잠금 | 유니크 위반 → 기존 방 `200` [B05](backend/05-idempotency.md) | PD-CC-01, 02 |
| AC-PD-16 | 비로그인으로 [채팅하기]를 누르면 로그인 후 상세로 돌아오며 버튼을 다시 눌러야 한다 | 로그인 후 `next`로 복귀, 자동 생성 안 함 | `optionalAuth` 상세 · 생성은 `requireAuth` | PD-OK-02 |
| AC-PD-17 | 캐러셀은 `aria-roledescription="carousel"`, 슬라이드마다 "5장 중 N번째", 이전 · 다음 버튼 키보드 조작, 자동 재생 없음이며 탭하면 전체 화면 뷰어가 열린다 | 캐러셀 · 전체 화면 뷰어(`<dialog>`) [F06](frontend/06-focus.md) | 사진 `order` 순 응답 | PD-OK-06, PD-A11Y-01 |
| AC-PD-18 | 예약중은 배지만 붙고 [채팅하기]가 활성이며, 거래완료는 배지 + 오버레이에 [채팅하기]가 `aria-disabled`이고 누르면 "거래가 완료된 물건이에요"를 알린다 | 배지 · 오버레이 · `aria-disabled` + 이유 [F06](frontend/06-focus.md) | 거래완료 시 새 방 `409` [B04](backend/04-authorization.md) | PD-ST-02, 03, PD-A11Y-05 |
| AC-PD-19 | 삭제된 상품은 판매자 본인에게도 404다 | 404 화면 | 자동 주입으로 판매자에게도 없음 [B01](backend/01-layers.md) | PD-ST-04 |
| AC-PD-20 | [채팅하기]를 누른 사이 거래완료되면 `409 PRODUCT_SOLD`, 삭제되면 `404`이며 각각 토스트 후 재조회 · 홈 이동이다 | `PRODUCT_SOLD`는 재조회, `NOT_FOUND`는 홈 [F04](frontend/04-errors.md) | T6 안 `FOR SHARE` 확인 [B03](backend/03-transactions.md) | PD-ST-07, PD-CC-05 |
| AC-PD-21 | 공유 버튼은 `navigator.share` 또는 URL 복사이며 OG 메타에 제목 · 대표 사진 · 가격이 있다 | `navigator.share` · 복사 · `generateMetadata` [F01](frontend/01-rendering.md) | 대표 사진 썸네일 URL | PD-OK-10, PD-DT-05 |
| AC-PD-22 | 상세 API는 `product · images · seller(공개용) · chatRoomCount · viewer { isSeller, existingChatRoomId }`를 돌려준다 | 응답을 `['product', id]`에 저장 [F03](frontend/03-cache.md) | 응답 조립 · `viewer` 계산 | PD-DT-01 |
| AC-PD-23 | 페이지 `<title>`은 "{상품 제목} · neighbo"이고 `h1`은 상품 제목이며, 뒤로가기 버튼은 히스토리가 없으면 홈으로 간다 | `<title>` · `h1` · 히스토리 없으면 홈 | — | PD-A11Y-07, PD-UI-04 |
| AC-PD-24 | 사진은 `width · height`로 비율을 확보해 로드 중 레이아웃이 밀리지 않는다 | `width · height`로 자리 확보 [F01](frontend/01-rendering.md) | `ProductImage.width · height` 저장 [B02](backend/02-data-model.md) | PD-NW-04 |

범위 밖: 판매자 프로필 · 다른 상품, 찜, 상태 변경 알림, 예약자 지정, 상태 이력 [PD-OK-08, 09, 11, PD-TR-07~09, PD-DT-04].

---

## 6. 거래 삭제

**유저 스토리** — 판매자로서, 더 팔지 않을 물건을 내리되 이미 나눈 대화는 상대도 나도 계속 볼 수 있었으면 한다.

**권한** — 작성자만. API `403`, 이미 삭제된 것은 `404`.

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-PX-01 | 삭제는 항상 soft(`deletedAt`)이며 어느 상태에서든 가능하다 | — | T5 조건부 UPDATE [B03](backend/03-transactions.md) | 삭제 규칙, 결정 0006 |
| AC-PX-02 | `⋯` → [삭제]는 `role="alertdialog"` 확인 모달을 띄우고 포커스는 [취소]에 있으며, 채팅방이 있으면 "대화 중인 채팅 N개가 있어요…" 문구로 바뀐다 | `<dialog role="alertdialog">` · [취소] 포커스 · 채팅 수 분기 [F06](frontend/06-focus.md) | `chatRoomCount` 제공 | PX-OK-01~03, PX-A11Y-01 |
| AC-PX-03 | 확정하면 `DELETE /products/{id}` → `204` → 홈으로 `replace` → "삭제했어요" 토스트 → 목록 캐시에서 제거다 | `replace` · 토스트 · 캐시 제거 [F03](frontend/03-cache.md) | `204` | PX-OK-04 |
| AC-PX-04 | 삭제 쿼리는 `WHERE id AND sellerId AND deletedAt IS NULL`이며 0행이면 `404`다 | 삭제 요청의 404는 성공으로 [F04](frontend/04-errors.md) | 0행이면 원인 구분 `404` · `403` [B03](backend/03-transactions.md) | PX-DT-01, PX-AU-03 |
| AC-PX-05 | 모든 `Product` 조회에 `deletedAt IS NULL`이 Prisma 클라이언트 확장으로 자동 주입되고, 예외는 `withDeleted()`를 명시한 채팅방 · 채팅 목록 요약과 구매 내역뿐이다 | — | Prisma 확장 자동 주입 · `withDeleted()` 두 곳 [B01](backend/01-layers.md) | PX-DT-04 |
| AC-PX-06 | 삭제된 상품은 목록 · 검색 · 상세 · 수정 · 마이페이지 판매 목록 · 판매 개수에서 사라진다 | 캐시 제거 · 무효화 [F03](frontend/03-cache.md) | 자동 주입 [B01](backend/01-layers.md) | PX-ST-01~04, 11, 12 |
| AC-PX-07 | 채팅 목록에서는 썸네일 회색 + "삭제됨" 라벨로 행이 유지된다 | "삭제됨" 라벨 · 회색 썸네일 | 채팅 목록에 `product.deletedAt` 포함 | PX-ST-05, 06 |
| AC-PX-08 | 채팅방은 열람 가능하지만 상품 요약은 클릭 불가, 입력창 비활성, "삭제된 물건이라 메시지를 보낼 수 없어요" 안내가 있고 소켓 전송은 `error: PRODUCT_DELETED`다 | 입력창 비활성 · 요약 링크 제거 [F07](frontend/07-socket-client.md) | `canSendMessage` · 소켓 `PRODUCT_DELETED` [B09](backend/09-socket-server.md) | PX-ST-07~09 |
| AC-PX-09 | 삭제된 상품 채팅방의 읽지 않은 메시지도 배지에 포함된다 | — | 배지 계산이 상품 상태를 보지 않음 [B02](backend/02-data-model.md) | PX-ST-13 |
| AC-PX-10 | 거래완료된 상품을 삭제해도 구매자의 구매 내역에 "삭제됨" 라벨로 남는다 | "삭제됨" 라벨 · 클릭 불가 | 구매 내역 `withDeleted()` [B01](backend/01-layers.md) | PX-ST-14 |
| AC-PX-11 | 삭제와 동시에 들어온 채팅방 생성 · 상태 변경은 `404`로 실패한다 | 404 처리 [F04](frontend/04-errors.md) | T6 · T4가 `FOR SHARE` · 조건부 UPDATE로 [B03](backend/03-transactions.md) | PX-CC-02, 05 |
| AC-PX-12 | 삭제 후 30일이 지나면 배치가 이미지 파일과 `ProductImage` 행을 지우고 `imagesPurgedAt`을 기록한다 | — | 30일 배치 · advisory lock [B07](backend/07-protection.md) | PX-DT-06 |
| AC-PX-13 | 모달은 360px에서 바텀시트, 1024px에서 중앙 다이얼로그이며 [삭제]는 위험 색이다 | 같은 `<dialog>`에 반응형 CSS [F06](frontend/06-focus.md) | — | PX-UI-01, 02 |

범위 밖: 마이페이지에서 삭제, 되돌리기, 삭제 사유, 복구 UI [PX-OK-06, 07, PX-DT-05].

---

## 7. 채팅 목록

**유저 스토리** — 사용자로서, 내가 나눈 대화를 최근 순으로 보고 안 읽은 게 있는 방을 바로 알아보고 싶다.

**권한** — 로그인.

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CL-01 | `/chats`는 내가 참여한 방 30개를 최근 활동순(`lastActivityAt DESC` — 메시지가 없으면 방 생성 시각)으로 서버 렌더하고 [더 보기]로 이어진다 | 서버에서 첫 30개 → 하이드레이트 [F01](frontend/01-rendering.md) | `ChatRoomMember(userId, lastActivityAt)` 인덱스 [B02](backend/02-data-model.md) | CL-OK-01, 02 |
| AC-CL-02 | 행은 상대 아바타 · 상대 닉네임 · "판매"/"구매" 라벨 · 마지막 메시지 1줄 · 시각 · 읽지 않은 수 배지 · 상품 썸네일로 구성된다 | 행 컴포넌트 | `partner` · `myRole` 계산 | CL-OK-03, 05 |
| AC-CL-03 | 메시지가 없는 방은 "대화를 시작해 보세요"를 회색으로 보여준다 | 빈 미리보기 문구 | `lastMessage: null` | CL-OK-07 |
| AC-CL-04 | 배지는 1~99, `99+`, 0이면 숨김이며 `aria-label="읽지 않은 메시지 N개"`다 | 배지 표시 · `aria-label` | 방별 `unreadCount` 계산 [B02](backend/02-data-model.md) | CL-OK-08, CL-A11Y-01 |
| AC-CL-05 | 목록을 보는 중 새 메시지가 오면 해당 행이 맨 위로 이동하고 미리보기 · 시각 · 배지가 바뀌며, 100ms 안의 연속 이벤트는 한 번에 처리한다 | `message:new` → 행 이동 · 100ms 디바운스 [F03](frontend/03-cache.md) | `message:new` 전달 [B09](backend/09-socket-server.md) | CL-OK-09, CL-CC-04 |
| AC-CL-06 | 다른 방에서 읽고 돌아오면 해당 행 배지가 0이다 | 읽음 시 행 배지 0 (캐시 갱신) [F03](frontend/03-cache.md) | T8 [B03](backend/03-transactions.md) | CL-OK-10 |
| AC-CL-07 | `?productId=`로 특정 상품의 방만 필터하고 상단에 상품 요약과 [전체 보기]가 있다 | URL `productId` → 쿼리 키 [F02](frontend/02-state.md) | `productId` 필터 | CL-OK-11 |
| AC-CL-08 | 상품이 예약중 · 거래완료 · 삭제됨이면 썸네일 위에 각각의 배지 · 라벨이 붙고 행은 유지된다 | 상태 배지 · 라벨 | `product.status · deletedAt` 포함 | CL-ST-01~03 |
| AC-CL-09 | 방 0개면 "아직 채팅이 없어요…"와 [물건 보러 가기]를 보여준다 | 빈 상태 컴포넌트 | — | CL-DT-01 |
| AC-CL-10 | [더 보기] 중 재정렬로 이미 받은 행이 다시 오면 `roomId` 기준으로 중복 제거한다 | `roomId`로 중복 제거 [F03](frontend/03-cache.md) | — | CL-CC-03 |
| AC-CL-11 | 소켓 재연결 시 목록을 전체 재조회한다 | 재연결 시 무효화 [F07](frontend/07-socket-client.md) | — | CL-CC-01 |
| AC-CL-12 | 시각은 오늘 "오후 3:24", 어제 "어제", 7일 미만 "N일 전", 그 이상 "M월 D일"이다 | 채팅용 시각 함수 | ISO 시각 응답 | CL-UI-05 |
| AC-CL-13 | 행 이동 시 포커스가 그 행에 있었으면 유지된다 | 행 `key` = 방 id [F06](frontend/06-focus.md) | — | CL-A11Y-02 |
| AC-CL-14 | 목록 API는 `items[{ id, product{…, deletedAt}, partner, lastMessage, unreadCount, myRole }]`를 돌려주고 `ChatRoom.lastMessageAt · lastMessagePreview · lastMessageSenderId` 비정규화 컬럼을 쓴다 | 응답 타입 | 응답 조립 · 비정규화 컬럼 [B02](backend/02-data-model.md) | CL-DT-20~22 |
| AC-CL-15 | 다른 탭에서 방을 읽으면 `user:{id}` 룸의 `room:read`로 이 탭의 해당 행 배지가 즉시 0이 된다 | `room:read`(내 세션) → 행 배지 0 [F03](frontend/03-cache.md) | `user:{id}` 룸으로 전달 [B09](backend/09-socket-server.md) | CL-CC-02 |
| AC-CL-16 | 메시지가 없는 새 방은 목록에 즉시 나타나지 않고 첫 메시지와 함께 나타난다 | — | 빈 방은 `lastMessageAt` null, `room:created` 없음 | CL-CC-05 |

범위 밖: 방 나가기 · 숨기기 · 고정 · 알림 끄기, 안 읽은 방 필터, 2단 레이아웃 [CL-ST-06, CL-DT-25, 26, CL-UI-02].

---

## 8. 채팅

**유저 스토리** — 구매자와 판매자로서, 물건 하나를 두고 실시간으로 문자를 주고받고, 끊겼다 돌아와도 놓친 메시지 없이 이어가고 싶다.

**권한** — 참여자만. 비참여자는 화면 404, 소켓 `FORBIDDEN`.

### 8.1 읽음 · 전송 · 복구 (핵심 정의)

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CH-01 | 읽음은 방 단위 `ChatRoomMember.lastReadSeq` 하나이며, 방 화면이 보이는 상태에서 **실제로 그린 마지막 메시지의 `seq`**로 갱신된다 — 입장 · 보이는 동안 수신 · 포그라운드 복귀 세 순간에 `room:read { roomId, seq }`(HTTP 폴백 `POST /chat-rooms/{id}/read`) | 세 순간에 그린 마지막 `seq`로 `room:read` · `visibilitychange` [F07](frontend/07-socket-client.md) | T8 `GREATEST(lastReadSeq, LEAST(seq, lastSeq))` [B03](backend/03-transactions.md) | 핵심 정의, 결정 0007 · 0016 |
| AC-CH-02 | 내 마지막 메시지 아래에 상대 `lastReadSeq >= 그 메시지의 seq`이면 "읽음"이 한 번 표시된다 | 상대 `lastReadSeq`와 비교해 "읽음" [F03](frontend/03-cache.md) | `room:read` 전달 · 방 상세에 상대 `lastReadSeq` [B09](backend/09-socket-server.md) | 핵심 정의, CH-CC-12 |
| AC-CH-03 | 전송은 `tempId`를 만들어 즉시 "전송 중" 말풍선을 그리고 `message:send`를 emit하며, ack `{ ok, message }`로 확정한다 | `tempId` · 대기열 · `emitWithAck` [F07](frontend/07-socket-client.md) | T7 · ack [B03](backend/03-transactions.md) [B09](backend/09-socket-server.md) | 핵심 정의 |
| AC-CH-04 | 5초 안에 ack가 없으면 "전송 실패 [재시도] [삭제]"가 되고, 재시도는 같은 `tempId`로 보내며 서버는 `(roomId, senderId, tempId)` 유니크로 중복 저장을 막는다 | 5초 실패 · 같은 `tempId` 재시도 · 말풍선 유지 [F07](frontend/07-socket-client.md) | `(roomId, senderId, tempId)` 유니크 → 기존 반환 [B05](backend/05-idempotency.md) | 핵심 정의, CH-CC-02, 03 |
| AC-CH-05 | 재연결 시 `room:join { roomId, after: 마지막 seq }`로 누락분(최대 100개 + `hasMore`)을 받고, 넘치면 HTTP로 나머지를 가져온다. 연결 중이라도 `message:new`의 `seq`가 마지막 + 1이 아니면 같은 방법으로 틈을 채운다 | 재연결 · 틈 감지 시 `after`로 조인 · 합침 [F07](frontend/07-socket-client.md) | `seq > after` 101개 조회 · `hasMore` [B09](backend/09-socket-server.md) | 핵심 정의, CH-CC-08, 결정 0016 |
| AC-CH-06 | 메시지 저장은 한 트랜잭션에서 참여자 검사 → 상품 삭제 검사 → 방 행 잠금 · `tempId` 중복 확인 → `lastSeq` +1 · 비정규화 갱신 → insert(`seq`) → 발신자 `lastReadSeq` 갱신 순으로 처리하고, 커밋 후 참여자에게 `message:new`, 수신자 전 세션에 `notification:unread`를 보낸다 | — | T7 순서 · 커밋 후 emit [B03](backend/03-transactions.md) | CH-DT-12 |

### 8.2 화면 · 입력

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CH-10 | `/chats/{roomId}`는 헤더(← · 상대 닉네임) · 상품 요약 바 · 메시지 목록 · 입력창으로 구성되고, 최신 50개를 HTTP로 받은 뒤 맨 아래로 스크롤하고 `room:join` · `room:read`를 보낸다 | 서버에서 방 · 50개 → 마지막 `seq`를 `after`로 조인 [F01](frontend/01-rendering.md) | 방 상세 · 메시지 API · 비참여자 404 [B04](backend/04-authorization.md) | CH-OK-01, 02 |
| AC-CH-11 | 상단에 도달하면 이전 50개를 `?before=`로 받아 스크롤 위치를 유지하며, [이전 메시지 보기] 버튼도 함께 있다 | 위 방향 무한 쿼리 · 스크롤 유지 · 버튼 병행 [F03](frontend/03-cache.md) | `before` 커서 · 역방향 인덱스 [B02](backend/02-data-model.md) | CH-OK-03, CH-A11Y-08 |
| AC-CH-12 | PC는 Enter 전송 · Shift+Enter 줄바꿈, 모바일은 Enter 줄바꿈 · 버튼 전송이며 IME 조합 중 Enter는 무시한다 | 포인터 종류 · `isComposing` 판별 [F05](frontend/05-forms.md) | — | CH-OK-04, CH-IN-07 |
| AC-CH-13 | 빈 · 공백 · 줄바꿈만인 메시지는 보낼 수 없고, 1,000자를 넘으면 입력이 막히며 900자부터 카운터가 보인다 | 전송 비활성 · 카운터 | 스키마 + CHECK [B02](backend/02-data-model.md) | CH-IN-01, 02, 06 |
| AC-CH-14 | 상대 메시지 수신 시 스크롤이 맨 아래 100px 이내면 자동 스크롤, 아니면 [새 메시지 ↓] 버튼이 뜬다. 내 전송은 항상 맨 아래로 | 스크롤 위치 판단 · [새 메시지 ↓] [F07](frontend/07-socket-client.md) | — | CH-OK-08, 09 |
| AC-CH-15 | 같은 사람 · 같은 분의 연속 메시지는 마지막에만 시각을 보이고, 날짜가 바뀌면 `role="separator"` 구분선이 들어간다 | 연속 묶음 · 날짜 구분선 | ISO 시각 | CH-OK-07, CH-A11Y-07 |
| AC-CH-16 | 링크는 평문이고 이모지는 그대로 표시된다 | 평문 렌더 | 원문 저장 | CH-OK-13, 14 |
| AC-CH-17 | 상품 요약 바를 누르면 상세로 가며 삭제된 상품이면 클릭 불가다 | 삭제 시 링크 제거 | 방 상세에 `product.deletedAt` | CH-OK-10 |
| AC-CH-18 | 거래완료 · 예약중 상품의 방은 전송 가능하고 삭제된 상품의 방은 전송 불가다 | 삭제면 입력창 비활성 | `canSendMessage` [B04](backend/04-authorization.md) | CH-ST-01~03 |
| AC-CH-19 | 메시지 0개면 "{상대}님에게 첫 메시지를 보내 보세요"가 보인다 | 빈 상태 문구 | — | CH-UI-05 |
| AC-CH-20 | 채팅방 안에서는 하단 탭바를 숨기고 입력창이 `100dvh` 기준 하단에 고정된다 | `(tabs)` 밖 경로 · `100dvh` [F01](frontend/01-rendering.md) | — | CH-UI-01, 07 |
| AC-CH-21 | 말풍선의 접근 가능한 이름은 "{보낸 사람}, {내용}, {시각}"이고 전송 실패는 `role="alert"`다 | 말풍선 이름 · 실패 `alert` [F06](frontend/06-focus.md) | — | CH-A11Y-02, 05 |
| AC-CH-22 | 뒤로가기는 채팅 목록으로, 히스토리가 없으면 `/chats`로 간다 | 히스토리 없으면 `/chats` | — | CH-OK-11 |

### 8.3 권한 · 보안 · 소켓

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-CH-30 | 비참여자의 `room:join` · `message:send`는 `error: FORBIDDEN`이며 조인하지 않은 방에는 보낼 수 없다 | 방 화면이면 404 처리 | 참여자 · 조인 확인 `FORBIDDEN` [B09](backend/09-socket-server.md) | CH-AU-02, 03, CH-SEC-01 |
| AC-CH-31 | 비로그인 소켓 연결은 핸드셰이크에서 거부되고, 이벤트 처리 시 토큰이 만료돼 있으면 `error: UNAUTHORIZED` 후 끊는다. 클라이언트는 끊긴 이유가 `io server disconnect`면 자동 재연결을 기다리지 않고 재로그인 화면으로 보내며, 로그인 후 직접 다시 연결한다 | `io server disconnect` → `needs_login` → 재로그인 후 수동 연결 [F07](frontend/07-socket-client.md) | 이벤트마다 `exp` 확인 → `UNAUTHORIZED` + 끊기 [B09](backend/09-socket-server.md) | CH-AU-04, 05 |
| AC-CH-32 | 모든 수신 이벤트는 Zod로 검증하고 실패 시 `error: INVALID_PAYLOAD`로 연결은 유지한다. 페이로드 한도는 80KB다 (1,000자 메시지가 이모지로만 이뤄져도 통과하는 값) | — | Zod 검증 · `maxHttpBufferSize` 80KB [B09](backend/09-socket-server.md) | CH-SEC-03, 04 |
| AC-CH-33 | 전송은 사용자당 토큰 버킷(용량 10, 초당 5개 충전)으로 제한하고, 넘으면 ack `{ ok: false, code: RATE_LIMITED, retryAfterMs }`다. 대기열 재전송은 200ms 간격으로 보내고, `RATE_LIMITED`를 받은 대기 메시지는 실패로 바꾸지 않고 `retryAfterMs` 뒤 다시 보낸다. 소켓 연결은 사용자당 5개까지다 | 재전송 간격 · 거절 시 대기 유지 · 직접 입력은 그동안 [전송] 비활성 + 이유 [F07](frontend/07-socket-client.md) | 토큰 버킷 · 연결 5개 [B07](backend/07-protection.md) | CH-SEC-02, 05, 트러블슈팅 T-03 |
| AC-CH-34 | 소켓 이벤트는 클라→서버 `room:join · room:leave · message:send · room:read`, 서버→클라 `message:new · room:read · room:product_updated · notification:unread · error`이며 ack 형식은 CH-DT-08을 따른다 | `useChatSocket` 훅이 이벤트 이름 · 타입 공유 | 이벤트 핸들러 [B09](backend/09-socket-server.md) | CH-DT-06~08 |
| AC-CH-35 | WebSocket이 막힌 네트워크에서는 long-polling으로 폴백한다 | `transports` 기본 유지 | `["websocket", "polling"]` [B09](backend/09-socket-server.md) | CH-NW-07 |
| AC-CH-36 | 서버 재시작 후 클라이언트가 자동 재연결해 누락분을 복구하며 서버 메모리에 조인 상태를 의존하지 않는다 | 자동 재연결 + 복구 절차 [F07](frontend/07-socket-client.md) | 메모리 상태 없음 · DB가 출처 [B09](backend/09-socket-server.md) | CH-CC-13 |
| AC-CH-37 | `message:send`는 항상 5초 ack 타임아웃과 함께 보낸다. 타임아웃 없는 emit은 lint로 막는다 | `emitWithAck`만, `socket.emit` 직접 호출 lint 금지 [F07](frontend/07-socket-client.md) | ack를 반드시 응답 | websocket.md ⑤ |
| AC-CH-38 | 연결이 끊긴 상태에서 보낸 메시지는 앱 대기열에 "연결 중…"으로 남고, 재연결 시 같은 `tempId`로 순서대로 재전송되며, 30초가 지나면 "전송 실패"가 된다 | 대기열 `queued` · 재연결 시 순서대로 · 30초 실패 [F07](frontend/07-socket-client.md) | — | CH-CC-09 |
| AC-CH-39 | 연결이 5초 넘게 끊기면 상단에 "실시간 연결이 끊겼어요. 다시 연결 중…" 바가 `role="status"`로 뜨고, 별도 HTTP 폴링은 하지 않는다 | 5초 넘으면 끊김 바 `role="status"` [F07](frontend/07-socket-client.md) | — | CH-NW-03 |
| AC-CH-40 | 내 다른 탭에서 방을 읽으면 이 탭의 배지도 즉시 줄어든다 | `room:read`(내 세션) → 배지 [F03](frontend/03-cache.md) | `user:{id}` 룸 전달 [B09](backend/09-socket-server.md) | CH-CC-05 |
| AC-CH-41 | 방을 보는 중 상품이 삭제 · 상태 변경 · 가격 수정되면 `room:product_updated`로 요약 바와 입력창 상태가 즉시 바뀐다 | 요약 바 · 입력창 즉시 갱신 [F07](frontend/07-socket-client.md) | 커밋 후 `Realtime.productUpdated` [B09](backend/09-socket-server.md) | CH-ST-04, 05 |
| AC-CH-42 | 메시지 목록은 `role="log"`이되 `aria-live`를 끄고, 상대 메시지만 시각 숨김 `role="status"` 영역에 "{닉네임}: {내용}"으로 알린다 | `role="log"` + 상대 메시지 전용 리전 [F06](frontend/06-focus.md) | — | CH-A11Y-01 |
| AC-CH-43 | 하트비트는 `pingInterval 10s` · `pingTimeout 5s`이고, 재연결은 최대 간격 5초 · 지터 0.5다 | `reconnectionDelayMax` 5s · 지터 0.5 | `pingInterval` 10s · `pingTimeout` 5s [B09](backend/09-socket-server.md) | CH-CC-15, websocket.md ② ③ |
| AC-CH-44 | 메시지는 DB 커밋 후에 emit한다. 복구는 DB `after` 커서 한 가지로 하고 Socket.IO `connectionStateRecovery`는 쓰지 않는다 | — | 커밋 후 emit · `connectionStateRecovery` 끔 [B09](backend/09-socket-server.md) | websocket.md ③ ⑤ |

범위 밖: 타이핑 표시, 시스템 메시지, 메시지 삭제 · 수정 · 복사, 사진 · 파일, 약속 · 장소, 방 안 상태 변경, 금칙어 [핵심 정의, CH-OK-15~19, CH-IN-08].

---

## 9. 마이페이지

**유저 스토리** — 사용자로서, 내가 올린 물건을 상태별로 보고, 산 물건을 확인하고, 닉네임 · 사진 · 비밀번호를 바꾸고 싶다.

**권한** — 로그인. `PATCH /me`는 닉네임 · 아바타만 허용(화이트리스트).

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-MP-01 | `/me`는 프로필 카드(아바타 · 닉네임 · 이메일 · "YYYY년 M월부터") → [프로필 수정] → 탭(판매중 N · 예약중 N · 거래완료 N · 구매 N) → 목록 → [로그아웃] 순이다 | 서버 렌더 구성 [F01](frontend/01-rendering.md) | `GET /me` · 개수 [B02](backend/02-data-model.md) | MP-OK-01, 14 |
| AC-MP-02 | 탭은 `role="tablist"`로 화살표 키 이동이 되고 이름에 개수가 포함되며 `?status=`에 반영된다 | `tablist` · URL `status` · 라이브 리전 [F02](frontend/02-state.md) [F06](frontend/06-focus.md) | `status`별 목록 · 인덱스 [B02](backend/02-data-model.md) | MP-OK-02, MP-A11Y-01, 02 |
| AC-MP-03 | 판매 목록은 삭제된 상품을 제외하고 거래완료 카드에는 "{구매자}님과 거래"가 표시된다 | 구매자 표시 | 판매 목록 자동 주입 · 구매자 공개용 객체 | MP-ST-01, 03 |
| AC-MP-04 | 구매 내역은 `buyerId = me AND status = SOLD`이며 삭제된 상품도 "삭제됨" 라벨로 남는다 | "삭제됨" 라벨 · 클릭 불가 | `withDeleted()` · `soldPrice` 응답 [B01](backend/01-layers.md) [B02](backend/02-data-model.md) | MP-DT-22 |
| AC-MP-05 | 각 탭의 빈 상태 문구가 다르고 판매중 탭에만 [물건 올리기]가 있다 | 탭별 빈 상태 | — | MP-DT-01~03 |
| AC-MP-06 | 닉네임 변경은 가입과 같은 스키마로 검증하고, 대소문자만 바꾸는 것은 허용하며, 남이 쓰면 `409`다 | 같은 `useForm` · 칸 오류 [F05](frontend/05-forms.md) | T11 · 유니크 `409` [B03](backend/03-transactions.md) | MP-IN-01, 03, 04 |
| AC-MP-07 | 닉네임이 바뀌면 헤더 · 채팅 목록 · 메시지 등 모든 곳에서 새 닉네임이 보인다 | `['me']` 갱신 [F03](frontend/03-cache.md) | 닉네임은 `User`에서만 읽음 (메시지에 복사 안 함) [B02](backend/02-data-model.md) | MP-IN-06 |
| AC-MP-08 | 아바타는 1장을 클라이언트에서 512px 정사각 중앙 크롭 후 업로드하고 `PATCH /me { avatarUploadId }`로 저장하며 이전 파일은 삭제한다. [기본 이미지로]로 되돌릴 수 있다 | 512px 중앙 크롭 · 업로드 · [기본 이미지로] [F05](frontend/05-forms.md) | T10 · 커밋 후 이전 파일 삭제 [B03](backend/03-transactions.md) | MP-OK-08, 09, MP-IM-02, 05 |
| AC-MP-09 | 비밀번호 변경은 현재 · 새 · 확인 세 칸이며 현재가 틀리면 `400 WRONG_PASSWORD`, 새 비밀번호가 현재와 같으면 거부하고, 성공 시 `tokenVersion`이 올라가 다른 세션이 무효화되며 현재 세션은 새 토큰을 받는다 | `/me/password` 화면 · 칸 오류 [F04](frontend/04-errors.md) | T9 · `tokenVersion` +1 · 새 쿠키 [B03](backend/03-transactions.md) | MP-OK-12, MP-PW-01~04 |
| AC-MP-10 | 프로필 수정 중 변경이 있으면 이탈 확인이 뜬다 | `useLeaveGuard(dirty)` [F05](frontend/05-forms.md) | — | MP-UI-04 |
| AC-MP-11 | `GET /me`는 본인용 사용자 객체와 `counts { onSale, reserved, sold, purchased }`를 돌려준다 | `['me']` 하이드레이트 | 본인용 직렬화 + `counts` | MP-DT-20 |
| AC-MP-12 | `PATCH /me` 본문의 `id · email · role`은 무시된다 | 보내지 않음 | 화이트리스트 [B04](backend/04-authorization.md) | MP-AU-02 |

범위 밖: 남의 프로필, 탈퇴, 설정, 카드에서 상태 변경, 매너온도 · 후기 [MP-OK-04, 11, 13, 15, MP-DT-08, 09].

---

## 10. 채팅 알림

**유저 스토리** — 사용자로서, 다른 화면에 있어도 새 메시지가 온 걸 알고 한 번에 그 방으로 가고 싶다.

**권한** — 로그인. 알림은 `user:{id}` 룸으로만 전달.

| AC | 조건 | 프론트가 하는 것 | 백엔드가 하는 것 | 근거 |
| --- | --- | --- | --- | --- |
| AC-NT-01 | 하단 탭 [채팅] 배지는 **읽지 않은 메시지가 있는 방의 수**이며 `GET /me/unread → { rooms }`와 소켓 `notification:unread { total }`로 유지된다 | `['me','unread']` 쿼리 · 소켓으로 갱신 [F03](frontend/03-cache.md) | `GET /me/unread` · `notification:unread` [B09](backend/09-socket-server.md) | 핵심 정의, 결정 0008, NT-DT-01 |
| AC-NT-02 | 계산은 `ChatRoom.lastSeq > ChatRoomMember.lastReadSeq`인 방의 수이며 Message 테이블을 조인하지 않는다 (내 메시지는 저장 때 내 `lastReadSeq`가 함께 올라간다) | — | 비정규화 컬럼으로 계산 [B02](backend/02-data-model.md) | NT-DT-02 |
| AC-NT-03 | `Notification` 테이블은 없다 | — | 테이블 없음 [B02](backend/02-data-model.md) | 핵심 정의 |
| AC-NT-04 | 로그인 직후 · 포그라운드 복귀 · 소켓 재연결 시 `GET /me/unread`로 배지를 맞춘다 | 로그인 · 포커스 · 재연결 시 재조회 [F07](frontend/07-socket-client.md) | — | NT-OK-01, NT-CC-09 |
| AC-NT-05 | 채팅 목록 · 해당 방이 아닌 화면에서 새 메시지가 오면 상대 아바타 · 닉네임 · 1줄 미리보기 토스트가 뜨고, 클릭하면 그 방으로 간다(작성 중 폼이 있으면 이탈 확인 먼저) | 토스트 조건 판단 · 클릭 이동 · 이탈 확인 [F07](frontend/07-socket-client.md) | `latest` 요약 포함 [B09](backend/09-socket-server.md) | NT-OK-02~07 |
| AC-NT-06 | 같은 방의 5초 안 연속 메시지는 "{닉네임}: 메시지 N개" 하나로 합치고, 토스트는 최대 3개까지 쌓인다 | 같은 방 5초 합침 · 최대 3 [F02](frontend/02-state.md) | — | 핵심 정의, NT-CC-01, 02 |
| AC-NT-07 | 방에 들어가 읽으면 배지가 즉시 줄고(낙관적) 내 다른 세션에도 `notification:unread`가 간다 | 낙관적 −1 [F03](frontend/03-cache.md) | T8 후 내 세션에 전달 [B09](backend/09-socket-server.md) | NT-OK-09, NT-CC-07 |
| AC-NT-08 | 읽지 않은 방이 있으면 브라우저 제목이 `(N) neighbo`다 | `document.title` 갱신 | — | NT-OK-11 |
| AC-NT-09 | 삭제 · 거래완료 상품의 방도 배지에 포함된다 | — | 상품 상태 무관 계산 | NT-ST-01, 02 |
| AC-NT-10 | 로그아웃 시 배지 0 · 토스트 큐 비움 · 소켓 끊김이다 | 로그아웃 정리 [F07](frontend/07-socket-client.md) | — | NT-ST-04 |
| AC-NT-11 | 탭 접근 가능한 이름은 "채팅, 읽지 않은 대화 N개"이고 토스트는 `role="status"`로 포커스를 뺏지 않으며 상단 중앙(1024px은 우상단)에 뜬다 | 탭 이름 · 토스트 역할 · 위치 [F06](frontend/06-focus.md) | — | NT-A11Y-01~04 |
| AC-NT-12 | `notification:unread`는 서버가 `user:{id}` 룸에만 emit하며 `GET /me/unread`는 분당 60회 제한이다 | — | `user:{id}` 룸만 · 분당 60 [B07](backend/07-protection.md) [B09](backend/09-socket-server.md) | NT-SEC-02, 03 |
| AC-NT-13 | 재연결 시 배지만 `GET /me/unread`로 맞추고, 끊긴 동안 온 메시지의 토스트는 띄우지 않는다 | 재연결 시 배지만 맞추고 토스트 없음 [F07](frontend/07-socket-client.md) | — | NT-CC-05 |
| AC-NT-14 | 탭이 숨겨진 동안에는 토스트 없이 배지와 탭 제목만 갱신하고, 돌아왔을 때 밀린 토스트를 몰아 띄우지 않는다 | 숨김 동안 토스트 없음 [F07](frontend/07-socket-client.md) | — | NT-CC-08 |
| AC-NT-15 | 소켓이 끊겨도 별도 폴링을 하지 않는다 | 폴링 없음 | — | NT-NW-02 |

범위 밖: 알림 목록 화면, 소리 · 진동, Web Push, 이메일, 방별 · 전체 알림 끄기, 상태 변경 알림 [NT-OK-14~19, 알림 종류].

---

## 11. 비기능 요구사항

| 영역 | 요구 | 근거 |
| --- | --- | --- |
| 성능 | 목록 · 상세 · 채팅 목록 첫 화면은 서버 렌더이며, 커서 페이지네이션 쿼리는 인덱스를 타고 `EXPLAIN`으로 확인한다 | PL-DT-04, CL-DT-04 |
| 가용성 | 서버 재시작 · 배포 중 소켓이 끊겨도 클라이언트가 자동 재연결해 누락 없이 복구한다 | CH-CC-13 |
| 데이터 | 개발 · 테스트 · 운영 모두 PostgreSQL이며 마이그레이션은 배포 파이프라인에서 자동 적용한다 | 결정 0002, BRANCHING |
| 보안 | 비밀키 · DB URL은 환경 변수로만 존재하고 부팅 시 검증에 실패하면 즉시 종료한다 | tech/deploy |
| 접근성 | 0.5절 전부. 키보드만으로 열 가지 기능을 끝까지 쓸 수 있는지 E2E로 확인한다 | 00 개요 7절 |
| 테스트 | 이 문서의 모든 AC는 같은 이름의 테스트 하나와 대응한다 | 00 개요 7절 |
| 브라우저 | 최신 2개 버전의 Chrome · Safari · Edge · Samsung Internet | CM-UI-09 |

---

## 12. 02 데이터 모델로 넘기는 것

**모두 [백엔드 02 데이터 모델](backend/02-data-model.md#1-01에서-넘긴-여섯-가지-결정)에서 결정했습니다.**

| 항목 | 결정 |
| --- | --- |
| `ChatRoomMember` 테이블 vs `ChatRoom`의 두 컬럼 | `ChatRoomMember` + 정렬용 `lastActivityAt` 비정규화 |
| `Upload` 모델 vs `ProductImage.productId nullable` | 별도 `Upload`, 연결 시 `ProductImage` 생성 후 삭제 |
| `soldPrice` 스냅샷 | 둔다 — 거래완료 전이 때 저장 |
| ID 형식 | 전 테이블 `cuid()` |
| 부분 유니크 인덱스 | 1차는 일반 유니크, 탈퇴 도입 시 전환 |
| 인덱스 목록 | 쿼리별 표 |
