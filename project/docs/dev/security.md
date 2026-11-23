# 보안 경계와 검증

**브라우저 입력과 프록시 헤더를 그대로 신뢰하지 않고, 서버의 인증·권한·검증을 통과한 요청만 처리합니다.** 이 문서는 현재 코드에서 확인한 방어, 이번에 보완한 누락, 실행 가능한 검사를 연결합니다. 전체 보안 적합성이나 침투 테스트 통과를 뜻하지 않습니다.

## 경계별 방어

| 위협·실패 상황 | 프론트엔드의 처리 | 백엔드의 최종 방어·근거 |
| --- | --- | --- |
| 변조된 입력·잘못된 타입 | 공유 Zod로 입력 안내, 서버 필드 오류 표시 | [validate](../../../backend-node/src/middleware/validate.ts)에서 재검증, JSON 1MB 제한. [공유 스키마](../../shared-schema/src/)의 정규화·길이·교차 필드 검사 |
| 세션 탈취·만료·다른 기기 세션 유지 | 세션 토큰을 브라우저 저장소에 넣지 않고, 인증 응답을 캐시하지 않음 | [auth](../../../backend-node/src/middleware/auth.ts)·[JWT](../../../backend-node/src/lib/jwt.ts): HttpOnly·SameSite=Lax·운영 Secure 쿠키, 서명 알고리즘·만료·용도·tokenVersion·삭제 여부 검사 |
| 다른 사이트의 쓰기 요청·소켓 연결 | 같은 출처의 `/api` 프록시 사용 | [originGuard](../../../backend-node/src/middleware/origin.ts)가 허용되지 않거나 빠진 Origin의 쓰기를 거절. Socket.IO는 CORS 표시 외에 `allowRequest`로 연결 자체를 제한 |
| 다른 사람의 상품·파일·채팅방 조작 | 권한에 따라 조작 버튼과 안내 분기 | [상품 서비스](../../../backend-node/src/modules/products/service.ts)의 소유권·업로드 소유권·조건부 UPDATE, [채팅 서비스](../../../backend-node/src/modules/chat/service.ts)의 참여자 검사·매개변수화 SQL. UI 숨김은 권한 검사 대체 수단이 아님 |
| HTML 주입·외부 로그인 복귀 주소 | React 텍스트 렌더링, [safeNext](../../../frontend-react/src/features/auth/next.ts)의 내부 경로 검사 | [공통 응답 헤더](../../../frontend-react/src/lib/securityHeaders.ts)의 nosniff·프레임 금지·부분 CSP, API의 nosniff. 앱 CSP는 nonce 기반 `script-src`를 적용한 전면 스크립트 정책은 아님 |
| 서버 요청의 외부 리다이렉트로 프록시 비밀 유출 | [serverFetch](../../../frontend-react/src/lib/api/serverFetch.ts)·[API proxy](../../../frontend-react/src/lib/api/proxy.ts)에서 자동 리다이렉트 금지, 고정 API 주소 사용 | `X-Proxy-Secret`은 서버 전용. [clientIp](../../../backend-node/src/lib/clientIp.ts)는 비밀이 일치할 때만 `X-Client-IP`를 신뢰 |
| 위장 이미지·큰 파일·이미지 처리 과부하 | 파일 선택과 오류·재시도 안내 | [업로드](../../../backend-node/src/modules/uploads/route.ts)·[이미지 처리](../../../backend-node/src/modules/uploads/image.ts): 스트림 4MB, 매직 바이트·5천만 픽셀 제한, WebP 재인코딩·메타데이터 제거, 처리 2개·대기 8개. 저장소 경로 경계 검사 |
| 쓰기·소켓 이벤트 폭주 | 중복 제출 방지, 전송 상태·재시도 안내 | 상품 생성·수정·상태 변경·삭제는 각각 사용자별 30회/분. 소켓은 사용자별 send·join·read 버킷을 분리하고 DB 호출 전에 거절. [상품 제한 회귀](../../tests/backend-node/modules/products/rate-limit.test.ts)·[소켓 제한 회귀](../../tests/backend-node/realtime/socket-control-rate.test.ts) |
| 오류·문서·로그를 통한 비밀 노출 | 고정 공개 문서 프록시는 쿠키·Authorization·프록시 비밀을 전달하지 않음 | [오류 처리](../../../backend-node/src/middleware/errorHandler.ts)의 공통 오류 응답, [직렬화](../../../backend-node/src/modules/auth/serialize.ts)의 공개·본인 필드 분리, 비밀·실제 토큰 예시 없는 Swagger |
| 알려진 취약 의존성 | lockfile에 설치 버전 고정 | Prisma 하위 `effect`를 호환 3.x 패치인 3.22.1로 override. [Effect 공지](https://github.com/advisories/GHSA-7589-6fvf-x4pw) 대응. 개발 도구의 [minimatch 공지](https://github.com/advisories/GHSA-g3hv-75wg-m249)는 ESLint·typescript-eslint 호환 minor 업데이트로 해소. API에서의 악용 가능성을 입증한 결과는 아님 |

## 확인하고 보완한 결함

| 확인한 누락 | 반영한 조치 | 회귀 검사 |
| --- | --- | --- |
| 상품 생성에만 쓰기 제한이 있고 수정·상태 변경·삭제에는 없음 | 네 동작을 각각 사용자별 30회/분으로 제한 | 31번째 요청은 429, 이후 서비스 미호출. 사용자·동작 분리와 인증 선행 검사 |
| 소켓 메시지 전송과 달리 방 참여·읽음의 DB 작업은 무제한 | join은 최대 20개·초당 5개 보충, read는 최대 20개·초당 10개 보충. 같은 사용자의 탭은 버킷 공유 | 읽음 100개를 한꺼번에 보내 서비스 호출 20회·RATE_LIMITED 80회 확인. 버킷 보충·다중 탭·사용자 분리·send 독립 검사 |
| 서버 렌더링 요청이 인증 헤더를 붙인 채 302를 자동 추적할 수 있음 | `redirect: 'manual'`로 외부 추적 금지 | serverFetch 테스트에서 요청 옵션과 리다이렉트 오류 처리 검사 |
| HTML 응답의 프레임·기본 URL·폼 목적지 제한 부족 | X-Frame-Options와 CSP `frame-ancestors`·`object-src`·`base-uri`·`form-action` 적용 | 공통 헤더 및 API 프록시 직접 응답 검사 |
| Next 전역 헤더가 문서 전용 CSP를 덮음 | 전역 앱 규칙 뒤에 Swagger·OpenAPI의 경로별 헤더를 배치하고 같은 상수를 Route Handler와 공유 | 실제 HTTP 응답 CSP와 Swagger 렌더링·읽기 전용 상태를 E2E로 검사 |

## 읽기 전용 API 문서

[서비스의 Node Swagger](https://neighbo-liart.vercel.app/node-swagger) · [서비스 OpenAPI JSON](https://neighbo-liart.vercel.app/node-openapi.json)

| 실행 위치 | 문서 URL | 표시하는 API 기준 주소 |
| --- | --- | --- |
| Next.js 웹·배포 서비스 | `/node-swagger` · `/node-openapi.json` | 같은 출처의 `/api` 프록시 |
| Node.js API 직접 접속 | `http://localhost:4000/node-swagger` · `/node-openapi.json` | 같은 출처의 `/` |

문서는 [공유 Zod](../../shared-schema/src/)에서 입력·응답 스키마를 만들고, 실제 HTTP **31개 동작**을 설명합니다. 정규화·문자 수·교차 필드·권한 판단은 서버가 최종 기준입니다. Socket.IO 이벤트는 HTTP 목록에 넣지 않았습니다.

Swagger UI 5.35.1의 CSS·bundle과 자체 초기화 파일만 제공합니다. 임의 패키지 파일은 공개하지 않으며 CDN·외부 validator를 사용하지 않습니다. 모든 메서드의 Try it out, 쿼리 설정 주입, 인증 지속 저장을 끄고 스키마 요청에 `credentials: omit`을 적용합니다. 문서 프록시는 GET·HEAD만 허용하고, 리다이렉트·임의 경로·인증 전달을 차단하며 응답을 `no-store`로 처리합니다. UI의 읽기 전용 설정과 별개로 실제 API는 기존 인증·권한·Origin 검사를 수행합니다. [Swagger UI 설정 기준](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/)

## 검사와 한계

```bash
npm --prefix project run test:docs
npm --prefix project run test:web
npm --prefix project run test:shared
npm --prefix project run typecheck
npm --prefix project run lint
npm --prefix project audit
npm --prefix frontend-react audit
npm --prefix backend-node audit
```

`test:docs`는 DB 없이 OpenAPI 3.1 구조·실제 경로 일치, 공개 자원·헤더·읽기 전용 설정과 상품·소켓 제한을 검사합니다. 백엔드 전체 테스트에는 `TEST_DATABASE_URL`, E2E에는 별도 DB와 Chromium이 필요합니다. 전체 실행 결과는 [CI](../../../.github/workflows/ci.yml)에서 확인합니다.

이번 변경의 로컬 실행 범위는 문서·제한 회귀 20개, 프론트엔드 229개와 공유 스키마 53개입니다. lint·타입·Next 빌드도 검사합니다. 2026-11-23 의존성 감사 기록은 개발 의존성 포함 0건이었으며, 이는 해당 시점의 알려진 공지 기준입니다. 공개 문서의 렌더링·요청 실행 비활성은 E2E에 포함했습니다. DB 통합·전체 E2E·배포 환경 검증은 CI와 배포 후 확인 범위입니다.

HTTP 한도·소켓 버킷·세션 연결 무효화 정보는 프로세스 메모리에 있습니다. 여러 인스턴스를 운영하려면 공유 저장소가 필요합니다. 원 IP 검사는 신뢰하는 프록시가 전달 헤더를 덮어쓴다는 배포 계약에 의존합니다. 저장소 서비스의 실제 권한 정책·비밀값 회전·호스트 방화벽·분산 부하·외부 침투 테스트는 이 코드 검사의 범위에 포함하지 않았습니다.
