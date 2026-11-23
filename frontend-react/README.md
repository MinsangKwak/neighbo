# frontend-react · React·Next.js 프론트엔드

**상품 탐색·입력·채팅·거래 내역을 React와 Next.js App Router로 구현한 앱입니다.** 공통 UI·반응형·접근성, 폼·캐시·실시간 연결 상태를 담당합니다. 권한·데이터 정합성의 최종 판단은 [backend-node](../backend-node/README.md)가 처리합니다.

| 기술 | 적용 위치 |
| --- | --- |
| React 19 · Next.js 16 · TypeScript | `src/app/` 경로·서버 렌더와 `src/features/` 인터랙션 |
| Tailwind CSS | `src/styles/globals.css` 토큰과 공통 UI |
| TanStack Query | `src/lib/query/` 서버 데이터 캐시·갱신 키 |
| Socket.IO client | `src/lib/socket/`과 `src/features/chat/` 연결·전송·복구 |
| 공유 Zod 스키마 | `shared-schema/` 입력 정규화·검증과 요청·응답 타입 |
| Vitest · Testing Library · Playwright·axe | 컴포넌트·폼·연결 상태, 거래·접근성 시나리오 |

## 코드 지도

| 위치 | 읽을 내용 |
| --- | --- |
| [src/app/](src/app/) | 서버 조회·권한 분기·경로별 조립, 같은 오리진 API 프록시 |
| [src/components/](src/components/) | Field·Button·Dialog·Toast·목록·상태 공통 UI |
| [src/features/](src/features/) | auth·products·chat·me·users의 화면·통신·캐시 |
| [src/lib/form/](src/lib/form/) | 폼 상태·오류 정정·쿨다운·작성 중 이탈 확인 |
| [src/lib/a11y/](src/lib/a11y/) | 경로 이동 후 초점 관리 |
| [src/styles/](src/styles/) | 색·간격·글자·조작 영역 토큰과 명도 대비 검사 |
| [e2e/](e2e/) | 두 사용자 거래·연결 끊김·레이아웃·접근성 |

## 퍼블리싱과 접근성

- Field는 label·input·힌트·오류를 연결하고 `aria-invalid`·`aria-describedby`를 관리합니다. 폼은 첫 오류 입력으로 초점을 옮깁니다.
- 네이티브 dialog와 제목 연결을 사용합니다. RouteFocus는 새 h1으로 초점을 옮기되 입력·대화상자가 가진 초점은 유지합니다.
- 상태 알림은 `role="status"`, 오류는 `role="alert"`로 구분합니다.
- 640px 앱 폭·44px 조작 영역·`:focus-visible`·`prefers-reduced-motion`을 공통 CSS 규칙으로 관리합니다.
- 토큰 조합은 본문 4.5:1·UI 경계와 초점 3:1 조건으로 검사합니다. 좁은 화면의 버튼 줄바꿈과 보이는 레이블·접근 가능한 이름도 비교합니다.

이는 현재 구현과 검사 범위이며 전체 접근성 적합성 심사나 보조공학 실기 검수 결과를 의미하지 않습니다. [설계·구현 근거](../docs/architecture/frontend.md#06--포커스와-라이브-리전)

## 상태의 책임

| 상태 | 관리 위치 |
| --- | --- |
| 서버 데이터 | TanStack Query 캐시, 서버가 최종 기준 |
| 공유할 필터·선택 | URL 경로·쿼리 |
| 작성 중 값·오류 | 폼 컴포넌트와 useForm |
| 대화상자·토스트 | 공통 컴포넌트·컨텍스트 |
| 연결·미확정 메시지 | 소켓 컨텍스트·전송 대기열 |

메시지는 ack를 받은 뒤 확정하고, 재연결 시 방별 번호의 빈 구간을 복구합니다. 권한·거래 상태 거절은 오류 안내와 재조회로 연결합니다.

## 실행과 검사

저장소 루트에서 `npm ci`를 실행하고 `.env.example`을 `.env.local`로 복사합니다. `API_URL`과 백엔드와 같은 `PROXY_SECRET`을 설정합니다. [전체 실행 준비](../README.md#로컬에서-실행하기)

```bash
npm run dev:web
npm run lint -w frontend-react
npm run typecheck -w frontend-react
npm run test:web
npm run build
```

개발 웹은 `http://localhost:3000`입니다. [E2E 준비·서버 실행 범위](../docs/dev.md#테스트-전략--수용-조건-하나에-테스트-하나). 브라우저 자체 뒤로가기와 실제 기기 조작은 추가 확인 범위입니다.

## 상세 설계

[렌더링](../docs/architecture/frontend.md#01--렌더링-전략) · [상태](../docs/architecture/frontend.md#02--상태-소유권) · [캐시](../docs/architecture/frontend.md#03--캐시와-낙관적-갱신) · [오류](../docs/architecture/frontend.md#04--에러-경계) · [폼](../docs/architecture/frontend.md#05--폼) · [포커스](../docs/architecture/frontend.md#06--포커스와-라이브-리전) · [소켓](../docs/architecture/frontend.md#07--소켓-클라이언트) · [화면](../docs/architecture/frontend.md#08--화면-명세) · [공통 UI](../docs/architecture/frontend.md#09--공통-컴포넌트) · [폴더 구조](../docs/architecture/frontend.md#10--폴더-구조)
