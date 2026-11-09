# 0004 · 프론트가 백엔드를 프록시해 같은 오리진을 유지한다

| 상태 | 결정 2026-11-09 · 소켓 인증 방식 확정 2026-11-09 (스파이크 후) |
| --- | --- |
| 영향 | 쿠키 속성 · CORS 설정 · 배포 구성 · 소켓 연결 주소 |

## 맥락

프론트는 Vercel(`neighbo.vercel.app`), 백엔드는 Railway(`xxx.up.railway.app`) — 도메인이 다르다. 브라우저 입장에서 교차 사이트이므로 0003의 쿠키가 `SameSite=Lax`로는 백엔드에 전송되지 않는다.

## 선택

Next.js Route Handler `app/api/[...path]/route.ts`가 `/api/*` 요청을 백엔드로 그대로 전달한다(헤더 · 쿠키 · 본문 포함). 브라우저는 항상 프론트 오리진하고만 통신한다.

**소켓은 예외** — Vercel 함수는 WebSocket 상시 연결을 중계할 수 없으므로 브라우저가 백엔드에 직접 연결한다. 이때 교차 사이트 쿠키에 기대지 않는다:

1. 프론트가 같은 오리진의 `GET /api/socket-token`을 호출 (일반 세션 쿠키로 인증, 프록시 경유)
2. 백엔드가 `{ sub, purpose: "socket", exp: 60초 }` JWT를 발급
3. `io(SOCKET_URL, { auth: (cb) => fetchToken().then((token) => cb({ token })) })` — `auth`를 함수로 두어 재연결마다 새 토큰
4. 소켓 미들웨어가 `handshake.auth.token`을 검증 (`purpose`가 다르면 거부)

[스파이크 ⑤](../tech/websocket.md)에서 `handshake.auth`로 인증 · 거부가 동작하는 것을 확인했다. 쿠키를 쿼리스트링에 넣는 안은 URL이 로그에 남아 버렸다.

## 버린 대안

| 대안 | 장점 | 버린 이유 |
| --- | --- | --- |
| `SameSite=None; Secure` + CORS `credentials: true` | 프록시 코드 없음 | 모든 쓰기 요청에 CSRF 대비가 필수가 됨. Safari ITP가 서드파티 쿠키를 제한해 iOS에서 로그인이 풀리는 사례가 있음 |
| 커스텀 도메인으로 서브도메인 통일 (`app.neighbo.kr` · `api.neighbo.kr`) | 가장 정석. 쿠키 `Domain=.neighbo.kr` | 도메인 구매 · DNS가 필요. 가능하면 **이쪽으로 가고 프록시를 제거**한다 — 바뀔 가능성 항목 |
| 백엔드가 프론트도 서빙 (Express가 Next를 호스팅) | 오리진 하나 | Vercel의 이미지 최적화 · 엣지 캐시를 버림. 배포도 하나로 묶여 롤백 단위가 커짐 |

## 트레이드오프

- 모든 API 요청이 Vercel 함수를 한 번 거친다 — 지연 수십 ms 추가, Vercel 함수 호출 수 증가.
- 파일 업로드(수 MB)가 프록시를 지나간다. Vercel 함수 본문 한도(4.5MB)에 걸릴 수 있어 **업로드는 백엔드로 직접** 보내야 할 수 있다 — 기술 노트에서 확인.
- 프록시 한 파일이 장애 지점이 된다.

## 바뀔 가능성과 되돌리는 법

**중간~높음.** 커스텀 도메인을 사면 서브도메인 방식이 더 낫다. 그때 ① 프록시 파일 삭제 ② 프론트의 `API_BASE`를 `api.` 도메인으로 ③ 쿠키에 `Domain` 추가 ④ CORS 허용 목록에 프론트 추가. 이 네 곳 외엔 닿지 않도록 API 호출을 `apiFetch()` 한 함수로 모은다.
