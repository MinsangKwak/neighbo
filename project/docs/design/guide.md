# UI·퍼블리싱·접근성 가이드

[문서 목차](../README.md) · [프론트엔드 개발](../dev/frontend.md) · [요구사항](../planning/features/00-common.md)

**레이블·입력 오류·초점·알림·반응형 규칙을 공통 UI의 책임으로 관리합니다.** 화면 구성과 설계 기준을 설명하며, 세부 props와 실제 렌더링은 [공통 컴포넌트](../../../frontend-react/src/components/)·[공통 CSS](../../../frontend-react/src/styles/globals.css)가 기준입니다. 전체 접근성 준수나 인증 결과를 의미하지 않습니다.

| 구현 | 확인하는 동작 |
| --- | --- |
| [Field](../../../frontend-react/src/components/Field.tsx) · [useForm](../../../frontend-react/src/lib/form/useForm.ts) | 보이는 레이블, 힌트·오류 연결, 서버 필드 오류와 첫 오류 입력 초점 |
| [Dialog](../../../frontend-react/src/components/Dialog.tsx) · [RouteFocus](../../../frontend-react/src/lib/a11y/RouteFocus.tsx) | 네이티브 모달·제목 연결·복귀 초점, 경로 이동 뒤 h1 초점 |
| [Toast](../../../frontend-react/src/components/Toast.tsx) · [공통 CSS](../../../frontend-react/src/styles/globals.css) | status·alert, 명도 대비 토큰·44px 조작 영역·동작 줄이기 |
| [색 조합 검사](../../tests/frontend-react/styles/tokens.test.ts) · [레이아웃 E2E](../../tests/frontend-react/e2e/layout.spec.ts) · [접근성 E2E](../../tests/frontend-react/e2e/a11y.spec.ts) | 본문 4.5:1·UI 3:1 조건, 좁은 화면·보이는 문구와 이름 비교, 주요 화면 자동 검사 |

## 입력 레이블과 오류

`<Field>` 하나가 레이블 · 입력 · 규칙 안내 · 오류 · 카운터를 묶는다. 매번 손으로 `aria-*`를 잇지 않게.

```html
<label for="email">이메일</label>
<input id="email" type="email" inputmode="email" autocapitalize="off" autocorrect="off"
       spellcheck="false" autocomplete="email" maxlength="254"
       aria-invalid="true" aria-describedby="email-hint email-error" required>
<p id="email-hint">로그인할 때 쓰는 주소예요</p>
<p id="email-error">이메일 형식이 아니에요</p>
```

| 규칙 | 근거 |
| --- | --- |
| 규칙 안내(`hint`)는 오류 전부터 보이고 `aria-describedby`에 항상 포함 | AC-SU-12, AC-CM-44 |
| 칸 종류마다 입력 속성 묶음을 미리 정의 (`email` · `newPassword` · `currentPassword` · `nickname` · `price` · `text`) | AC-CM-60, 65, AC-SU-06a, AC-LI-05c |
| grapheme 길이는 `maxlength`로 못 센다 → 카운터 + 검증. 붙여넣기 초과분은 잘라내고 알림 | AC-SU-13, AC-CM-64 |
| 비밀번호 보기 토글은 `<button aria-pressed>` | AC-SU-11 |


## 06 · 포커스와 라이브 리전

**화면 변화마다 포커스 위치와 스크린리더 안내를 정했습니다.** 경로 이동, 모달, 목록 추가, 실시간 메시지처럼 전체 새로고침 없이 일어나는 변화를 키보드·스크린리더 사용자도 확인할 수 있도록 처리합니다.

### 1. 화면 변화별 규칙

