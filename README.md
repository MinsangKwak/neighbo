# neighbo · React 기반 동네 거래 서비스

**상품을 탐색하고 채팅으로 거래 약속을 정한 뒤, 판매·구매 내역까지 확인하는 동네 중고거래 서비스입니다.**

개인 프로젝트로 기획·명세부터 공통 UI, 화면·API·데이터, 테스트·배포까지 직접 담당했습니다. 퍼블리셔·프론트엔드 개발 경험을 바탕으로 반응형 배치와 입력 레이블·오류 안내·키보드 초점 처리를 공통 컴포넌트에 반영했습니다.

React 19·Next.js 16 App Router·TypeScript·Tailwind CSS·TanStack Query로 화면과 서버 렌더링을, Node.js·Express·Prisma 7·PostgreSQL 16·Socket.IO로 인증·거래 상태·채팅을 구현했습니다. 두 앱은 Zod 입력·응답 계약을 공유합니다.

[서비스](https://neighbo-liart.vercel.app/) · [Node Swagger](https://neighbo-liart.vercel.app/node-swagger) · [Notion 상세](https://www.notion.so/421cbbdd109b81ee8960e32dd7038b4a) · [문서 목차](project/docs/README.md)

## 폴더별 역할

| 위치 | 하는 일 | 먼저 볼 구현·문서 |
| --- | --- | --- |
| [frontend-react/](frontend-react/) | 화면·반응형·접근성, 렌더링·폼·캐시·연결 상태 | [공통 UI](frontend-react/src/components/) · [프론트엔드](project/docs/dev/frontend.md) · [디자인 가이드](project/docs/design/guide.md) |
| [backend-node/](backend-node/) | 인증·권한, 거래·DB 정합성, 메시지 저장·복구, 사진·배치 | [기능 모듈](backend-node/src/modules/) · [Prisma](backend-node/prisma/schema.prisma) · [백엔드](project/docs/dev/backend.md) |
| [project/](project/) | 공유 계약, 기획·개발·디자인 문서, 테스트·도구·설치·검사 설정 | [공유 계약](project/shared-schema/src/) · [문서 목차](project/docs/README.md) · [테스트](project/tests/) · [실행 기준](project/docs/dev/runbook.md) |
| [.github/](.github/) | CI·웹 배포·검사와 빌드 자동화 | [CI](.github/workflows/ci.yml) · [배포 기준](project/docs/dev/runbook.md#현재-배포-설정) |
| [README.md](README.md) | 서비스 소개·역할·코드 지도·빠른 실행 | [기능과 검증 범위](project/docs/planning/product.md) |
| [LICENSE](LICENSE) | 코드·문서의 MIT 이용 조건 | [라이선스 원문](LICENSE) |

Git 루트는 위 여섯 항목으로 구성합니다. 실행 앱은 `frontend-react/`·`backend-node/`, 공유 계약은 `project/shared-schema/`에 두며 루트 README 외 Markdown은 `project/docs/`에서 관리합니다. 앱별 잠금 파일로 설치하고 통합 실행·검사는 project 명령으로 연결합니다.

## 구현한 흐름

판매자는 **등록 → 채팅 → 거래완료·구매자 지정 → 판매 내역**, 구매자는 **목록·검색·상세 → 채팅 → 거래 약속 → 구매 내역**으로 이동합니다. 회원가입·로그인·프로필·비밀번호 변경, 판매자 프로필·관심·동네 필터와 데모 계정을 포함하며 로딩·빈 결과·오류·권한·연결 끊김 상태도 정의했습니다. [기능별 수용 조건](project/docs/README.md#기능별-요구사항--한-기능--한-장)

## 퍼블리싱과 접근성

| 구현 | 확인할 코드·검사 |
| --- | --- |
| 레이블·힌트·오류 연결, 첫 오류 초점 | [Field](frontend-react/src/components/Field.tsx) · [useForm](frontend-react/src/lib/form/useForm.ts) |
| 키보드·대화상자·경로 이동·상태 알림 | [Dialog](frontend-react/src/components/Dialog.tsx) · [RouteFocus](frontend-react/src/lib/a11y/RouteFocus.tsx) · [Toast](frontend-react/src/components/Toast.tsx) |
| 반응형·명도 대비·사용자 설정 | [공통 CSS](frontend-react/src/styles/globals.css) · [색 조합](project/tests/frontend-react/styles/tokens.test.ts) · [레이아웃 E2E](project/tests/frontend-react/e2e/layout.spec.ts) |

본문 4.5:1·UI 3:1 색 조합, 44px 조작 영역, 동작 줄이기와 보이는 레이블·접근 가능한 이름 비교를 구현·검사 대상으로 삼았습니다. [가이드](project/docs/design/guide.md)와 [접근성 E2E](project/tests/frontend-react/e2e/a11y.spec.ts)는 구현·자동 검사 범위이며 전체 적합성 심사나 인증 결과는 아닙니다.

## 설계에서 다룬 경계

- 서버 데이터·URL·폼·소켓 대기열의 관리 주체를 나누고 캐시 갱신과 실패 복구를 연결했습니다. [프론트엔드 상태](project/docs/dev/frontend.md#02--상태-소유권)
- 방별 `seq`, 행 잠금, 유니크 제약·조건부 UPDATE로 중복 요청과 메시지 순서·누락 복구를 처리했습니다. [트랜잭션](project/docs/dev/backend.md#03--트랜잭션-경계)
- 서버의 입력·세션·소유권 검사, Origin·요청 한도·사진 재인코딩과 읽기 전용 API 문서를 구현했습니다. [보안 경계](project/docs/dev/security.md)
- 화면 밖의 API·권한·DB까지 직접 구현하며 풀스택을 학습했습니다. AI는 문서 초안·실험 코드 작성에 활용하고 실행·스키마·공식 문서 대조로 검토했습니다. [AI 작업·검증](project/docs/dev/runbook.md#ai-작업검증-기록)

## 로컬 실행

Node.js 22 이상·npm·PostgreSQL 16을 사용합니다. 저장소 루트에서 준비합니다.

```bash
python3 project/tools/setup_git.py
npm --prefix project run setup
cp backend-node/.env.example backend-node/.env
cp frontend-react/.env.example frontend-react/.env.local
docker compose --project-directory . -f project/docker-compose.yml up -d db
```

두 앱에 같은 `PROXY_SECRET`·`DEMO_PASSWORD`, 백엔드에 별도 `JWT_SECRET`과 DB 주소를 설정합니다. 실제 비밀값은 커밋하지 않습니다.

```bash
npm --prefix project run db:generate
npm --prefix project run db:deploy
npm --prefix project run db:seed
```

각 터미널에서 `npm --prefix project run dev:api`와 `npm --prefix project run dev:web`을 실행합니다. 웹은 `http://localhost:3000`, API는 `http://localhost:4000`입니다. [설치·환경·데모·테스트 DB](project/docs/dev/runbook.md#로컬-실행과-패키지별-검사)

## 검증과 현재 범위

```bash
npm --prefix project run lint
npm --prefix project run typecheck
npm --prefix project run test
npm --prefix project run build
npm --prefix project run test:docs
npm --prefix project run check:docs
```

로컬 확인 기록은 **공유 스키마 53개·프론트엔드 229개·DB 없는 API 문서와 한도 회귀 20개**입니다. 백엔드 전체 통합 검사는 별도 `TEST_DATABASE_URL`, E2E 19개 실행은 별도 DB·Chromium이 필요하며 결과는 CI에서 확인합니다. AC 279개 중 278개에 테스트 ID가 있고, ID 존재가 조건 전체의 검증을 보장하지는 않습니다. [검증 현황·남은 확인](project/docs/planning/product.md#9-설계검증-현황) · [CI](.github/workflows/ci.yml)

현재 배포는 Vercel·Railway·Supabase Storage입니다. Render·Supabase DB 이전, 실제 기기 조작·Web Vitals·부하 측정은 추가 확인 범위입니다. 결제·송금·GPS 동네 인증·신고·차단·후기·이미지 메시지·브라우저 푸시는 현재 범위 밖입니다. [기획 범위](project/docs/planning/product.md#3-범위)

## 라이선스와 고지

[MIT 라이선스](LICENSE)로 공개한 개인 프로젝트입니다. 당근마켓의 핵심 흐름을 참고했으며 해당 회사와 관계가 없고 상표·로고·디자인 자산을 사용하지 않습니다.
