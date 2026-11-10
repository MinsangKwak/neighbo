# backend-node · 백엔드

**백엔드는 인증·권한 검사, 거래 상태 변경, 데이터 저장, 실시간 메시지 전달을 담당하도록 설계했습니다.** 중복 요청과 동시 변경은 서비스 로직·DB 제약·트랜잭션으로 처리합니다. 입력 안내와 화면 갱신은 [프론트엔드](../frontend-next/README.md)에서 담당합니다.

> 현재: **명세 단계, 코드 없음.** 폴더 이름은 `{역할}-{대표 기술}` 규칙을 따릅니다 — 백엔드 · Node.js(Express) ([결정 0015](../docs/decisions.md#0015--최상위-폴더는-역할-대표-기술로-짓는다)).

## 책임 범위

| 책임진다 | 하지 않는다 (프론트 몫) |
| --- | --- |
| 인증 · 권한 판정 — 요청 본문의 사용자 ID를 믿지 않는다 | 버튼 노출 여부 · 화면 이동 |
| 상태 전이 · 유일성 · 소유권을 DB 제약과 트랜잭션으로 강제 | 입력 중 실시간 안내 |
| 최종 입력 검증과 정규화 (프론트와 같은 함수, 서버가 최종) | 캐시 · 낙관적 갱신 |
| 멱등성 — 같은 요청이 두 번 와도 결과가 하나 | 재시도 버튼 · 실패 표시 |
| 에러 코드 · 요청 ID · 로그 | 에러를 사용자 문장으로 보여주기 (문구는 서버가 주되 배치는 프론트) |
| 메시지 저장 → 전송 순서, 누락분 계산, 소켓 권한 | 소켓 연결 상태 표시 · 전송 대기열 |
| rate limit(프록시 뒤 원 IP · 토큰 버킷) · 업로드 검증 · 배치 정리 | — |

## 설계 문서 — [백엔드 설계](../docs/architecture/backend.md) 한 장 · 프론트엔드와 만나는 길은 [흐름 설계](../docs/architecture/flow.md)

| 문서 | 설계 내용 |
| --- | --- |
| [요청 계층](../docs/architecture/backend.md#01--요청-계층) | 요청이 지나는 순서와 각 계층이 판단하는 것 · 판단하지 않는 것 |
| [데이터 모델](../docs/architecture/backend.md#02--데이터-모델) | 엔티티 · 제약 · 인덱스, 요구사항에서 넘긴 여섯 가지 결정, Prisma 스키마, ERD |
| [트랜잭션 경계](../docs/architecture/backend.md#03--트랜잭션-경계) | 원자적이어야 하는 작업 목록과 실패 시 남는 것 |
| [권한 매트릭스](../docs/architecture/backend.md#04--권한-매트릭스) | 엔드포인트 × 요청자 × 자원 상태 |
| [멱등성](../docs/architecture/backend.md#05--멱등성) | 두 번 와도 되는 요청과 그 방법 |
| [에러 코드](../docs/architecture/backend.md#06--에러-코드) | 코드 카탈로그 — HTTP 상태 · 메시지 · 프론트 반응 |
| [보호 장치와 배치](../docs/architecture/backend.md#07--보호-장치와-배치) | rate limit · 업로드 검증 · 정리 배치 |
| [관찰 가능성](../docs/architecture/backend.md#08--관찰-가능성) | 로그 형식 · 요청 ID · 남기지 않는 것 |
| [소켓 서버](../docs/architecture/backend.md#09--소켓-서버) | 이벤트별 처리 순서와 실패 시 동작 |
| [API 명세](../docs/architecture/backend.md#10--api-명세) | 요청 · 응답 모양과 공유 타입 — 프론트와의 계약 |

## 명세·스파이크 검토 결과

명세 검토와 별도 실험에서 확인한 문제입니다. 아래 변경은 설계에 반영했으며, 서비스 구현 후 통합 테스트로 검증할 예정입니다. 증상·원인·확인 방법은 [트러블슈팅 기록](../docs/troubleshooting.md)에 있습니다.

| 번호 | 문제 | 설계·문서에 반영한 내용 |
| --- | --- | --- |
| [T-01](../docs/troubleshooting.md#t-01) | 동시 저장에서 메시지가 복구 조회에 빠짐 | `now()`는 트랜잭션 시작 시각 → 방 행 잠금 + 방별 번호 `seq` ([결정 0016](../docs/decisions.md#0016--방-안-순서와-읽음-위치는-시각이-아니라-방별-번호seq로-센다)) |
| [T-02](../docs/troubleshooting.md#t-02) | 프록시 뒤라 모든 사용자가 같은 IP | 공유 비밀이 맞을 때만 프록시가 넘긴 원 IP를 믿음 |
| [T-03](../docs/troubleshooting.md#t-03) | 정상 재전송이 10초 차단됨 | 고정 차단 → 토큰 버킷 + `retryAfterMs` |
| [T-05](../docs/troubleshooting.md#t-05) | 이모지 1,000자 메시지 거절 · 연결 끊김 | DB CHECK 16,000 코드포인트 · 소켓 80KB — 단위를 grapheme · 코드포인트 · 바이트로 구분 |
| [T-08](../docs/troubleshooting.md#t-08) | 미리보기 배포에서 쓰기 전부 `403` | 허용 판단 함수 하나를 HTTP · 소켓이 공유, staging은 미리보기 패턴 |
| [T-09](../docs/troubleshooting.md#t-09) | 업로드 처리 방식을 파일보다 늦게 앎 | `kind`를 쿼리로 |
| [S-05](../docs/troubleshooting.md#s-05) | 스키마 검증 실패 | Prisma 7의 `prisma.config.ts` · 드라이버 어댑터 |

## 근거 문서

- 수용 조건: [기능별 문서](../docs/README.md#기능별-요구사항--한-기능--한-장)의 "백엔드가 하는 것" 열 — 0.1 인증 · 0.2 응답 형식 · 0.4 보안은 대부분 이 역할
- 결정 기록: [0001 직접 구현](../docs/decisions.md#0001--인증거래채팅-로직은-별도-백엔드에서-관리한다) · [0002 Postgres](../docs/decisions.md#0002--개발--운영-db를-postgresql로-통일한다) · [0003 JWT 쿠키](../docs/decisions.md#0003--인증은-jwt를-httponly-쿠키에-담는다) · [0005 Socket.IO](../docs/decisions.md#0005--실시간-전달은-socketio-누락-복구는-db-커서로-처리한다) · [0006 soft delete](../docs/decisions.md#0006--상품-삭제는-항상-soft-delete-채팅방은-열람만) · [0007 읽음](../docs/decisions.md#0007--읽음은-방-단위-위치-하나로-센다) · [0016 방별 번호](../docs/decisions.md#0016--방-안-순서와-읽음-위치는-시각이-아니라-방별-번호seq로-센다) · [0012 구매자 지정](../docs/decisions.md#0012--거래완료-시-구매자를-지정하고-구매-내역을-둔다)
- 기술 노트: [WebSocket](../docs/tech-notes.md#websocket과-socketio) · JWT와 쿠키 · 비밀번호 해시 · Postgres 제약 · Prisma · 이미지 파이프라인 ([목록](../docs/tech-notes.md))

## 예정 스택

Node.js · Express · TypeScript (`strict`) · Prisma 7 · PostgreSQL 16 · Socket.IO · Zod (공유 패키지) · bcrypt · sharp · Vitest + supertest
