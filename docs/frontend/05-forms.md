# 프론트 05 · 폼

[프론트엔드 설계](README.md) · 앞: [04 에러 경계](04-errors.md) · 다음: [06 포커스와 라이브 리전](06-focus.md)

**일곱 개 폼에 입력·정규화·검증·서버 오류 반영의 공통 흐름을 적용하도록 설계했습니다.** 입력 중에는 불필요하게 제한하지 않고, 필드 이탈 시 정규화·검증하며, 제출 시 전체 값을 확인합니다. 검증 규칙은 공유 스키마를 사용하고 최종 판단은 서버 응답을 따릅니다.

## 1. 폼 목록

| 폼 | 칸 | 특이점 | 근거 |
| --- | --- | --- | --- |
| 회원가입 | 이메일 · 비밀번호 · 확인 · 닉네임 | 이메일 · 닉네임은 칸을 떠날 때 중복 미리 확인 | AC-SU-01~23 |
| 로그인 | 이메일 · 비밀번호 | 실패 시 비밀번호만 비움, Caps Lock 안내 | AC-LI-05~08 |
| 거래 등록 | 사진 · 제목 · 가격 · 나눔 · 설명 | 즉시 업로드, `idempotencyKey`, 이탈 확인 | AC-PC-01~20 |
| 거래 수정 | 등록과 같음 + 기존 사진 | 초기값 복사, 변경 감지 | AC-PC-30~36 |
| 프로필 수정 | 닉네임 · 아바타 | 아바타 즉시 업로드 · 중앙 크롭 | AC-MP-06~08 |
| 비밀번호 변경 | 현재 · 새 · 확인 | | AC-MP-09 |
| 채팅 입력 | 메시지 | 폼이 아니라 입력창 하나 — IME · Enter 규칙 | AC-CH-12, 13 |

## 2. 한 칸의 생애

```
입력 중 ──────────▶ 칸을 떠남(blur) ─────────────▶ 오류 있던 칸에 다시 입력 ─▶ 제출
 막지 않음            ① 정규화 → 칸 값 교체          입력마다 재검증              전체 정규화 · 검증
 (길이 카운터만)      ② 스키마 검증 → 오류 표시      (고치는 즉시 오류가 사라짐)   → 첫 오류 포커스
                     ③ (이메일 · 닉네임) 중복 확인                               → 서버 → fields 반영
```

| 단계 | 규칙 | 왜 | 근거 |
| --- | --- | --- | --- |
| 입력 중 | 글자를 지우거나 막지 않는다. 한글 조합 중(`isComposing`)엔 아무 판단도 안 한다 | 말없이 사라지는 글자는 스크린리더 사용자가 이유를 모르고, 조합 중 개입은 한글을 깨뜨린다 | AC-CM-61 |
| 칸을 떠날 때 ① | `normalizeEmail` 등 공유 함수로 고친 값을 **칸에 다시 넣는다** | 무엇이 바뀌었는지 사용자가 볼 수 있게 | AC-CM-62 |
| 칸을 떠날 때 ② | 공유 Zod 스키마의 그 칸 규칙 | 입력 도중 "8자 이상" 오류가 뜨는 건 방해 | AC-SU-03 |
| 다시 입력 | 오류가 있던 칸만 입력마다 재검증 | 고친 순간 오류가 사라져야 함 | AC-SU-03 |
| 제출 | 버튼은 항상 활성. 누르면 전체 검증 → 첫 오류로 포커스 + 상단 요약 | 비활성 버튼은 "왜 안 눌리는지" 알 수 없다 | AC-SU-04, 17 |
| 서버 응답 | `fields`를 그대로 칸에. 프론트 판단과 달라도 서버를 따른다 | 서버가 최종 | AC-SU-18 |
| 실패 | 입력값 유지 (로그인 비밀번호만 예외) | 다시 쓰게 하지 않는다 | AC-CM-22 |

## 3. `useForm` 훅

[02 상태 소유권 5절](02-state.md)에서 라이브러리 대신 훅 하나로 정했다. 훅이 맡는 것:

```ts
const form = useForm({
  schema: signupSchema,            // 공유 Zod
  normalize: { email: normalizeEmail, nickname: normalizeText },
  onSubmit: (values) => api.signup(values),
});
// form.field('email') → { value, onChange, onBlur, error, describedBy, invalid }
```

| 기능 | 구현 |
| --- | --- |
| 값 · 오류 · 건드림 | 칸별 상태 하나 |
| 칸 단위 검증 | `schema.shape[name].safeParse` (교차 검증 — 비밀번호 확인 — 은 `superRefine`을 칸 오류로 매핑) |
| 제출 | 정규화 → `safeParse` 전체 → 오류면 첫 칸 `focus()` → 아니면 `onSubmit` → `ApiError.fields` 반영 |
| 제출 중 | `submitting` — 버튼 비활성 + 스피너, 두 번 제출 방지 | 
| 변경 감지 | 초기값과 깊은 비교 → 이탈 확인 판단 (수정 폼 · 프로필) |

