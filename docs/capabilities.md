# 역량 지도 · 무엇을 할 수 있고, 어디서 확인하나

[문서 목차](README.md) · [00 개요](00-overview.md) · [트러블슈팅](troubleshooting.md)

**웹 서비스 개발에서 흔히 요구되는 역량을 한 줄씩 적고, 이 저장소에서 그 근거가 되는 문서와 지금 단계를 붙였습니다.** "써 봤다"가 아니라 "왜 그렇게 했고 무엇을 버렸나"가 적힌 곳만 근거로 칩니다. 단계는 정직하게 적습니다 — 명세(설계와 근거가 문서로 있음) · 검증(스파이크나 검증기로 실제 확인) · 구현(코드와 테스트가 있음).

## 프론트엔드 · Next.js

| 역량 | 이 저장소에서 한 것 | 근거 | 단계 |
| --- | --- | --- | --- |
| 렌더링 전략 선택 (SSR · CSR · ISR) | 화면 13개마다 서버 렌더 여부와 이유, ISR을 버린 이유(사용자별 `viewer`) | [F01](frontend/01-rendering.md) | 명세 |
| 서버 캐시 사고 방지 | 사용자별 응답이 다른 사람에게 보이는 사고를 `serverFetch()` 한 곳에서 `no-store`로 막음 | [F01 1절](frontend/01-rendering.md) | 명세 |
| 상태 관리 구조 | 서버 상태 · URL 상태 · 폼 상태 · 연결 상태의 주인을 하나씩 정함. 전역 스토어 없음 | [F02](frontend/02-state.md) | 명세 |
| 데이터 패칭 · 캐시 | TanStack Query 키 설계, 서버 렌더 → 같은 키로 하이드레이트, 소켓 이벤트 → 캐시 갱신 규칙 | [F03](frontend/03-cache.md) | 명세 |
| 로딩 · 빈 · 에러 · 권한 상태 | 모든 데이터 화면에 네 상태, 에러 코드별 화면 반응 | [F04](frontend/04-errors.md) · [B06](backend/06-errors.md) | 명세 |
| 폼 · 입력 처리 | 막기 · 조용히 고치기 · 알리기 3단계, 공유 Zod 스키마, 이탈 확인 | [F05](frontend/05-forms.md) | 명세 |
| 접근성 · 시맨틱 마크업 | 포커스 이동 규칙, 라이브 리전, 네이티브 `<dialog>`, 키보드만으로 10개 기능 | [F06](frontend/06-focus.md) | 명세 |
| 실시간 클라이언트 | 연결 상태 기계, 오프라인 대기열, 같은 `tempId` 재시도, 번호 틈 감지 | [F07](frontend/07-socket-client.md) · [websocket.md](tech/websocket.md) | 검증 (스파이크 6개) |
| 이미지 처리 | 클라이언트 재인코딩으로 HEIC · 용량 · EXIF를 한 번에 해결 | [F05 6절](frontend/05-forms.md) · [T-04](troubleshooting.md#t-04) | 명세 |
| 반응형 | 360px 우선, PC도 640px 단일 열 — 그 결정의 트레이드오프 | [결정 0014](decisions/0014-single-column-640.md) | 명세 |
| 보안 | httpOnly 쿠키(토큰을 JS가 못 읽음), 같은 오리진 프록시 + `Origin` 검사(CSRF), 사용자 입력은 원문 저장 · 출력 시 이스케이프(`dangerouslySetInnerHTML` lint 금지) | [결정 0003](decisions/0003-jwt-httponly-cookie.md) · [0004](decisions/0004-api-proxy-same-origin.md) · AC-CM-30 · 31 | 명세 |
| 성능 | Web Vitals 목표, 첫 6장 `priority`, 이미지 크기 예약으로 CLS 0 | [00 개요 7절](00-overview.md#7-품질-기준) · [F01 5절](frontend/01-rendering.md) | 명세 |
| 테스트 | 컴포넌트(상태별 화면) · 소켓 상태 기계 · Playwright 두 컨텍스트 E2E | [테스트 전략](dev/TESTING.md) | 명세 |

## 백엔드 · Node.js

| 역량 | 이 저장소에서 한 것 | 근거 | 단계 |
| --- | --- | --- | --- |
| REST API 설계 · 명세 작성 | HTTP 25개 · 소켓 9개의 요청 · 응답 · 에러 · 권한 · 트랜잭션을 한 문서에. 화면 단위 응답 타입 | [B10](backend/10-api.md) | 명세 |
| 데이터 모델링 | 테이블 7개, 비정규화의 대가까지 적은 선택, DB CHECK로 지키는 규칙 | [B02](backend/02-data-model.md) | 검증 (스키마 검증기 통과) |
| 인덱스 · 쿼리 계획 | 쿼리마다 타는 인덱스 표, 시드 데이터로 `EXPLAIN ANALYZE` 계획 | [B02 4절](backend/02-data-model.md#4-인덱스--쿼리마다-무엇을-타는가) | 명세 |
| 트랜잭션 · 동시성 · 정합성 | 쓰기 11개마다 경계 · 경합 처리 · 중간 실패 시 남는 것. 조건부 UPDATE, `FOR SHARE`, 방 행 잠금으로 순서 보장 | [B03](backend/03-transactions.md) · [결정 0016](decisions/0016-message-seq.md) | 명세 |
| 멱등성 | 상품 등록 · 메시지 전송 · 읽음이 두 번 와도 한 번 | [B05](backend/05-idempotency.md) | 명세 |
| 인증 · 권한 | JWT 쿠키 + `tokenVersion` 무효화, 엔드포인트 × 역할 권한 표, 존재를 숨기는 404 | [B04](backend/04-authorization.md) · [B01](backend/01-layers.md) | 명세 |
| 에러 처리 · 관찰 가능성 | 에러 코드 카탈로그 하나, 요청 ID로 로그와 사용자 문의 연결 | [B06](backend/06-errors.md) · [B08](backend/08-observability.md) | 명세 |
| 보호 장치 | rate limit(프록시 뒤 IP · 토큰 버킷), 업로드 검증 8단계, 압축 폭탄 방어 | [B07](backend/07-protection.md) | 명세 |
| 실시간 서버 | 소켓은 통로, 출처는 DB. 커밋 후 emit, DB 커서 복구 | [B09](backend/09-socket-server.md) | 검증 (스파이크) |
| 배치 | 고아 파일 · 삭제 상품 정리, advisory lock으로 한 번만 | [B07 4절](backend/07-protection.md) | 명세 |
| 테스트 | 진짜 PostgreSQL 통합 테스트, 동시 요청 경합 테스트, 응답 스키마 검사 | [테스트 전략](dev/TESTING.md) | 명세 |

## 공통

| 역량 | 이 저장소에서 한 것 | 근거 |
| --- | --- | --- |
| 비즈니스 이해 · 큰 지도 | 엔티티 · 핵심 필드 · 업무 프로세스 · 변경 영향 매트릭스를 한 장에 | [00 개요 2절](00-overview.md#2-지도--엔티티--프로세스--영향-범위) |
| 요구사항 구체화 | 경우의 수 758개 → 수용 조건 251개, 조건마다 프론트 · 백엔드 역할 | [경우의 수](cases/README.md) · [01](01-requirements.md) |
| 트레이드오프 판단 | 결정 16개마다 버린 대안 · 잃는 것 · 바뀔 가능성 · 되돌리는 법 | [결정 기록](decisions/README.md) |
| 문제 해결 · 원인 분석 | 결함 15건을 증상 → 원인 → 해결 → 확인 방법으로 | [트러블슈팅](troubleshooting.md) |
| 기술 깊이 | 라이브러리를 쓰기 전에 밑바닥부터 — 소켓 프레임 파싱 · 하트비트 · 복구 | [기술 노트](tech/README.md) |
| 협업 규칙 | 커밋 규칙 · 브랜치 전략 · PR 셀프 리뷰 체크리스트 | [커밋](dev/COMMITS.md) · [브랜치](dev/BRANCHING.md) |
| AI 도구 활용과 검증 | 초안은 맡기고 판단 · 검증은 남기는 규칙, 실제로 잡은 것 | [AI와 일하는 방식](dev/AI-WORKFLOW.md) |
