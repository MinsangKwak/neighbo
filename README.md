# neighbo · React 기반 동네 거래 서비스

**상품 탐색부터 채팅·거래완료·구매 내역까지 이어지는 개인 풀스택 프로젝트입니다.** React·Next.js로 사용자 화면을 만들고, Express·PostgreSQL로 인증·거래 상태·메시지 저장을 구현했습니다. 퍼블리싱과 접근성을 공통 UI에 반영하고, 연결 끊김과 중복 요청의 복구 흐름까지 다뤘습니다.

[서비스 열기](https://neighbo-liart.vercel.app/) · [Notion 상세](https://www.notion.so/421cbbdd109b81ee8960e32dd7038b4a) · [문서 목차](docs/README.md)

## 기술과 폴더

| 위치 | 대표 기술 | 담당하는 일 |
| --- | --- | --- |
| [frontend-react/](frontend-react/README.md) | React 19 · Next.js 16 · TypeScript · Tailwind CSS · TanStack Query | 화면·반응형·접근성, 서버 렌더링, 폼·캐시·소켓 상태 |
| [backend-node/](backend-node/README.md) | Node.js · Express · Prisma 7 · PostgreSQL 16 · Socket.IO | 인증·권한, 거래 상태·트랜잭션, 채팅 저장·복구, 사진·정리 배치 |
| [shared-schema/](shared-schema/README.md) | Zod · TypeScript | 두 앱이 공유하는 요청·응답 타입, 입력 검증·정규화 |
| [docs/](docs/README.md) | 요구사항·설계·검증 기록 | 기능별 수용 조건, 역할별 책임, 선택 이유와 재현 방법 |
| [spikes/](spikes/) | WebSocket · 인증 · PostgreSQL 실험 | 서비스 코드와 분리한 최소 재현 실험 |

`frontend-react`는 React 기반 UI를 찾기 쉽게 붙인 이름이며, 실제 실행 프레임워크는 **Next.js App Router**입니다. 백엔드는 별도 Node.js 서비스입니다. [폴더 이름 기준](docs/decisions.md#0015--최상위-폴더는-역할-대표-기술로-짓는다)

## 현재 제공하는 기능

| 사용자 목적 | 구현한 기능 |
| --- | --- |
| 거래할 물건 찾기 | 목록·검색·상세·판매자 프로필, 관심 등록, 동네 선택·필터 |
| 물건 판매하기 | 사진 업로드·전체 화면 보기, 상품 등록·수정·삭제, 예약·거래완료·구매자 지정 |
| 약속 잡기 | 채팅방·메시지·읽음·배지·새 메시지 알림, 재연결과 누락 메시지 복구 |
| 내 거래 관리하기 | 회원가입·로그인·세션 연장, 판매·구매 내역, 프로필·비밀번호 변경, 데모 계정 |

판매자는 **등록 → 채팅 → 거래완료·구매자 지정 → 판매 내역**, 구매자는 **탐색 → 채팅 → 거래 약속 → 구매 내역**으로 이동합니다. 로딩·빈 결과·입력 오류·권한 제한·연결 끊김도 화면 상태로 정의했습니다.

현재 배포 구성은 프론트엔드 Vercel, 백엔드·DB Railway, 사진 Supabase Storage입니다. Render·Supabase DB 이전은 설정 준비 단계입니다. [실행·배포 기준](docs/dev.md#호스팅-비용과-옮길-계획)

## 제가 맡은 역할

| 역할 | 직접 다룬 내용 |
| --- | --- |
| 기획·명세 | 판매자·구매자 흐름, 기능 우선순위, 입력·권한·동시 요청·접근성 수용 조건 |
| 퍼블리싱·UI | 디자인 토큰, 640px 앱 폭과 반응형 화면, 공통 Field·Button·Dialog·상태 표시 |
| 프론트엔드 | 서버 렌더링·캐시 전달, 폼 검증·오류 복구, 소켓 연결 상태·전송 대기열 |
| 백엔드·데이터 | 공유 스키마 검증, 인증·권한, DB 제약·트랜잭션, 메시지 저장·누락 복구 |
| 검증·운영 | 수용 조건과 테스트 연결, 거래·채팅 E2E, CI·환경별 배포와 데모·파일 정리 |

풀스택 구현으로 화면 밖의 요청·권한·데이터 처리까지 학습했습니다. AI는 문서 초안과 실험 코드 작성에 활용하고, 서비스 범위·설계 판단은 직접 검토하며 실행·스키마·공식 문서 대조로 확인했습니다. [AI 작업·검증 기록](docs/dev.md#ai-작업검증-기록)

## 퍼블리싱과 웹 접근성

**공통 컴포넌트에 레이블·오류·초점·알림 동작을 포함**해 화면 전반에서 같은 기준을 사용합니다.

| 항목 | 구현과 확인 위치 |
| --- | --- |
| 레이블·오류 연결 | [Field](frontend-react/src/components/Field.tsx)의 label·input·힌트·오류 연결, `aria-invalid`·`aria-describedby` |
| 오류 정정 | [useForm](frontend-react/src/lib/form/useForm.ts)의 서버 필드 오류 반영과 첫 오류 입력으로 초점 이동 |
| 키보드 초점 | [RouteFocus](frontend-react/src/lib/a11y/RouteFocus.tsx)의 새 화면 h1 초점, 입력·대화상자 초점 유지 |
| 대화상자·알림 | [Dialog](frontend-react/src/components/Dialog.tsx)의 네이티브 `showModal()`·제목 연결, [Toast](frontend-react/src/components/Toast.tsx)의 status·alert 영역 |
| 명도 대비·사용자 설정 | [공통 CSS](frontend-react/src/styles/globals.css)의 토큰·44px 조작 영역·동작 줄이기, [색 조합 검사](frontend-react/src/styles/tokens.test.ts)의 본문 4.5:1·UI 3:1 조건 |
| 좁은 화면·접근 가능한 이름 | [레이아웃 E2E](frontend-react/e2e/layout.spec.ts)의 360px 버튼 줄바꿈·표시 문구와 접근 가능한 이름 비교 |

[접근성 E2E](frontend-react/e2e/a11y.spec.ts)는 손님·구매자·판매자의 주요 화면과 오류·확인 창 상태를 대상으로 합니다. 위 내용은 구현과 검사 범위이며 전체 접근성 적합성 심사나 인증 결과는 아닙니다.

## 대표적인 설계 판단

- **상태마다 관리 주체를 정했습니다.** 서버 데이터는 TanStack Query, 공유할 선택은 URL, 작성 중 값은 폼, 미확정 메시지는 소켓 대기열에서 관리합니다. [상태 소유권](docs/architecture/frontend.md#02--상태-소유권)
- **메시지 순서는 방별 번호로 관리합니다.** 방 행을 잠근 뒤 `seq`를 발급하고, 받은 번호의 빈 구간을 다시 조회합니다. [결정 0016](docs/decisions.md#0016--방-안-순서와-읽음-위치는-시각이-아니라-방별-번호seq로-센다)
- **중복 요청·상태 변경은 서버와 DB에서 제어합니다.** 유니크 제약·조건부 UPDATE·트랜잭션을 적용하고 화면은 거절 결과와 재시도 방법을 안내합니다. [트랜잭션 경계](docs/architecture/backend.md#03--트랜잭션-경계)
- **연결이 끊겨도 전송 상태를 구분합니다.** ack·타임아웃·대기열과 같은 식별자의 재시도로 중복 저장을 막습니다. [소켓 클라이언트](docs/architecture/frontend.md#07--소켓-클라이언트)

## 로컬에서 실행하기

**Node.js 22 이상, npm, PostgreSQL 16**이 필요합니다. 저장소 루트에서 실행합니다.

```bash
npm ci
docker compose up -d db
cp backend-node/.env.example backend-node/.env
cp frontend-react/.env.example frontend-react/.env.local
```

두 환경 파일의 `PROXY_SECRET`에 같은 32바이트 이상 값을 넣고, 백엔드 `JWT_SECRET`에는 별도의 값을 넣습니다. 데모 계정에는 두 파일에 같은 `DEMO_PASSWORD`를 설정합니다. 실제 비밀값은 커밋하지 않습니다.

```bash
npm run db:generate -w backend-node
npm run db:deploy -w backend-node
npm run db:seed -w backend-node
```

터미널 두 개에서 API와 웹을 각각 실행합니다.

```bash
# 터미널 1 · API
npm run dev:api
```

```bash
# 터미널 2 · 웹
npm run dev:web
```

웹은 `http://localhost:3000`, API는 `http://localhost:4000`입니다. [환경 변수·데모·테스트 DB](backend-node/README.md#실행과-환경-변수)

## 검증 방법과 근거

```bash
npm run lint
npm run typecheck
npm test
npm run build
python3 scripts/check-docs.py
python3 scripts/check-ac.py
```

백엔드 테스트에는 개발 DB와 분리된 `TEST_DATABASE_URL`이 필요합니다. E2E는 마이그레이션이 적용된 별도 DB와 Chromium을 준비한 뒤 `npm run test:e2e`로 실행합니다. 개별 패키지는 `test:web`·`test:api`·`test:shared`로 확인할 수 있습니다.

저장소의 현재 검증 기록은 단위·통합·컴포넌트 **540개**, E2E **18개**입니다. 수용 조건 **279개 중 278개**에는 조건 ID가 붙은 테스트가 있습니다. 이는 기록된 실행의 범위이며 이번 구조 변경의 결과는 PR 검사에서 별도로 확인합니다. 조건 ID 존재가 조건 전체의 검증을 보장하지는 않습니다. [검증 현황](docs/overview.md#9-설계검증-현황) · [테스트 전략](docs/dev.md#테스트-전략--수용-조건-하나에-테스트-하나) · [CI](.github/workflows/ci.yml)

## 채용 검토용 코드 지도

| 확인하려는 경험 | 시작할 코드·문서 |
| --- | --- |
| 공통 UI·접근성·반응형 | [components](frontend-react/src/components/) · [styles](frontend-react/src/styles/) · [프론트엔드 설계](docs/architecture/frontend.md) |
| 폼과 서버 오류 연결 | [lib/form](frontend-react/src/lib/form/) · [shared-schema](shared-schema/src/) |
| 캐시와 실시간 상태 | [features/chat](frontend-react/src/features/chat/) · [lib/socket](frontend-react/src/lib/socket/) |
| API·권한·트랜잭션 | [modules](backend-node/src/modules/) · [Prisma 모델](backend-node/prisma/schema.prisma) · [백엔드 설계](docs/architecture/backend.md) |
| 기획·예외 흐름·검증 기준 | [요구사항](docs/README.md#기능별-요구사항--한-기능--한-장) · [흐름 설계](docs/architecture/flow.md) · [트러블슈팅](docs/troubleshooting.md) |

## 현재 범위와 남은 확인

결제·송금, GPS 기반 동네 인증, 신고·차단·후기, 이미지 메시지·브라우저 푸시는 현재 범위 밖입니다. 동네 기능은 목록에서 선택하는 구 이름과 필터입니다.

브라우저 자체 뒤로가기의 작성 중 이탈 확인, 실제 기기의 스크롤·한글 입력·백그라운드 복귀, 백엔드·DB 무료 플랜 이전은 추가 확인 대상으로 남겼습니다. 탭 닫기·새로고침·앱 안 링크·앱의 뒤로 버튼·토스트 이동은 이탈 확인 구현 범위에 포함됩니다. [현재 범위](docs/overview.md#3-범위) · [개발·운영 기준](docs/dev.md)

## 라이선스와 고지

코드와 문서는 [MIT 라이선스](LICENSE)로 공개합니다. 당근마켓의 핵심 흐름을 참고한 개인 프로젝트이며 해당 회사와 관계가 없고 상표·로고·디자인 자산을 사용하지 않습니다.