## 4. 칸 컴포넌트 — 접근성이 기본값

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

## 5. 이탈 확인

작성 중 나가면 내용이 사라진다 [AC-PC-04]. 그런데 **App Router에는 이동을 막는 공식 API가 없다** (Pages Router의 `routeChangeStart` 같은 것이 없음). 그래서 경로를 셋으로 나눠 막는다:

| 나가는 경로 | 막는 방법 |
| --- | --- |
| 탭 닫기 · 새로고침 · 주소창 | `beforeunload` (브라우저 기본 확인창) |
| 앱 안의 링크 클릭 | 내부 링크 컴포넌트가 "이탈 가드가 켜져 있으면" 이동 전에 확인 모달 |
| 뒤로가기 | 가드가 켜질 때 `history.pushState`로 한 칸 쌓고, `popstate`에서 확인 모달 → 취소면 다시 쌓음 |

**뒤로가기 가드는 구현하며 확인할 것**: App Router도 `history.pushState`에 자기 상태를 싣는다. 가드가 이력을 한 칸 더 추가하면 그 칸에는 라우터 상태가 없어, 확인 모달에서 [나가기]를 눌렀을 때 `history.go(-2)`가 맞는지 · 라우터가 그 칸을 만났을 때 다시 렌더하지 않는지가 브라우저마다 다를 수 있다. 구현 첫 단계에서 크롬 · 사파리(iOS 스와이프 뒤로가기 포함)로 확인하고, 깨지면 뒤로가기만 "모달 대신 임시 저장 후 이동"으로 낮춘다.

가드는 `useLeaveGuard(dirty)` 하나로 켜고 끈다. 제출 성공 직후엔 끄고 이동한다. 이 부분은 프레임워크가 도와주지 않는 영역이라 구현 후 [기술 노트](../tech/README.md) `nextjs-app-router.md`에 겪은 문제를 남긴다.

## 6. 폼별 처리 기준

### 거래 등록 — 업로드가 폼보다 먼저 끝나야

- 사진 선택 즉시 업로드(동시 3), 썸네일마다 진행률 · 실패 · 재시도 [AC-PC-10, 15]
- 클라이언트에서 먼저 **다시 인코딩**한다 (긴 변 1600px, JPEG 0.85, `createImageBitmap` + `canvas`) — 10MB 사진을 1MB로 보내 업로드 시간을 줄이고, 업로드가 지나는 프록시의 본문 한도(4.5MB) 아래를 보장하며, HEIC를 서버가 받을 수 있는 JPEG로 바꾸고, 위치 정보가 담긴 EXIF를 브라우저 밖으로 내보내지 않는다 [AC-PC-12, 13]
- 디코드 실패(`createImageBitmap`이 거부 — 데스크톱 크롬의 HEIC 등)는 업로드하지 않고 그 썸네일에 "이 사진은 열 수 없어요. jpg · png로 바꿔 올려 주세요" [AC-PC-12]
- 업로드 주소는 `/api/uploads?kind=PRODUCT` — `kind`를 쿼리로 둔다 (서버가 파일보다 먼저 알아야 함)
- 업로드 중 [등록하기] 비활성 + "사진 올리는 중 N/M" — 이 경우만 비활성 버튼을 쓰되 이유를 버튼 옆에 글로 [AC-PC-16]
- `idempotencyKey`는 폼이 처음 렌더될 때 만들고, 재시도에도 같은 값 [AC-PC-08]
- 가격: 입력 중 콤마 삽입 시 커서 위치 보존 (콤마 수 변화만큼 이동)

### 회원가입 — 미리 확인은 편의일 뿐

이메일 칸을 떠날 때 중복을 미리 알려주지만, 확인과 제출 사이에 누가 가져갈 수 있다 [SU-CC-03]. 미리 확인이 실패하면 조용히 넘어가고, 제출의 `409`가 최종이다 [AC-SU-08].

### 채팅 입력 — Enter의 의미가 기기마다 다르다

| 환경 | Enter | Shift+Enter | 판별 |
| --- | --- | --- | --- |
| PC | 전송 | 줄바꿈 | `matchMedia('(pointer: fine)')` |
| 모바일 | 줄바꿈 | — | 전송은 버튼만 |
| 한글 조합 중 | 무시 | 무시 | `e.nativeEvent.isComposing` — 마지막 글자 두 번 전송 버그 방지 [AC-CH-12] |