| 순간 | 포커스 | 스크린리더가 읽는 것 | 방법 | 근거 |
| --- | --- | --- | --- | --- |
| 경로 이동 | 새 페이지 `h1` | 페이지 제목 | 경로 변화 감지 → `h1`에 `tabIndex=-1` + `focus()`. **첫 진입(새로고침)에는 하지 않음** — 브라우저가 이미 처리 | AC-CM-41 |
| 모달 · 바텀시트 열림 | 안의 첫 조작 요소 (삭제 확인은 [취소]) | 대화상자 제목 | 네이티브 `<dialog>` `showModal()` | AC-CM-42, AC-PX-02 |
| 모달 닫힘 | 열었던 버튼 | — | 연 요소를 기억했다가 복귀 | AC-CM-42 |
| [더 보기] 완료 | 새로 붙은 첫 카드 | "20개 더 불러왔어요" | 라이브 리전 | AC-PL-03 |
| 폼 제출 실패 | 첫 오류 칸 | 상단 요약 "입력 내용 N곳을 확인해 주세요" | `role="alert"` | AC-SU-17, AC-CM-44 |
| 로그인 실패 | 이메일 칸 (비밀번호 칸 비움) | "이메일 또는 비밀번호가 맞지 않아요" | `role="alert"` | AC-LI-07 |
| 토스트 | 이동 없음 | 토스트 문장 | `role="status"` (에러는 `alert`) | AC-CM-43 |
| 상태 `<select>` 변경 | 그대로 | "예약중으로 바꿨어요" | 라이브 리전 | AC-PD-03 |
| 마이 탭 전환 | 탭에 유지 | "판매중 3개" | 라이브 리전 | AC-MP-02 |
| 상대 메시지 수신 | 그대로 | "{닉네임}: {내용}" | 채팅 전용 라이브 리전 (아래 3절) | AC-CH-42 |
| [새 메시지 ↓] 누름 | 마지막 메시지 | — | | CH-A11Y-04 |
| 채팅 목록 행이 위로 이동 | 그 행에 있었으면 유지 | — | 행 `key`를 방 id로 고정 (DOM 재사용) | AC-CL-13 |
| 페이지 에러 · 404 | `h1` | 에러 제목 | | AC-CM-23 |
| 로딩 | 그대로 | (busy 상태) | 스켈레톤 영역 `aria-busy="true"` | CM-A11Y-10 |

### 2. 설계 판단

#### 모달 — 라이브러리 대신 `<dialog>`

포커스 가두기 · Esc 닫기 · 뒤 배경 조작 막기는 직접 만들면 빠지는 경우가 많다(Shift+Tab 역방향, 동적으로 추가된 버튼). 네이티브 `<dialog>`의 `showModal()`은 셋을 브라우저가 처리하고, 배경을 `inert`로 만든다. 지원 범위(최신 2개 버전 [CM-UI-09])에서 모두 동작한다. 남는 일은 "닫힌 뒤 연 요소로 돌아가기" 하나다.

바텀시트(360px)와 중앙 다이얼로그(1024px)는 같은 `<dialog>`에 CSS만 다르게 [AC-PX-13].

#### 라이브 리전 — 미리 있어야 읽힌다

