# backend-node · 백엔드

**서비스의 규칙을 강제하는 마지막 관문입니다.** 누가 무엇을 할 수 있는지, 같은 일이 두 번 일어나면 어떻게 되는지, 중간에 실패하면 무엇이 남는지를 코드와 DB 제약으로 보장합니다. [프론트엔드](../frontend-next/README.md)가 무엇을 숨기든 보여주든, 여기서 막히지 않은 것은 일어날 수 있다고 봅니다.

> 현재: **명세 단계, 코드 없음.** 폴더 이름 `backend-node`는 예시이며 코드 시작 전에 확정합니다([00 개요 5절](../docs/00-overview.md#5-폴더-구조-제안)).

## 이 역할이 책임지는 것 · 하지 않는 것

| 책임진다 | 하지 않는다 (프론트 몫) |
| --- | --- |
| 인증 · 권한 판정 — 요청 본문의 사용자 ID를 믿지 않는다 | 버튼 노출 여부 · 화면 이동 |
| 상태 전이 · 유일성 · 소유권을 DB 제약과 트랜잭션으로 강제 | 입력 중 실시간 안내 |
| 최종 입력 검증과 정규화 (프론트와 같은 함수, 서버가 최종) | 캐시 · 낙관적 갱신 |
| 멱등성 — 같은 요청이 두 번 와도 결과가 하나 | 재시도 버튼 · 실패 표시 |
| 에러 코드 · 요청 ID · 로그 | 에러를 사용자 문장으로 보여주기 (문구는 서버가 주되 배치는 프론트) |
| 메시지 저장 → 전송 순서, 누락분 계산, 소켓 권한 | 소켓 연결 상태 표시 · 전송 대기열 |
| rate limit · 업로드 검증 · 배치 정리 | — |

## 설계 문서 — [docs/backend](../docs/backend/README.md)

| 문서 | 이 역할이 고민한 것 |
| --- | --- |
| [요청 계층](../docs/backend/01-layers.md) | 요청이 지나는 순서와 각 계층이 판단하는 것 · 판단하지 않는 것 |
| [데이터 모델](../docs/backend/02-data-model.md) | 엔티티 · 제약 · 인덱스, 01에서 넘긴 여섯 가지 결정, Prisma 스키마, ERD |
| [트랜잭션 경계](../docs/backend/03-transactions.md) | 원자적이어야 하는 작업 목록과 실패 시 남는 것 |
| [권한 매트릭스](../docs/backend/04-authorization.md) | 엔드포인트 × 요청자 × 자원 상태 |
| [멱등성](../docs/backend/05-idempotency.md) | 두 번 와도 되는 요청과 그 방법 |
| [에러 코드](../docs/backend/06-errors.md) | 코드 카탈로그 — HTTP 상태 · 메시지 · 프론트 반응 |
| [보호 장치와 배치](../docs/backend/07-protection.md) | rate limit · 업로드 검증 · 정리 배치 |
| [관찰 가능성](../docs/backend/08-observability.md) | 로그 형식 · 요청 ID · 남기지 않는 것 |
| [소켓 서버](../docs/backend/09-socket-server.md) | 이벤트별 처리 순서와 실패 시 동작 |

## 근거 문서

- 수용 조건: [01 요구사항](../docs/01-requirements.md)의 "백엔드가 하는 것" 열 — 0.1 인증 · 0.2 응답 형식 · 0.4 보안은 대부분 이 역할
- 결정 기록: [0001 직접 구현](../docs/decisions/0001-no-baas.md) · [0002 Postgres](../docs/decisions/0002-postgres-everywhere.md) · [0003 JWT 쿠키](../docs/decisions/0003-jwt-httponly-cookie.md) · [0005 Socket.IO](../docs/decisions/0005-socket-io.md) · [0006 soft delete](../docs/decisions/0006-always-soft-delete.md) · [0007 읽음](../docs/decisions/0007-read-state.md) · [0012 구매자 지정](../docs/decisions/0012-buyer-assignment.md)
- 기술 노트: [WebSocket](../docs/tech/websocket.md) · JWT와 쿠키 · 비밀번호 해시 · Postgres 제약 · Prisma · 이미지 파이프라인 ([목록](../docs/tech/README.md))

## 예정 스택

Node.js · Express · TypeScript (`strict`) · Prisma · PostgreSQL 16 · Socket.IO · Zod (공유 패키지) · bcrypt · sharp · Vitest + supertest
