# backend-node · Node.js·Express 백엔드

**인증·권한, 거래 상태, 채팅 저장·복구, 사진과 정리 배치를 담당하는 Node.js 서비스입니다.** Express·TypeScript와 Prisma·PostgreSQL을 사용합니다. 화면·입력 안내·캐시는 [frontend-react](../frontend-react/README.md)가 담당하고, 서버는 요청을 다시 검증해 데이터 규칙을 적용합니다.

## 기술과 코드 지도

| 위치 | 담당하는 일 |
| --- | --- |
| [src/modules/](src/modules/) | 인증·상품·채팅·마이·알림의 경로·서비스·응답·테스트 |
| [src/db/](src/db/) · [prisma/](prisma/) | Prisma 클라이언트, 모델·제약·마이그레이션 |
| [src/realtime/](src/realtime/) | Socket.IO 인증·이벤트·커밋 후 전달 |
| [src/storage/](src/storage/) | 로컬·S3 호환 사진 저장소 인터페이스 |
| [src/jobs/](src/jobs/) · [src/seed/](src/seed/) | 파일 정리·데모 초기화·시드 |
| [src/config.ts](src/config.ts) | 시작 시 환경 변수 검증 |
| [src/docs/](src/docs/) | 공유 스키마 기반 OpenAPI 3.1·읽기 전용 Swagger·계약 회귀 검사 |
| [shared-schema](../shared-schema/src/) | 두 앱이 사용하는 Zod 스키마·정규화·타입 |

주요 기술은 Node.js·Express·TypeScript·Prisma 7·PostgreSQL 16·Socket.IO·Zod·bcrypt·sharp·Vitest·Supertest입니다.

## 구현한 처리 규칙

| 주제 | 서버의 책임 |
| --- | --- |
| 인증·권한 | JWT·httpOnly 쿠키, tokenVersion 무효화, 소유자·참여자 확인 |
| 최종 입력 검증 | 공유 스키마·정규화, 오류 코드·필드 오류 반환 |
| 거래·중복 요청 | DB 제약·조건부 UPDATE·트랜잭션, 멱등키·유니크 제약 |
| 채팅 | 방별 번호, DB 저장 후 전달, 같은 tempId 재시도·누락분 조회 |
| 경계·관찰 | 원 IP를 확인하는 프록시 계약, 요청 제한·업로드 검증, 요청 ID·로그 |
| 운영 배치 | 데모 초기화, 미연결 업로드·삭제 상품 사진·미참조 파일 정리 |

## 실행과 환경 변수

저장소 루트에서 `npm ci`를 실행하고 PostgreSQL을 준비합니다. `.env.example`을 이 폴더의 `.env`로 복사해 `DATABASE_URL`·`JWT_SECRET`·`PROXY_SECRET`·`ALLOWED_ORIGIN`을 설정합니다. `PROXY_SECRET`은 프론트엔드 값과 같아야 합니다.

```bash
docker compose up -d db
npm run db:generate -w backend-node
npm run db:deploy -w backend-node
npm run db:seed -w backend-node
npm run dev:api
```

API는 `http://localhost:4000`입니다. `DEMO_PASSWORD`가 있어야 데모 계정·상품 시드를 생성합니다. 시드 DB와 테스트 DB를 분리합니다. [환경·시드 상세](../docs/architecture/backend.md#11--구성과-시드)

| 목적 | 명령·조건 |
| --- | --- |
| lint·타입 | `npm run lint -w backend-node` · `npm run typecheck -w backend-node` |
| 통합 테스트 | 별도 `TEST_DATABASE_URL` 지정 후 `npm run test:api` |
| DB 없는 문서·제한 회귀 | `npm run test:docs -w backend-node` |
| 개발 마이그레이션 작성 | `npm run db:migrate -w backend-node` |
| 배포 마이그레이션 적용 | `npm run db:deploy -w backend-node` |
| 프로세스·DB 상태 | `/healthz` · `/readyz` |

현재 배포 구성은 Railway와 Supabase Storage입니다. 루트 Dockerfile은 마이그레이션 후 서버를 시작합니다. `render.yaml`은 이전용 설정이며 Render 이전 완료 기록은 아닙니다. [운영·이전 기준](../docs/dev.md#호스팅-비용과-옮길-계획)

## 읽기 전용 Node Swagger와 보안

API 실행 후 `http://localhost:4000/node-swagger`에서 실제 HTTP 31개 동작의 입력·응답·인증 조건을 확인합니다. JSON은 `/node-openapi.json`입니다. 웹 서비스의 [같은 문서](https://neighbo-liart.vercel.app/node-swagger)는 공개 문서만 인증 없이 프록시하고 API 기준 주소를 `/api`로 표시합니다. Try it out·외부 검증·인증 지속 저장을 끄며 고정된 자체 호스팅 자원만 제공합니다.

상품 생성·수정·상태 변경·삭제는 각각 사용자 30회/분으로 제한합니다. 소켓 join·read는 메시지 send와 분리한 사용자 버킷으로 DB 호출 전에 차단합니다. 서버 입력 재검증·Origin·세션·소유권·업로드·오류·의존성에 대한 [위협별 방어와 검증 범위](../docs/SECURITY.md)를 함께 기록했습니다.

## 상세 설계

[요청 계층](../docs/architecture/backend.md#01--요청-계층) · [데이터 모델](../docs/architecture/backend.md#02--데이터-모델) · [트랜잭션](../docs/architecture/backend.md#03--트랜잭션-경계) · [권한](../docs/architecture/backend.md#04--권한-매트릭스) · [멱등성](../docs/architecture/backend.md#05--멱등성) · [오류](../docs/architecture/backend.md#06--에러-코드) · [보호·배치](../docs/architecture/backend.md#07--보호-장치와-배치) · [로그](../docs/architecture/backend.md#08--관찰-가능성) · [소켓](../docs/architecture/backend.md#09--소켓-서버) · [API](../docs/architecture/backend.md#10--api-명세) · [환경·시드](../docs/architecture/backend.md#11--구성과-시드)
