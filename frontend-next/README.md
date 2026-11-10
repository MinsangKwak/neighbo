# frontend-next · 프론트엔드

**프론트엔드는 Next.js를 기반으로 상품 탐색, 거래 등록, 채팅, 거래 내역 화면을 구성할 예정입니다.** 렌더링·캐시·입력·오류 안내·접근성·연결 상태를 담당하며, 권한과 데이터 무결성의 최종 판단은 [백엔드](../backend-node/README.md)에서 처리합니다.

> 현재: **명세 단계, 코드 없음.** 폴더 이름은 `{역할}-{대표 기술}` 규칙을 따릅니다 — 프론트엔드 · Next.js(React 기반) ([결정 0015](../docs/decisions/0015-folder-naming.md)).

## 책임 범위

| 책임진다 | 하지 않는다 (백엔드 몫) |
| --- | --- |
| 페이지마다 어디서 렌더할지 (서버 · 클라이언트) | 권한 판정 — 숨긴 버튼도 API는 열려 있다고 가정 |
| 서버 상태 캐시와 무효화 — 무엇을 바꾸면 어느 화면이 다시 그려지나 | 유일성 · 상태 전이 규칙의 강제 |
| 입력을 막기 · 조용히 고치기 · 알리기 (서버와 같은 정규화 함수) | 최종 검증 — 서버가 다르게 판단하면 서버를 따른다 |
| 로딩 · 빈 상태 · 에러 · 오프라인 화면 | 에러 원인 기록 · 요청 추적 |
| 포커스 이동 · 라이브 리전 · 키보드 조작 | — |
| 소켓 연결 상태와 전송 대기열, 재연결 후 화면 복구 | 메시지 저장 순서 · 중복 방지 · 누락분 계산 |

## 설계 문서 — [docs/frontend](../docs/frontend/README.md)

| 문서 | 설계 내용 |
| --- | --- |
| [렌더링 전략](../docs/frontend/01-rendering.md) | 페이지 13개 각각을 서버 · 클라이언트 중 어디서 그리고, 왜 |
| [상태 소유권](../docs/frontend/02-state.md) | 서버 상태 · URL 상태 · 폼 상태 · UI 상태를 어디에 둘지 |
| [캐시와 낙관적 갱신](../docs/frontend/03-cache.md) | 캐시 키, 쓰기별 갱신 범위, 낙관적 갱신 적용 기준 |
| [에러 경계](../docs/frontend/04-errors.md) | 전역 · 페이지 · 영역 세 겹의 에러 처리와 서버 에러 코드별 화면 반응 |
| [폼](../docs/frontend/05-forms.md) | 폼 7개의 공통 패턴, 정규화, 서버 오류 반영, 이탈 확인 |
| [포커스와 라이브 리전](../docs/frontend/06-focus.md) | 화면 전환 · 모달 · 목록 추가 · 실시간 메시지에서 포커스와 알림 |
| [소켓 클라이언트](../docs/frontend/07-socket-client.md) | 연결 상태 기계, 전송 대기열, 재연결 후 복구, 번호 틈 감지, 서버가 끊었을 때 |

## 명세·스파이크 검토 결과

명세 검토와 별도 실험에서 확인한 문제입니다. 아래 변경은 설계에 반영했으며, 서비스 구현 후 통합 테스트로 검증할 예정입니다. 증상·원인·확인 방법은 [트러블슈팅 기록](../docs/troubleshooting.md)에 있습니다.

| 번호 | 문제 | 설계에 반영한 내용 |
| --- | --- | --- |
| [T-04](../docs/troubleshooting.md#t-04) | 아이폰 사진(HEIC) · 큰 사진 업로드 실패 | 업로드 전에 브라우저에서 1600px JPEG로 다시 인코딩 — 형식 · 용량 · 위치 정보를 한 번에 |
| [T-06](../docs/troubleshooting.md#t-06) | 매일 써도 7일 뒤 로그아웃 | 서버 컴포넌트의 `Set-Cookie`는 버리고, 연장은 `/api/*` 응답에서만 |
| [T-07](../docs/troubleshooting.md#t-07) | 보호 페이지 1겹 검사 미동작 | Next.js 16의 `proxy.ts` |
| [T-03](../docs/troubleshooting.md#t-03) | 재연결 순간 대기 메시지가 실패로 바뀜 | 재전송 200ms 간격, `RATE_LIMITED`는 실패가 아니라 대기 |
| [T-01](../docs/troubleshooting.md#t-01) | 가끔 메시지 하나가 안 보임 | 받은 번호(`seq`)의 틈을 보고 스스로 채움, 읽음은 **그린** 번호로 |
| [S-04](../docs/troubleshooting.md#s-04) | 화면엔 실패, 상대에겐 도착 | 타임아웃 있는 `emitWithAck`만, 직접 `emit`은 lint로 금지 |

## 근거 문서

- 수용 조건: [01 요구사항](../docs/01-requirements.md)의 "프론트가 하는 것" 열 — 0.3 화면 상태 · 0.5 접근성 · 0.7 입력 처리는 대부분 이 역할
- 결정 기록: [0004 같은 오리진 프록시](../docs/decisions/0004-api-proxy-same-origin.md) · [0009 더 보기 버튼](../docs/decisions/0009-load-more-button.md) · [0010 즉시 업로드](../docs/decisions/0010-upload-on-select.md) · [0011 비로그인 열람](../docs/decisions/0011-public-browse.md) · [0014 640px 단일 열](../docs/decisions/0014-single-column-640.md)
- 기술 노트: [WebSocket](../docs/tech/websocket.md) · Next.js App Router · TanStack Query · Tailwind 토큰 · 접근성 ([목록](../docs/tech/README.md))

## 예정 스택

Next.js 16 (App Router) · TypeScript (`strict`) · Tailwind CSS · TanStack Query · Socket.IO client · Zod (공유 패키지) · Testing Library · Playwright
