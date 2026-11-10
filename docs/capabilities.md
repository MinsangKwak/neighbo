# 설계·검증 현황

[문서 목차](README.md) · [개요](00-overview.md) · [트러블슈팅](troubleshooting.md)

**서비스 본체는 구현 전이며, 현재 결과물은 설계 문서와 WebSocket 실험 코드입니다.** 아래 표는 항목별 설계 내용과 확인 범위를 정리한 것입니다. 스파이크에서 확인한 동작은 서비스 구현·통합 검증과 구분합니다.

| 상태 | 의미 |
| --- | --- |
| 설계 | 처리 방식과 검증 계획을 문서로 정의 |
| 부분 검증 | 문서에 포함된 스키마 또는 별도 실험에서 특정 동작을 확인. 서비스 전체 검증은 구현 후 진행 |

## 프론트엔드 · Next.js

| 항목 | 설계 내용 | 상세 문서 | 상태 |
| --- | --- | --- | --- |
| 렌더링 | 13개 화면의 서버·클라이언트 처리 범위와 사용자별 응답의 공유 캐시 제한 | [F01](frontend/01-rendering.md) | 설계 |
| 상태 관리 | 서버·URL·폼·UI·연결 상태별 저장 위치와 갱신 주체 | [F02](frontend/02-state.md) | 설계 |
| 데이터 조회·캐시 | TanStack Query 키, 서버 데이터 전달, 쓰기·소켓 이벤트별 캐시 갱신 | [F03](frontend/03-cache.md) | 설계 |
| 화면 상태·오류 | 로딩·빈 목록·오류·권한 상태와 에러 코드별 화면 반응 | [F04](frontend/04-errors.md) · [B06](backend/06-errors.md) | 설계 |
| 폼·입력 | 입력 제한·정규화·검증 시점, 공유 Zod 스키마, 이탈 확인 | [F05](frontend/05-forms.md) | 설계 |
| 접근성 | 포커스 이동, 라이브 리전, 네이티브 `<dialog>`, 키보드 조작 | [F06](frontend/06-focus.md) | 설계 |
| 실시간 통신 | 연결 상태, 전송 대기열, 같은 `tempId` 재시도, 누락 메시지 복구. 연결·버퍼 동작은 별도 스파이크에서 확인 | [F07](frontend/07-socket-client.md) · [WebSocket 실험](tech/websocket.md) | 설계·부분 검증 |
| 이미지 | 업로드 전 브라우저 재인코딩과 형식·용량 처리. 브라우저별 호환성 검증 예정 | [F05 6절](frontend/05-forms.md) · [T-04](troubleshooting.md#t-04) | 설계 |
| 반응형 | 모바일 360px 우선, PC 640px 단일 열 구성 | [결정 0014](decisions/0014-single-column-640.md) | 설계 |
| 보안 | httpOnly 쿠키, 같은 오리진 프록시, Origin 검사, 출력 이스케이프 | [결정 0003](decisions/0003-jwt-httponly-cookie.md) · [0004](decisions/0004-api-proxy-same-origin.md) | 설계 |
| 성능 | Web Vitals 목표와 이미지 로딩·크기 예약 규칙. 측정은 서비스 구현 후 진행 | [개요 7절](00-overview.md#7-품질-기준) · [F01](frontend/01-rendering.md) | 설계 |
| 테스트 | 화면 상태·포커스·연결 상태 테스트와 두 사용자 컨텍스트 E2E | [테스트 전략](dev/TESTING.md) | 설계 |

## 백엔드 · Node.js

| 항목 | 설계 내용 | 상세 문서 | 상태 |
| --- | --- | --- | --- |
| API | HTTP 25개와 소켓 이벤트 9개의 요청·응답·에러·권한·트랜잭션 | [B10](backend/10-api.md) | 설계 |
| 데이터 모델 | 테이블 7개, 제약, 관계, 비정규화. 문서 내 Prisma 스키마의 검증 기록 포함 | [B02](backend/02-data-model.md) · [S-05](troubleshooting.md#s-05) | 설계·부분 검증 |
| 인덱스 | 조회별 인덱스와 시드 데이터를 이용한 `EXPLAIN ANALYZE` 검증 계획 | [B02 4절](backend/02-data-model.md#4-인덱스--쿼리마다-무엇을-타는가) | 설계 |
| 트랜잭션·동시성 | 쓰기 작업 11종의 경계, 조건부 UPDATE, `FOR SHARE`, 방별 행 잠금과 메시지 번호 | [B03](backend/03-transactions.md) · [결정 0016](decisions/0016-message-seq.md) | 설계 |
| 멱등성 | 상품 등록 식별자, 채팅방 유니크 제약, 메시지 `tempId`, 읽음 위치의 단조 증가 | [B05](backend/05-idempotency.md) | 설계 |
| 인증·권한 | JWT 쿠키, `tokenVersion` 무효화, 요청자·자원 상태별 권한, 비공개 자원 404 | [B04](backend/04-authorization.md) · [B01](backend/01-layers.md) | 설계 |
| 에러·로그 | 공통 에러 코드, 요청 ID, 구조화 로그, 민감정보 제외 | [B06](backend/06-errors.md) · [B08](backend/08-observability.md) | 설계 |
| 요청·파일 보호 | 프록시 원 IP 확인, 요청 제한, 업로드 검증, 압축 폭탄 방어 | [B07](backend/07-protection.md) | 설계 |
| 실시간 서버 | DB 저장 후 이벤트 발행, 커서 기반 복구. 서버 종료·재연결 동작은 별도 스파이크에서 확인 | [B09](backend/09-socket-server.md) · [WebSocket 실험](tech/websocket.md) | 설계·부분 검증 |
| 정리 배치 | 임시 업로드·삭제 상품 정리와 advisory lock을 통한 중복 실행 방지 | [B07](backend/07-protection.md) | 설계 |
| 테스트 | 실제 PostgreSQL 통합 테스트, 동시 요청, 응답 스키마 검사 | [테스트 전략](dev/TESTING.md) | 설계 |

## 공통 문서

| 항목 | 기록한 내용 | 문서 |
| --- | --- | --- |
| 서비스 구조 | 핵심 엔티티·필드, 업무 프로세스, 변경 영향 범위 | [개요 2절](00-overview.md#2-서비스-구조--엔티티--프로세스--영향-범위) |
| 요구사항 | 시나리오 758개, 수용 조건 251개, 조건별 프론트엔드·백엔드 역할 | [경우의 수](cases/README.md) · [요구사항](01-requirements.md) |
| 기술 결정 | 16개 결정의 대안·제약과 재검토 조건 | [결정 기록](decisions/README.md) |
| 문제 분석 | 명세 검토 10건과 스파이크 검증 5건의 원인·수정·확인 방법 | [트러블슈팅](troubleshooting.md) |
| 기술 실험 | WebSocket 프레임, 하트비트, 재연결, 복구, Socket.IO 버퍼 관찰 | [기술 노트](tech/README.md) |
| 개발 절차 | 커밋 단위, 브랜치·병합, PR 검토 항목 | [커밋](dev/COMMITS.md) · [브랜치](dev/BRANCHING.md) |
| AI 작업·검증 | 초안 작성과 설계 판단의 역할, 실행·문서 대조 절차 | [AI 작업·검증](dev/AI-WORKFLOW.md) |
