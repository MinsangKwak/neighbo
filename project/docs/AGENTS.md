# 문서·검증 작업 기준

## 현재 구조

- `frontend-react/`: React·Next.js 화면과 프론트엔드 실행 설정.
- `backend-node/`: Express·Prisma·실시간 서버·배치. 공개 API 문서 기능은 `src/modules/api-docs/`.
- `shared-schema/`: 두 앱의 Zod 계약·정규화·타입.
- `project/docs/planning/`: 서비스 기획과 기능별 수용 조건.
- `project/docs/dev/`: 흐름·구현 책임·실행·배포·보안·결정·실험·문제 기록.
- `project/docs/design/`: 화면·퍼블리싱·공통 UI·접근성 기준.
- `project/tests/{frontend-react,backend-node,shared-schema}/`: 역할별 테스트·설정. 실행 코드의 src 아래 계층을 유지하며 src 단계를 반복하지 않음.
- `project/tests/frontend-react/e2e/`: 브라우저 시나리오. 지원 코드는 각 역할의 support/.
- `project/tools/`: 문서·AC 검사, 테스트 DB SQL, 독립 스파이크.

모든 Markdown은 `project/docs/`에 둡니다. 루트 README와 LICENSE는 예외입니다. 중복 설명은 복사하지 않고 canonical 문서로 연결합니다. 실행 코드·설정·검증 자료의 경로를 함께 바꾸며 CI·배포 설정·링크도 갱신합니다.

## 검증 명령

저장소 루트에서 Node.js 22 이상과 `npm ci`를 사용합니다.

```bash
npm run lint
npm run typecheck
npm run test:web
npm run test:shared
npm run test:docs -w backend-node
npm run build
python3 project/tools/check-docs.py
python3 project/tools/check-ac.py
```

검증 전용 워크스페이스는 `@neighbo/project`입니다. 루트 `npm test`는 전체 테스트를 한 번 실행합니다. 백엔드 통합 검사에는 개발 DB와 다른 `TEST_DATABASE_URL`, `npm run test:e2e`에는 마이그레이션이 적용된 별도 `E2E_DATABASE_URL`과 Chromium이 필요합니다. 자세한 명령은 [실행 기준](dev/runbook.md#로컬-실행과-패키지별-검사)을 따릅니다.

실행 명령·결과·DB·브라우저 준비 여부를 기록합니다. 테스트 등록 수, AC ID가 붙은 수, 실제 실행 통과 수를 구분합니다. 자동 접근성 검사를 전체 준수·인증으로 표현하지 않습니다.

## 보안·데이터 경계

- .env.example에는 예시만 둡니다. JWT·프록시·저장소 비밀값은 코드·문서·출력에 넣지 않습니다.
- 폼은 입력을 안내하고 서버가 입력·세션·소유권·참여자·상태 전이를 최종 검사합니다.
- 개발·통합 검사·E2E·스파이크 DB를 분리하며 초기화 실험은 전용 DB에서 실행합니다.
- 공개 Node Swagger는 읽기 전용입니다. 프록시가 쿠키·인증 비밀을 넘기지 않으며 실제 계약과 문서를 함께 바꿉니다.
- 운영 성과·실기기 확인·미실행 검사를 추정해 완료로 쓰지 않습니다. [보안 문서](dev/security.md)의 한계와 남은 확인을 보존합니다.

## 문서·주석

현재 구현·설계 기준·미검증 과제를 분리하며 고유한 수용 조건·재현 조건·결정 이유·근거 링크를 보존합니다. JavaScript·TypeScript 주석은 `//`로 한 줄씩, HTML 관련 주석은 사용자 지정 `/**/` 형식으로 작성하며 이모티콘·이모지를 넣지 않습니다. 경로·제목 변경 후 링크·앵커·AC 검사를 실행합니다.
