# 브랜치 · 배포 전략 · main은 언제나 배포 가능하게

[문서 목차](../README.md) · [커밋 메시지 규칙](COMMITS.md)

**`main` · `dev` · 작업 브랜치 세 단으로 가고, 릴리스는 브랜치가 아니라 `main`의 태그로 남깁니다.** 기능 하나 = 이슈 하나 = 브랜치 하나 = PR 하나이며, 모든 변경은 PR을 거쳐 스쿼시 병합합니다. 혼자 하는 프로젝트라 승인자가 없으므로, 코드 리뷰의 역할은 CI 필수 검사와 PR 본문의 셀프 리뷰 체크리스트가 대신합니다.

## 왜 이 구조인가

중요한 것은 전략의 이름이 아니라 브랜치 전략이 문서로 있고 PR과 리뷰 흔적이 남는 것입니다. 순수 Git Flow(release · hotfix 포함 5단)는 정기 릴리스가 있는 패키지 소프트웨어를 위한 모델이고, 상시 배포하는 웹 서비스에는 과합니다. 반대로 `main` 하나만 두는 GitHub Flow는 미리보기 환경과 운영 환경을 나누기 어렵습니다. 그래서 둘의 중간 — GitHub Flow에 통합 브랜치 `dev` 하나를 더한 구조 — 를 택했습니다. 소규모 팀에서 가장 널리 쓰이는 형태이기도 합니다.

## 브랜치

| 브랜치 | 역할 | 수명 | 배포 환경 | 직접 push |
| --- | --- | --- | --- | --- |
| `main` | 검증된 변경 통합. 언제나 배포 가능한 상태 | 영구 | **운영** — Vercel Production · Railway Production | 금지 |
| `dev` | 개발 통합. 일반 변경의 PR 대상 | 영구 | **미리보기** — Vercel Preview · Railway Staging | 금지 |
| `feat/*` `fix/*` `style/*` `refactor/*` `docs/*` `test/*` `ci/*` | 작업 하나 | 수 시간 ~ 수 일. 병합 후 삭제 | PR마다 Vercel Preview URL | 허용 |
| `sync-main-vX.Y.Z` | `dev` → `main` 동기화 PR 전용 | PR 하나 | — | 허용 |

작업 브랜치 이름은 `종류/짧은-이름` (ASCII, 커밋 종류와 같은 낱말)이며, 이슈가 있으면 번호를 앞에 둡니다: `feat/12-product-list`, `fix/31-chat-unread-badge`, `docs/3-data-model`.

### 두지 않는 브랜치

| 브랜치 | 두지 않는 이유 | 대신 |
| --- | --- | --- |
| `release/*` | 릴리스 전 안정화 기간이 필요할 만큼 변경이 쌓이지 않는다. 쌓이면 PR을 더 작게 쪼개는 것이 답 | `dev` → `main` 동기화 PR + `main` 태그 `vX.Y.Z` |
| `hotfix/*` | 운영 긴급 수정도 `fix/*` 브랜치로 `main`에 직접 PR하면 된다. 이름만 다른 브랜치를 늘리지 않는다 | `fix/*` → `main` PR, 병합 후 `main` → `dev` 역방향 PR로 되돌려 반영 |

## 흐름

```
이슈 발행 → dev에서 브랜치 → 커밋(역할별) → PR(dev 대상) → CI 통과 → 스쿼시 병합 → 브랜치 삭제
                                                                              ↓ 기능 묶음이 완성되면
                                                             sync PR(dev → main) → 태그 vX.Y.Z → 운영 배포
```

| 단계 | 명령 · 행동 | 규칙 |
| --- | --- | --- |
| 1. 이슈 | GitHub Issue 발행. 제목은 커밋 제목과 같은 꼴 | 01 요구사항의 기능 표 한 줄 = 이슈 하나. 수용 조건을 이슈 본문에 체크리스트로 복사 |
| 2. 브랜치 | `git switch dev && git pull && git switch -c feat/12-product-list` | 항상 최신 `dev`에서 |
| 3. 커밋 | `git commit -s` | [커밋 규칙](COMMITS.md). 역할별로 쪼갠다 — 모델 · API · 화면 · 테스트 · 문서를 한 커밋에 섞지 않는다 |
| 4. PR | `gh pr create --base dev` | 제목은 커밋 제목 꼴. 본문은 아래 템플릿. `Closes #12` |
| 5. 검사 | CI 자동 실행 | lint · 타입 검사 · 테스트. 하나라도 빨강이면 병합 버튼이 잠긴다 |
| 6. 병합 | Squash and merge | 병합 커밋 제목 = PR 제목. 원격 브랜치 자동 삭제 |
| 7. 릴리스 | `sync-main-vX.Y.Z` 브랜치에서 `sync: dev → main — vX.Y.Z` PR | 병합 후 태그. 릴리스 노트는 GitHub Release에 한국어로 |

### 버전

