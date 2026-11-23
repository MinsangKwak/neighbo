# 문서·검증 작업 기준

## 현재 구조

저장소 루트의 Git 관리 항목은 `.github/`·`frontend-react/`·`backend-node/`·`project/`·`README.md`·`LICENSE`입니다.

| 위치 | 책임 |
| --- | --- |
| `frontend-react/` | React·Next.js 화면·퍼블리싱·접근성과 독립 package.json·package-lock |
| `backend-node/` | Express·Prisma·실시간 서버·배치와 독립 package.json·package-lock. 공개 문서는 src/modules/api-docs/ |
| `project/shared-schema/` | 두 앱의 Zod 계약·정규화·타입. 앱은 file:../project/shared-schema로 참조 |
| `project/package.json` | @neighbo/project의 설치·실행·검사 통합 명령. 내부 workspace는 shared-schema 하나 |
| `project/docs/planning/` | 기획·기능별 수용 조건 |
| `project/docs/dev/` | 흐름·구현 책임·실행·배포·보안·결정·실험·문제 기록 |
| `project/docs/design/` | 화면·퍼블리싱·공통 UI·접근성 기준 |
| `project/tests/` | frontend-react·backend-node·shared-schema 역할별 검사와 설정. src 아래 계층을 유지하며 src 단계는 반복하지 않음 |
| `project/tools/` | Git 설치·문서·AC 검사, 테스트 DB SQL, 독립 스파이크 |
| `project/.nvmrc` · `project/tsconfig.base.json` | Node.js 22와 공통 타입 검사 기준 |

브라우저 시나리오는 `project/tests/frontend-react/e2e/`, 지원 코드는 각 역할의 support/에 둡니다. 루트 package.json이나 project 바깥의 앱을 가리키는 workspace를 만들지 않습니다. npm 10·11의 외부·중첩 workspace 설치 실패를 확인해 독립 앱 lockfile과 project 내부 공유 workspace로 설치 경계를 정했습니다.

모든 Markdown은 `project/docs/`에 두며 루트 README·LICENSE는 예외입니다. 중복 설명은 복사하지 않고 기준 문서로 연결합니다. 실행 코드·설정·검증 경로가 바뀌면 CI·배포 설정·문서 링크도 함께 갱신합니다.

## 검증 명령

Node.js 22 이상에서 저장소 루트를 작업 경로로 사용합니다. clone 후 아래 순서로 로컬 Git 제외 규칙과 패키지를 준비합니다.

```bash
python3 project/tools/setup_git.py
npm --prefix project run setup
```

Git 설치 도구는 `.git/info/exclude`의 자체 관리 블록만 추가·갱신하며 기존 제외 항목과 hooks 설정을 덮어쓰지 않습니다. frontend-react·backend-node·project의 `.gitignore`도 환경 파일·node_modules·빌드·생성 코드를 제외합니다. setup은 project·공유 계약 → 백엔드 → 프론트엔드 순서로 각 lockfile의 clean install을 실행합니다.

```bash
npm --prefix project run lint
npm --prefix project run typecheck
npm --prefix project run test:web
npm --prefix project run test:shared
npm --prefix project run test:docs
npm --prefix project run build
npm --prefix project run check:docs
```

`npm --prefix project run test`는 공유 계약·API 통합·웹 검사를 실행합니다. API에는 개발 DB와 다른 TEST_DATABASE_URL, `npm --prefix project run test:e2e`에는 마이그레이션이 적용된 별도 E2E_DATABASE_URL과 Chromium이 필요합니다. 타입 검사는 Prisma 생성을 포함합니다. DB 준비·개별 명령·배포 기준은 [실행 기준](dev/runbook.md#로컬-실행과-패키지별-검사)을 따릅니다.

Compose는 저장소 루트의 볼륨·경로를 유지하도록 `docker compose --project-directory . -f project/docker-compose.yml up -d db`로 실행합니다. 백엔드 Dockerfile은 backend-node/Dockerfile이고 빌드 context는 저장소 루트입니다. Vercel·Railway의 외부 설정 적용과 Render 이전은 실제 확인 결과로 구분해 기록합니다.

실행 명령·결과·DB·브라우저 준비 여부를 기록합니다. 테스트 등록 수, AC ID가 붙은 수, 실제 실행 통과 수를 구분합니다. 자동 접근성 검사를 전체 준수·인증으로 표현하지 않습니다.

## 보안·데이터 경계

- .env.example에는 예시만 둡니다. JWT·프록시·저장소 비밀값은 코드·문서·출력에 넣지 않습니다.
- 폼은 입력을 안내하고 서버가 입력·세션·소유권·참여자·상태 전이를 최종 검사합니다.
- 개발·통합 검사·E2E·스파이크 DB를 분리하며 초기화 실험은 전용 DB에서 실행합니다.
- 공개 Node Swagger는 읽기 전용입니다. 프록시가 쿠키·인증 비밀을 넘기지 않으며 실제 계약과 문서를 함께 바꿉니다.
- 운영 성과·실기기 확인·미실행 검사를 추정해 완료로 쓰지 않습니다. [보안 문서](dev/security.md)의 한계와 남은 확인을 보존합니다.

## 문서·주석

현재 구현·설계 기준·미검증 과제를 분리하며 고유한 수용 조건·재현 조건·결정 이유·근거 링크를 보존합니다. JavaScript·TypeScript 주석은 `//`로 한 줄씩, HTML 관련 주석은 사용자 지정 `/**/` 형식으로 작성하며 이모티콘·이모지를 넣지 않습니다. 경로·제목 변경 후 링크·앵커·AC 검사를 실행합니다.
