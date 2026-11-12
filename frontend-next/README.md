# frontend-next · 프론트엔드

**프론트엔드는 Next.js를 기반으로 상품 탐색, 거래 등록, 채팅, 거래 내역 화면을 구성합니다.** 렌더링·캐시·입력·오류 안내·접근성·연결 상태를 담당하며, 권한과 데이터 무결성의 최종 판단은 [백엔드](../backend-node/README.md)에서 처리합니다.

> 현재: **구현 0~4단계와 2차 기능(판매자 프로필 · 관심 · 동네)까지 작성 · 배포.** 실행은 `npm run dev -w frontend-next` (`:3000`), 환경 변수는 `.env.example` 참고. 폴더 이름은 `{역할}-{대표 기술}` 규칙을 따릅니다 — 프론트엔드 · Next.js(React 기반) ([결정 0015](../docs/decisions.md#0015--최상위-폴더는-역할-대표-기술로-짓는다)).

## 책임 범위

| 책임진다 | 하지 않는다 (백엔드 몫) |
| --- | --- |
| 페이지마다 어디서 렌더할지 (서버 · 클라이언트) | 권한 판정 — 숨긴 버튼도 API는 열려 있다고 가정 |
| 서버 상태 캐시와 무효화 — 무엇을 바꾸면 어느 화면이 다시 그려지나 | 유일성 · 상태 전이 규칙의 강제 |
| 입력을 막기 · 조용히 고치기 · 알리기 (서버와 같은 정규화 함수) | 최종 검증 — 서버가 다르게 판단하면 서버를 따른다 |
| 로딩 · 빈 상태 · 에러 · 오프라인 화면 | 에러 원인 기록 · 요청 추적 |
| 포커스 이동 · 라이브 리전 · 키보드 조작 | — |
| 소켓 연결 상태와 전송 대기열, 재연결 후 화면 복구 | 메시지 저장 순서 · 중복 방지 · 누락분 계산 |

## 설계 문서 — [프론트엔드 설계](../docs/architecture/frontend.md) 한 장 · 백엔드와 만나는 길은 [흐름 설계](../docs/architecture/flow.md)

| 문서 | 설계 내용 |
| --- | --- |
| [렌더링 전략](../docs/architecture/frontend.md#01--렌더링-전략) | 페이지 13개 각각을 서버 · 클라이언트 중 어디서 그리고, 왜 |
| [상태 소유권](../docs/architecture/frontend.md#02--상태-소유권) | 서버 상태 · URL 상태 · 폼 상태 · UI 상태를 어디에 둘지 |
| [캐시와 낙관적 갱신](../docs/architecture/frontend.md#03--캐시와-낙관적-갱신) | 캐시 키, 쓰기별 갱신 범위, 낙관적 갱신 적용 기준 |
| [에러 경계](../docs/architecture/frontend.md#04--에러-경계) | 전역 · 페이지 · 영역 세 겹의 에러 처리와 서버 에러 코드별 화면 반응 |
| [폼](../docs/architecture/frontend.md#05--폼) | 폼 7개의 공통 패턴, 정규화, 서버 오류 반영, 이탈 확인 |
| [포커스와 라이브 리전](../docs/architecture/frontend.md#06--포커스와-라이브-리전) | 화면 전환 · 모달 · 목록 추가 · 실시간 메시지에서 포커스와 알림 |
| [화면 명세](../docs/architecture/frontend.md#08--화면-명세) | 13개 화면의 구성 · 로딩 · 빈 상태 · 오류 · 조작과 이동 |
| [공통 컴포넌트](../docs/architecture/frontend.md#09--공통-컴포넌트) | 공통 조각 17개의 props · 변형 · 접근성 기본 동작, 토큰 조건 |
| [폴더 구조](../docs/architecture/frontend.md#10--폴더-구조) | 경로는 조립만, 기능 폴더 · import 규칙 |
| [소켓 클라이언트](../docs/architecture/frontend.md#07--소켓-클라이언트) | 연결 상태 기계, 전송 대기열, 재연결 후 복구, 번호 틈 감지, 서버가 끊었을 때 |

## 명세·스파이크 검토 결과

명세 검토와 별도 실험에서 확인한 문제입니다. 아래 변경은 설계와 구현에 반영했습니다. 증상·원인·확인 방법은 [트러블슈팅 기록](../docs/troubleshooting.md)에 있습니다.

| 번호 | 문제 | 설계에 반영한 내용 |
| --- | --- | --- |
| [T-04](../docs/troubleshooting.md#t-04) | 아이폰 사진(HEIC) · 큰 사진 업로드 실패 | 업로드 전에 브라우저에서 1600px JPEG로 다시 인코딩 — 형식 · 용량 · 위치 정보를 한 번에 |
| [T-06](../docs/troubleshooting.md#t-06) | 매일 써도 7일 뒤 로그아웃 | 서버 컴포넌트의 `Set-Cookie`는 버리고, 연장은 `/api/*` 응답에서만 |
| [T-07](../docs/troubleshooting.md#t-07) | 보호 페이지 1겹 검사 미동작 | Next.js 16의 `proxy.ts` |
| [T-03](../docs/troubleshooting.md#t-03) | 재연결 순간 대기 메시지가 실패로 바뀜 | 재전송 200ms 간격, `RATE_LIMITED`는 실패가 아니라 대기 |
| [T-01](../docs/troubleshooting.md#t-01) | 가끔 메시지 하나가 안 보임 | 받은 번호(`seq`)의 틈을 보고 스스로 채움, 읽음은 **그린** 번호로 |
| [S-04](../docs/troubleshooting.md#s-04) | 화면엔 실패, 상대에겐 도착 | 타임아웃 있는 `emitWithAck`만, 직접 `emit`은 lint로 금지 |

## 근거 문서

- 수용 조건: [기능별 문서](../docs/README.md#기능별-요구사항--한-기능--한-장)의 "프론트가 하는 것" 열 — 0.3 화면 상태 · 0.5 접근성 · 0.7 입력 처리는 대부분 이 역할
- 결정 기록: [0004 같은 오리진 프록시](../docs/decisions.md#0004--프론트가-백엔드를-프록시해-같은-오리진을-유지한다) · [0009 더 보기 버튼](../docs/decisions.md#0009--목록은-무한-스크롤-대신-더-보기-버튼--커서) · [0010 즉시 업로드](../docs/decisions.md#0010--사진은-선택-즉시-업로드하고-등록은-url만-보낸다) · [0011 비로그인 열람](../docs/decisions.md#0011--목록--상세는-비로그인으로-볼-수-있다) · [0014 640px 단일 열](../docs/decisions.md#0014--pc-화면도-640px-단일-열로-간다)
- 기술 노트: [WebSocket](../docs/tech-notes.md#websocket과-socketio) · Next.js App Router · TanStack Query · Tailwind 토큰 · 접근성 ([목록](../docs/tech-notes.md))

## 스택

Next.js 16 (App Router) · TypeScript (`strict`) · Tailwind CSS · TanStack Query · Socket.IO client · Zod (공유 패키지) · Testing Library · Playwright
