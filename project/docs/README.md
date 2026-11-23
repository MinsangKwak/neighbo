# 프로젝트 문서

[서비스·코드 지도](../../README.md)

**기획·개발·디자인 문서의 입구입니다.** 실행 코드는 저장소 루트의 세 패키지, 테스트와 도구는 각각 [project/tests](../tests/)·[project/tools](../tools/)에서 관리합니다.

| 분류 | 먼저 읽을 문서 | 담는 내용 |
| --- | --- | --- |
| 기획 | [서비스 기획](planning/product.md) · [기능별 요구사항](#기능별-요구사항--한-기능--한-장) | 엔티티·업무 프로세스·영향 범위·품질 목표와 279개 수용 조건 |
| 개발 | [흐름·공유 계약](dev/architecture.md) · [프론트엔드](dev/frontend.md) · [백엔드](dev/backend.md) | 요청→서버→응답, 상태·캐시·권한·트랜잭션·실시간 책임 |
| 디자인 | [UI·퍼블리싱·접근성](design/guide.md) | 화면 구성·공통 UI·입력 레이블·오류·초점·명도 대비·반응형 |
| 실행·검증 | [운영·개발 기준](dev/runbook.md) · [보안 경계](dev/security.md) | 환경·DB·배포·검사 명령·작업 방식·검증 한계 |
| 판단·재현 | [결정 17개](dev/decisions.md) · [실험·관찰](dev/experiments.md) · [트러블슈팅](dev/troubleshooting.md) | 선택 이유·트레이드오프, 실험 15개 실행 조건, 문제의 원인·수정 |
| 문서 작업 | [AGENTS.md](AGENTS.md) | 현재 구조·검사·보안·주석 기준 |

## 기능별 요구사항 — 한 기능 = 한 장

각 장은 **요구사항**(유저 스토리 · 권한 · 수용 조건과 프론트엔드 · 백엔드 역할)과 **경우의 수**(입력 · 권한 · 동시성 · 네트워크 · 접근성 · 데이터 경계별 기대 동작)로 구성됩니다.

| 문서 | 수용 조건 접두어 |
| --- | --- |
| [00 공통](planning/features/00-common.md) — 표기법 · 인증 · 응답 형식 · 보안 · 접근성 · 입력 처리 · 비기능 | AC-CM |
| [01 회원가입](planning/features/01-signup.md) | AC-SU |
| [02 로그인 · 로그아웃](planning/features/02-login.md) | AC-LI |
| [03 중고 목록](planning/features/03-product-list.md) | AC-PL |
| [04 거래 등록 · 수정](planning/features/04-product-create.md) | AC-PC |
| [05 거래 상세 · 상태 변경](planning/features/05-product-detail.md) | AC-PD |
| [06 거래 삭제](planning/features/06-product-delete.md) | AC-PX |
| [07 채팅 목록](planning/features/07-chat-list.md) | AC-CL |
| [08 채팅](planning/features/08-chat.md) | AC-CH |
| [09 마이페이지](planning/features/09-mypage.md) | AC-MP |
| [10 채팅 알림](planning/features/10-notification.md) | AC-NT |
| [11 판매자 프로필](planning/features/11-seller-profile.md) (2차) | AC-UP |
| [12 관심(찜)](planning/features/12-favorite.md) (2차) | AC-FV |
| [13 동네](planning/features/13-neighborhood.md) (2차) | AC-NB |
