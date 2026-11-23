# 문서·검증 작업 기준

## 현재 구조

- `frontend-react/`: React·Next.js 실행 코드와 프론트엔드 환경 설정.
- `backend-node/`: Express 실행 코드, Prisma 모델·마이그레이션과 백엔드 환경 설정. 공개 API 문서 기능은 `src/modules/api-docs/`.
- `shared-schema/`: 두 앱이 사용하는 Zod 계약·정규화·타입.
- `docs/`: 모든 Markdown 문서, 검증 코드와 도구. 루트 `README.md`와 `LICENSE`는 예외.
- `docs/tests/{frontend-react,backend-node,shared-schema}/`: 패키지별 테스트와 설정. 테스트 파일은 실행 코드의 `src/` 아래 계층을 유지하며 `src/` 단계는 반복하지 않음. E2E는 `docs/tests/frontend-react/e2e/`, 지원 코드는 각 역할의 `support/`.
- `docs/tools/`: 문서·수용 조건 검사, 테스트 DB 초기화 SQL, 독립 실험 `docs/tools/spikes/`.

실행 코드와 검증 자료를 함께 바꾸고, 경로가 바뀌면 Markdown 링크·CI·검사 설정·배포 설정까지 맞춥니다. 중복 README를 만들기보다 [문서 목차](README.md)와 역할별 설계에 연결합니다.

## 검증 명령

명령은 저장소 루트에서 실행합니다. Node.js 22 이상과 `npm ci`가 기준입니다.

```bash
npm run lint
npm run typecheck
npm run test:web
npm run test:shared
npm run test:docs -w backend-node
npm run build
python3 docs/tools/check-docs.py
python3 docs/tools/check-ac.py
```

`npm test`는 문서 워크스페이스의 전체 테스트를 실행합니다. 백엔드 통합 검사는 개발 DB와 다른 `TEST_DATABASE_URL`이 필요합니다. `npm run test:e2e`에는 마이그레이션이 적용된 별도 `E2E_DATABASE_URL`과 Chromium이 필요하며, 실행기가 API와 웹을 띄웁니다. 패키지별 명령과 환경 준비는 [개발 기준](dev.md#로컬-실행과-패키지별-검사)을 따릅니다.

실행한 명령·결과·DB와 브라우저 준비 여부를 구분해 기록합니다. 테스트 등록 수, AC ID가 붙은 수, 실제 실행 통과 수를 같은 의미로 쓰지 않습니다. 접근성 자동 검사를 전체 준수·인증 결과로 표현하지 않습니다.

## 보안·데이터 경계

- `.env.example`에는 예시만 두며 실제 JWT·프록시·저장소 비밀값은 코드·문서·테스트 출력에 넣지 않습니다.
- 폼 검증은 입력 안내를 맡고 서버가 세션·소유권·참여자·입력·상태 전이를 최종 검사합니다.
- 개발·통합 테스트·E2E·스파이크 DB를 분리합니다. 초기화·정리 실험은 전용 DB에서만 실행합니다.
- 공개 Node Swagger는 읽기 전용이며 프록시가 쿠키·인증 비밀을 넘기지 않습니다. 문서와 실제 API 계약을 함께 갱신합니다.
- 운영 성과·실기기 확인·미실행 검사를 추정해 완료로 쓰지 않습니다. [보안 문서](SECURITY.md)의 한계와 남은 확인을 보존합니다.

## 문서·주석

현재 구현·설계 기준·미검증 과제를 분리하고 고유한 재현 조건·결정 이유·증거 링크를 보존합니다. 모든 Markdown은 `docs/` 안에 두며 루트 서비스 소개는 `README.md` 하나로 유지합니다.

주석은 한 줄씩 작성하고 이모티콘·이모지를 사용하지 않습니다. JavaScript·TypeScript는 `//` 한 줄 주석을 사용하며 HTML 관련 주석은 사용자 지정 `/**/` 형식을 따릅니다. 문서나 코드 경로를 바꾼 뒤 링크·앵커 검사를 실행합니다.
