# 공유 스키마 · 화면과 API의 입력 계약

[문서 목차](../README.md) · [프론트엔드](frontend.md) · [백엔드](backend.md)

React 화면과 Node.js API가 함께 사용하는 **Zod 스키마·TypeScript 타입·입력 정규화 함수**입니다. 같은 입력을 두 앱에서 서로 다른 규칙으로 해석하지 않도록 계약을 [shared-schema/src](../../shared-schema/src/) 한곳에서 관리합니다.

| 코드 | 담당하는 계약 |
| --- | --- |
| [auth.ts](../../shared-schema/src/auth.ts) | 가입·로그인 입력 |
| [product.ts](../../shared-schema/src/product.ts) | 상품 입력·조회·상태 |
| [chat.ts](../../shared-schema/src/chat.ts) | 채팅 요청·메시지 |
| [me.ts](../../shared-schema/src/me.ts) · [user.ts](../../shared-schema/src/user.ts) | 내 정보·사용자 데이터 |
| [normalize.ts](../../shared-schema/src/normalize.ts) | 정규화와 사용자에게 보이는 문자 단위 처리 |
| [error.ts](../../shared-schema/src/error.ts) | 공통 오류 형식·필드 오류 변환 |
| [index.ts](../../shared-schema/src/index.ts) | 공개 진입점 |

## 두 앱의 책임

화면은 이 계약으로 입력 오류를 안내하고, 서버는 받은 값을 같은 계약으로 다시 검증합니다. **권한 확인과 최종 저장 판단은 서버가 담당**합니다. 클라이언트 검증만으로 API 요청을 허용하지 않습니다.

별도 빌드 결과물 대신 `@neighbo/shared-schema`의 TypeScript 소스를 공유합니다. Next.js는 `transpilePackages`로, 백엔드는 `tsx`로 처리합니다. 앱 전용 상태·DB 코드는 이 패키지에 넣지 않습니다.

## 검사

저장소 루트에서 `npm ci` 후 `npm run typecheck -w shared-schema`·`npm run test:shared`를 실행합니다. [계약 검사](../tests/shared-schema/)는 정상값·경계값·오류 변환·정규화를 확인하며 DB·실행 중인 서버는 필요하지 않습니다.
