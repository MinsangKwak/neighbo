# shared-schema · 프론트엔드와 API의 입력 계약

React 화면과 Node.js API가 함께 사용하는 **Zod 스키마·TypeScript 타입·입력 정규화 함수**입니다. 같은 입력을 화면과 서버에서 서로 다른 규칙으로 해석하지 않도록 검증 기준을 한곳에서 관리합니다.

| 코드 | 담당하는 계약 |
| --- | --- |
| [auth.ts](src/auth.ts) | 가입·로그인 입력 |
| [product.ts](src/product.ts) | 상품 입력·조회·상태 |
| [chat.ts](src/chat.ts) | 채팅 요청·메시지 |
| [me.ts](src/me.ts) · [user.ts](src/user.ts) | 내 정보·사용자 데이터 |
| [normalize.ts](src/normalize.ts) | 입력 정규화와 사용자에게 보이는 문자 단위 처리 |
| [error.ts](src/error.ts) | 공통 오류 형식과 필드 오류 변환 |
| [index.ts](src/index.ts) | 공개 진입점 |

화면은 이 계약으로 오류 안내를 만들고, 서버는 같은 계약으로 받은 값을 검증합니다. **권한 확인과 최종 저장 판단은 서버가 담당**합니다. 프론트엔드 검증만으로 API 요청을 허용하지 않습니다.

## 사용 위치

- [frontend-react](../frontend-react/README.md): 폼 검증·필드 오류·화면 데이터 타입
- [backend-node](../backend-node/README.md): 요청 검증·공통 오류·응답 타입

별도 빌드 결과물 대신 `@neighbo/shared-schema`의 TypeScript 소스를 공유합니다. Next.js는 `transpilePackages`로, 백엔드는 `tsx`로 이 소스를 처리합니다. 앱 전용 상태나 데이터베이스 코드는 이 패키지에 넣지 않습니다.

## 검증

저장소 루트에서 실행합니다.

```bash
npm ci
npm run typecheck -w shared-schema
npm run test:shared
```

테스트는 각 스키마 옆의 `*.test.ts`에서 정상값·경계값·오류 변환·정규화를 확인합니다. 데이터베이스나 실행 중인 서버는 필요하지 않습니다.

[프로젝트 소개](../README.md) · [프론트엔드 설계](../docs/architecture/frontend.md) · [백엔드 설계](../docs/architecture/backend.md)