`vMAJOR.MINOR.PATCH`. 1차 범위 열 가지 기능이 모두 끝나면 `v1.0.0`. 그 전까지는 `v0.x.0`으로 기능 묶음마다 올립니다. 태그는 `main`에만 달고, 한 번 단 태그는 옮기지 않습니다.

## 1인 프로젝트 보완 — 리뷰어가 없을 때

**승인자가 없다는 사실을 숨기지 않고, 리뷰가 하던 일을 두 장치로 대신합니다.**

| 리뷰가 하던 일 | 대신하는 장치 |
| --- | --- |
| 깨진 코드 병합 차단 | CI 필수 상태 검사. 실패하면 병합 불가 |
| "이 변경이 요구사항을 만족하는가" 확인 | PR 본문의 수용 조건 체크리스트 — 이슈에서 복사해 와서 하나씩 체크 |
| 빠뜨린 상태 · 접근성 · 권한 점검 | PR 본문의 셀프 리뷰 체크리스트 (아래) |
| 변경 이유 기록 | PR 본문 "문제와 결과" 절 + 커밋 본문 |

### PR 템플릿

코드 단계에서 `.github/PULL_REQUEST_TEMPLATE.md`로 둡니다. 내용은 다음과 같습니다.

```markdown
## 문제와 결과
<!-- 어떤 상황에서 무엇이 필요했고, 변경 후 어떻게 동작하는가 -->

Closes #

## 수용 조건
<!-- 이슈의 수용 조건을 복사해 와서 체크 -->
- [ ]

## 검증
<!-- 실행한 검사와 결과. UI 변경은 모바일(360px) · PC 화면 첨부 -->

## 셀프 리뷰
- [ ] 로딩 · 빈 상태 · 에러 상태가 모두 있다 (화면 변경 시)
- [ ] 권한 검사는 서버에 있다 (삭제 · 수정 · 상태 변경 시)
- [ ] 키보드만으로 이 기능을 끝까지 쓸 수 있다 (화면 변경 시)
- [ ] 문서(docs/)가 코드와 어긋나지 않는다
- [ ] 커밋이 역할별로 나뉘어 있다

## 호환성
<!-- 저장 키 · URL · API 응답 모양 · 환경 변수가 바뀌면 적는다. 없으면 "없음" -->
```

## 브랜치 보호 규칙

GitHub → Settings → Branches에서 `main`과 `dev`에 같은 규칙을 겁니다. 설정값을 그대로 적어 두어 재현할 수 있게 합니다.

| 설정 | 값 | 이유 |
| --- | --- | --- |
| Require a pull request before merging | 켬 | 직접 push 차단 |
| Required approvals | 0 | 승인자가 없다. 위 보완 장치로 대신 |
| Require status checks to pass | 켬 — `lint` · `typecheck` · `test` | 코드 단계에서 워크플로 이름 확정 후 지정 |
| Require branches to be up to date | 켬 | 오래된 `dev` 기준으로 병합하지 않는다 |
| Require linear history | 켬 | 스쿼시 병합만 허용 |
| Allow force pushes · deletions | 끔 | — |

저장소 설정 → General → Pull Requests에서는 **Allow squash merging만 켜고** merge commit · rebase는 끕니다. "Automatically delete head branches"를 켭니다.

## 라벨

커밋 종류 · 범위와 같은 낱말을 씁니다. 이슈와 PR에 둘 다 붙입니다.

| 묶음 | 라벨 |
| --- | --- |
| 종류 | `feat` `fix` `style` `refactor` `docs` `test` `ci` |
| 범위 | `web` `server` `infra` |
| 상태 | `blocked` (다른 이슈를 기다림) · `question` (결정 필요) |

## 배포

| 환경 | 트리거 | 프론트 | 백엔드 | DB |
| --- | --- | --- | --- | --- |
| PR 미리보기 | 작업 브랜치 push | Vercel Preview (PR마다 URL) | — (Staging API를 바라봄) | Staging |
| Staging | `dev` 병합 | Vercel Preview (dev 고정 URL) | Railway staging 서비스 | Railway Postgres (staging) |
| Production | `main` 병합 | Vercel Production | Railway production 서비스 | Railway Postgres (production) |

- 환경별 변수(`API_URL`, `DATABASE_URL`, `JWT_SECRET`, 이미지 저장 경로)는 각 플랫폼의 환경 변수 화면에서 관리하고, 저장소에는 `.env.example`만 둡니다.
- DB 마이그레이션은 배포 파이프라인에서 `prisma migrate deploy`로 자동 적용합니다. 수동 적용은 하지 않습니다.
- 시드 데이터(데모 계정 · 샘플 상품)는 Staging에만 넣습니다. Production은 비어 있는 상태로 시작하고 데모 계정만 둡니다.

## 문서 단계에서의 적용

코드가 없는 지금도 같은 흐름을 씁니다. 01 요구사항부터는 문서마다 이슈를 발행하고 `docs/N-이름` 브랜치에서 PR로 `dev`에 병합합니다. CI가 아직 없으므로 "Require status checks"만 비워 두고 나머지 보호 규칙은 지금 겁니다.