라이브 리전은 **문장이 들어가기 전에 DOM에 이미 있어야** 스크린리더가 변화를 감지한다. 문장과 함께 새로 그리면 읽히지 않는 경우가 많다. 그래서 루트 레이아웃에 빈 리전 두 개(`polite` · `assertive`)를 미리 두고, `AnnouncerContext`의 `announce(text)`가 문장을 넣는다 ([02 상태 소유권](../dev/frontend.md#02--상태-소유권)).

같은 문장을 연속으로 넣으면 변화가 없어 다시 읽히지 않는다 ("20개 더 불러왔어요"를 두 번). 넣기 전에 비우고, 다음 프레임에 넣는다. 이 현상은 [기술 노트](../dev/experiments.md) `accessibility.md` 스파이크 ②에서 재현한다.

#### 채팅 — 내가 보낸 것까지 읽으면 시끄럽다

메시지 목록 전체를 `aria-live`로 두면 ① 내가 보낸 메시지를 다시 읽고 ② 과거 메시지 50개를 불러올 때 50개를 읽는다. 그래서:

- 목록은 `role="log"`이되 `aria-live="off"`
- 시각 숨김 `role="status"` 영역에 **상대가 보낸 새 메시지만** "{닉네임}: {내용}"으로 넣는다
- 과거 메시지 로드는 "이전 메시지 50개를 불러왔어요" 한 문장

[AC-CH-42]

#### 경로 이동 포커스 — Next.js가 해 주지 않는 것

App Router는 경로 이동 후 포커스를 관리하지 않는다. 그대로 두면 포커스가 클릭한 링크(이제 없는 요소)에 남거나 `body`로 떨어져, 스크린리더 사용자는 페이지가 바뀐 걸 모른다. 루트에 `<RouteFocus />`를 두어 `usePathname` 변화 시 `h1`으로 옮긴다. 쿼리스트링만 바뀔 때(필터 · 탭)는 옮기지 않는다 — 같은 페이지 안의 변화는 라이브 리전으로 알린다.

### 3. 키보드

| 요소 | 조작 | 근거 |
| --- | --- | --- |
| 모든 화면 | Tab 순서 = 시각 순서, 포커스 링 3:1 이상 (`focus-visible`) | AC-CM-40 |
| 본문 바로가기 | 첫 Tab에 "본문으로 건너뛰기" 링크 | — |
| 캐러셀 | 이전 · 다음 버튼, 자동 재생 없음 | AC-PD-17 |
| 마이 탭 | 화살표 키로 탭 이동 (`role="tablist"`) | AC-MP-02 |
| `⋯` 메뉴 | 화살표 키, Esc로 닫고 버튼 복귀 | PX-A11Y-03 |
| 카드 | 카드 전체가 링크 하나 — 안에 다른 버튼 없음 | AC-PL-05 |
| 비활성처럼 보이는 버튼 | `disabled` 대신 `aria-disabled` + 누르면 이유 안내 (거래완료 [채팅하기]) — `disabled`는 포커스조차 안 돼서 이유를 들을 수 없다 | AC-PD-18 |

### 4. 움직임

`prefers-reduced-motion: reduce`면 캐러셀 슬라이드 · 토스트 등장 · 목록 재정렬 애니메이션을 끄고 즉시 바꾼다 [AC-CM-49]. 기본값도 짧게(150ms 이하) — 움직임은 변화를 알리는 보조 수단이지 장식이 아니다.

### 5. 검증

| 방법 | 언제 |
| --- | --- |
| Playwright로 키보드만 사용해 판매자 · 구매자 시나리오 끝까지 | 기능 묶음마다 [공통 요구사항 11절 비기능] |
| 자동 검사(axe) — 대비 · 레이블 · 역할 | 컴포넌트 테스트 |
| 스크린리더(VoiceOver · TalkBack)로 채팅 수신 · 폼 오류 · 모달 | 워크스루 때 수동 — 자동 검사가 "읽히는 순서와 시점"은 못 본다 |

## 08 · 화면 명세

**13개 화면마다 보이는 것, 네 가지 상태(로딩 · 빈 · 오류 · 권한), 조작과 이동을 한 표로 고정합니다.** 서버 · 클라이언트 렌더 범위는 [01 렌더링 전략](../dev/frontend.md#01--렌더링-전략)에, 세부 동작은 각 기능 문서의 수용 조건에 있고, 이 절은 화면 단위로 다시 묶은 색인입니다. 새 동작을 정하지 않습니다 — 여기 적힌 것은 모두 수용 조건에서 왔습니다.

### 1. 화면 구조

```
(tabs) 하단 탭바 있음            탭바 없음
├─ /            홈              ├─ /products/[id]        상세
├─ /search      검색            ├─ /products/new         등록
├─ /chats       채팅 목록        ├─ /products/[id]/edit   수정
└─ /me          마이            ├─ /chats/[roomId]       채팅방
                                ├─ /me/edit · /me/password
                                └─ /login · /signup
```

모든 화면 공통: 본문 폭 최대 640px, `<title>`은 "{화면 이름} · neighbo", 경로 이동 시 `h1`으로 포커스, 경로마다 실제 레이아웃과 같은 자리의 스켈레톤 [AC-CM-20, 결정 0014].

### 2. 화면별 명세

| 화면 | 구성 (위 → 아래) | 로딩 | 빈 상태 | 오류 · 권한 | 조작 → 결과 | 기능 문서 |
| --- | --- | --- | --- | --- | --- | --- |
| 홈 `/` | 헤더(로고 · 검색) → "거래완료 숨기기" 토글 → 상품 카드 2열 → [더 보기] → 플로팅 `+` 버튼(1024px에서는 헤더 [판매하기]) | 카드 스켈레톤 6개 | "아직 올라온 물건이 없어요" + (로그인 시) [첫 물건 올리기] | 영역에 [다시 시도], 헤더 · 탭바는 유지 | 카드 → 상세 · [더 보기] → 20개 추가 후 새 첫 카드로 포커스 · `+` → 등록(비로그인이면 로그인) | [03](../planning/features/03-product-list.md) |
| 검색 `/search?q=` | 검색창(검색어 유지) → 결과 카드 2열 → [더 보기] | 같음 | "'{q}'에 대한 검색 결과가 없어요" + [검색어 지우기] | 같음 | 검색어는 URL에 — 새로고침 · 공유 유지 | [03](../planning/features/03-product-list.md) |
| 상세 `/products/[id]` | 헤더(← · 판매자면 `⋯`) → 사진 캐러셀 → 판매자 → 제목 · 상태 배지 · 상대 시간 → 설명 → 하단 고정 바(가격 + 버튼) | 사진 영역 + 텍스트 3줄 | — | 없음 · 삭제됨 → 404 화면 | 구매자: [채팅하기] / [채팅 이어하기] → 채팅방 · 판매자: 상태 `<select>` · `⋯` → [수정] · [삭제] · [대화 중인 채팅 N] → 채팅 목록(상품 필터) | [05](../planning/features/05-product-detail.md) · [06](../planning/features/06-product-delete.md) |
| 등록 `/products/new` | 헤더(← · 제목) → 사진 선택 줄 → 제목 → 가격 · 나눔 → 설명 → 하단 [등록하기] | 껍데기 즉시 | — | 비로그인 → 로그인(`next`) | 사진 선택 → 즉시 업로드 · 제출 → 상세 · 변경 후 이탈 → 확인 | [04](../planning/features/04-product-create.md) |
| 수정 `/products/[id]/edit` | 등록과 같음 + 기존 사진 | 폼 스켈레톤 | — | 남의 상품 · 삭제됨 → 404 화면 | 저장 → 상세(`replace`) + "수정했어요" 토스트 · 변경 없이 저장해도 허용 | [04](../planning/features/04-product-create.md) |
| 채팅 목록 `/chats` | 헤더 → (필터 중이면 상품 요약 + 해제) → 방 행 목록 → [더 보기] | 행 스켈레톤 6개 | "아직 채팅이 없어요…" + [물건 보러 가기] | 영역에 [다시 시도] · 비로그인 → 로그인 | 행 → 채팅방 · 새 메시지 → 행이 맨 위로, 배지 갱신 | [07](../planning/features/07-chat-list.md) |
| 채팅방 `/chats/[roomId]` | 헤더(← · 상대 닉네임) → 상품 요약 바 → 메시지 목록 → 입력창 | 말풍선 스켈레톤 | "{상대}님에게 첫 메시지를 보내 보세요" | 비참여자 → 404 화면 · 끊김 5초 → 상단 안내 바 · 삭제된 상품 → 입력창 비활성 + 이유 | 전송 → 말풍선(전송 중 → 확정 / 실패 [재시도] [삭제]) · 상단 도달 → 이전 50개 · 상품 요약 → 상세 | [08](../planning/features/08-chat.md) |
| 마이 `/me` | 프로필 카드 → [프로필 수정] → 탭(판매중 · 예약중 · 거래완료 · 구매 내역) → 카드 목록 → [더 보기] → [비밀번호 변경] · [로그아웃] | 프로필 + 카드 스켈레톤 | 탭마다 다른 문구, 판매중 탭에만 [물건 올리기] | 영역에 [다시 시도] | 탭 → `?status=` 변경 + 개수 알림 · 구매 내역의 삭제된 상품은 "삭제됨", 누를 수 없음 | [09](../planning/features/09-mypage.md) |
| 프로필 수정 `/me/edit` | 아바타(변경 · 기본으로) → 닉네임 → [저장] | 폼 스켈레톤 | — | — | 아바타 선택 → 중앙 크롭 · 즉시 업로드 · 저장 → 마이 · 변경 후 이탈 → 확인 | [09](../planning/features/09-mypage.md) |
| 비밀번호 변경 `/me/password` | 현재 → 새 → 확인 → [변경하기] | 껍데기 즉시 | — | 현재 비밀번호 틀림 → 그 칸 오류 · 데모 계정 → 진입 버튼 비활성 + 이유 [AC-LI-19] | 성공 → 마이 + 토스트, 다른 기기는 로그아웃됨 | [09](../planning/features/09-mypage.md) |
| 로그인 `/login` | 이메일 → 비밀번호(보기 토글) → [로그인] → 가입 링크 → 데모 계정 안내([판매자로 둘러보기] · [구매자로 둘러보기] — 한 번에 로그인) | 껍데기 즉시 | — | 실패 → 폼 상단 알림, 비밀번호만 비움 · 이미 로그인 → 홈 | 성공 → `next` 또는 홈 | [02](../planning/features/02-login.md) |
| 가입 `/signup` | 이메일 → 비밀번호 → 확인 → 닉네임 → [가입하기] → 로그인 링크 | 껍데기 즉시 | — | 칸별 오류 + 상단 요약 · 이미 로그인 → 홈 | 칸을 떠날 때 중복 미리 확인 · 성공 → 로그인 상태로 홈 | [01](../planning/features/01-signup.md) |
| 404 · 오류 | `h1` 제목 → 설명 → [홈으로] / [다시 시도] (5xx는 문의 번호) | — | — | — | 포커스는 `h1` | [04 에러 경계](../dev/frontend.md#04--에러-경계) |

### 3. 화면을 구현할 때의 순서

화면 하나는 ① 서버 컴포넌트의 조회와 권한 분기(`notFound()` · `redirect()`) ② `loading.tsx` 스켈레톤 ③ 정상 상태 ④ 빈 상태 ⑤ 오류 상태 ⑥ 키보드 흐름 순서로 만들고, PR의 셀프 리뷰 체크리스트가 ②~⑥을 확인합니다([개발 규칙](../dev/runbook.md)).

## 09 · 공통 컴포넌트

**두 화면 이상에서 쓰이는 조각만 공통 컴포넌트로 두고, 접근성 요구를 props가 아니라 컴포넌트의 기본 동작으로 넣습니다.** 한 화면에서만 쓰는 조각은 그 화면 폴더에 둡니다. 아래 표는 현재 공통 컴포넌트의 책임을 요약합니다. props·종류·반환값은 링크한 실행 소스를 기준으로 합니다.

### 1. 컴포넌트 목록

| 현재 코드 | 담당하는 UI·접근성 책임 | 요구사항 |
| --- | --- | --- |
| [Button](../../../frontend-react/src/components/Button.tsx) | 네이티브 button, 로딩 중 aria-busy·aria-disabled와 중복 동작 차단. 이동용 링크의 모양은 별도 스타일로 공유 | AC-PC-16, AC-CM-45·47 |
| [Field](../../../frontend-react/src/components/Field.tsx) | label·hint·error 연결과 aria-invalid, 입력 종류별 속성·비밀번호 표시·Caps Lock 안내 | [입력 레이블과 오류](#입력-레이블과-오류) |
| [ProductCard](../../../frontend-react/src/components/ProductCard.tsx) · [StatusBadge](../../../frontend-react/src/components/StatusBadge.tsx) | 상품 이동·사진 대체 텍스트, 거래 상태의 글자 표시 | AC-PL-01·02, AC-MP-04, AC-CM-45·46 |
| [ImagePicker](../../../frontend-react/src/components/ImagePicker.tsx) | 사진 선택·업로드·실패·재시도·제거 상태와 안내 | AC-PC-10~16 |
| [EmptyState](../../../frontend-react/src/components/EmptyState.tsx) · [ErrorState](../../../frontend-react/src/components/ErrorState.tsx) · [Skeleton](../../../frontend-react/src/components/Skeleton.tsx) | 빈 결과·오류·로딩 상태. 제목 계층과 재시도·요청 ID 안내 | AC-PL-10, AC-CL-09, AC-MP-05, AC-CM-20 |
| [Dialog](../../../frontend-react/src/components/Dialog.tsx) · [LeaveConfirm](../../../frontend-react/src/components/LeaveConfirm.tsx) | 네이티브 모달, 제목·초점·닫기, 작성 중 이동 확인 | AC-CM-42, AC-PX-02 |
| [Toast](../../../frontend-react/src/components/Toast.tsx) | status·alert로 안내하며 포커스를 옮기지 않음 | AC-CM-43 |
| [TabBar](../../../frontend-react/src/components/TabBar.tsx) · [AppHeader](../../../frontend-react/src/components/AppHeader.tsx) | 현재 경로·채팅 배지, 제목·뒤로 이동 | AC-NT-01, AC-CH-20, AC-PD-23 |
| [Avatar](../../../frontend-react/src/components/Avatar.tsx) · [RelativeTime](../../../frontend-react/src/components/RelativeTime.tsx) | 사용자 이미지와 시간 표시 | AC-CM-45·50, AC-CL-12 |

채팅 전용 연결 표시는 [ConnectionBar](../../../frontend-react/src/features/chat/ConnectionBar.tsx)에 둡니다. 더 보기의 새 항목 초점, 메시지 실패·재시도·읽음, 같은 방 5초 알림 합치기는 공통 props 사본 대신 [목록](../planning/features/03-product-list.md)·[채팅](../planning/features/08-chat.md)·[알림](../planning/features/10-notification.md)의 계약과 해당 기능 코드에서 확인합니다.

### 2. 디자인 토큰

값은 `frontend-react/src/styles/globals.css`의 `@theme` 한 곳에만 두고 컴포넌트는 토큰 이름만 씁니다(Tailwind 4는 설정 파일 대신 CSS에서 토큰을 정의합니다). 기본 팔레트와 글자 크기는 비워 토큰 밖의 값을 쓸 수 없게 했고, 임의 값(`w-[137px]`)은 lint로 막습니다. 색 값은 구현 0단계에서 정했고, 아래 조건은 [색 조합 검사](../../tests/frontend-react/styles/tokens.test.ts)가 토큰 조합마다 명암비를 계산해 확인합니다.

| 토큰 묶음 | 항목 | 정하는 조건 |
| --- | --- | --- |
| 색 | `bg` · `surface` · `text` · `text-muted` · `border` · `divider`(장식 선, 조건 없음) · `primary` · `danger` · `badge` · `focus` · 위에 얹는 글자 `on-primary` · `on-danger` · `on-badge` | 본문 4.5:1, UI 경계 3:1 이상 [AC-CM-46]. 토큰 조합별 명암비 표를 함께 둔다. 당근마켓의 브랜드 색은 쓰지 않음 |
| 글자 | 12 · 14 · 16 · 18 · 22px, 줄 높이 1.5 | 본문 16px 이상(iOS 입력 확대 방지), 200% 확대에서 가로 스크롤 없음 |
| 간격 | 4px 배수 | — |
| 누름 영역 | 최소 44 × 44px | 아이콘 버튼 포함 [AC-CM-48] |
| 포커스 링 | 2px + 바깥 여백 2px | 배경 대비 3:1, `:focus-visible`에만 [AC-CM-40] |
| 움직임 | 150 · 250ms | `prefers-reduced-motion`이면 0 [AC-CM-49] |

### 3. 두지 않는 것

| 두지 않는 것 | 이유 |
| --- | --- |
| UI 라이브러리(Radix · shadcn 등) | 필요한 겹침 UI가 대화상자 하나뿐이고 네이티브 `<dialog>`로 충분 — [검토 요청 10](../dev/decisions.md#검토-요청) |
| `Select` 컴포넌트 | 상태 변경은 네이티브 `<select>` — 모바일 선택기와 키보드 조작을 브라우저가 처리 |
| 한 화면 전용 조각의 공통화 | 두 번째 사용처가 생길 때 올린다 |
| 다크 모드 | 1차 범위 밖. 토큰을 이름으로만 써 두면 나중에 값만 바꾼다 |

### 4. 검증

컴포넌트마다 Testing Library로 변형별 렌더와 접근성 이름 · 역할을 확인하고, 화면 E2E가 지나는 곳마다 axe 검사를 돌립니다([테스트 전략](../dev/runbook.md#테스트-전략--수용-조건-하나에-테스트-하나)).
