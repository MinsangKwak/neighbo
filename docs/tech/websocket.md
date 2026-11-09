# 기술 노트 · WebSocket과 Socket.IO

[기술 노트 목차](README.md) · [결정 0005 Socket.IO](../decisions/0005-socket-io.md) · [결정 0004 같은 오리진](../decisions/0004-api-proxy-same-origin.md) · 스파이크 코드: [`spikes/websocket/`](../../spikes/websocket/)

**Socket.IO는 재연결 · 룸 · ack · 폴링 폴백을 대신해 주지만, "끊긴 동안 놓친 메시지"와 "보냈다고 믿었지만 사라진 메시지"는 대신해 주지 않습니다.** 이 두 가지는 DB 커서(`after`)와 `tempId` 재시도로 우리가 직접 막아야 한다는 것이 스파이크 여섯 개로 확인됐습니다.

---

## 1. 왜 필요한가

채팅 수신 · 읽음 동기화 · 배지 갱신은 **서버가 먼저** 클라이언트에게 알려야 하는 일입니다. HTTP는 클라이언트가 묻기 전엔 서버가 말할 수 없으므로, 폴링(5초마다 묻기)으로는 "실시간"이 안 되고 요청만 낭비됩니다. WebSocket은 한 번 연결하면 양쪽이 아무 때나 보낼 수 있는 통로입니다.

대안 비교와 Socket.IO를 고른 이유는 [결정 0005](../decisions/0005-socket-io.md)에 있습니다.

---

## 2. 어떻게 동작하는가

```
브라우저                                   서버
  │  GET /  HTTP/1.1                        │
  │  Upgrade: websocket                     │
  │  Sec-WebSocket-Key: F1gLd1Ja...==       │   ← 매번 무작위 16바이트
  │ ──────────────────────────────────────▶ │
  │                                         │   accept = base64(sha1(key + 고정 GUID))
  │  HTTP/1.1 101 Switching Protocols       │
  │  Sec-WebSocket-Accept: <accept>         │
  │ ◀────────────────────────────────────── │
  │                                         │
  │  ═══════ 이제부터 HTTP가 아니라 프레임 ═══════
  │  [FIN|opcode][MASK|len][mask 4B][payload]│   ← 클라→서버는 반드시 마스킹
  │ ──────────────────────────────────────▶ │
  │  [FIN|opcode][len][payload]             │   ← 서버→클라는 마스킹 안 함
  │ ◀────────────────────────────────────── │
  │  ping (opcode 9) ◀── / ──▶ pong (10)    │   ← 살아 있는지 확인
```

- 핸드셰이크는 평범한 HTTP 요청이라 **쿠키 · Origin 헤더가 실린다** — 인증을 여기서 한다.
- 101 이후는 TCP 위의 프레임 흐름. **TCP는 메시지 경계를 모른다** — 프레임 두 개가 한 덩어리로 오거나 하나가 반으로 쪼개져 올 수 있다.
- 상대가 FIN 없이 사라지면(와이파이 끊김, 노트북 덮음) **TCP는 그걸 모른다.** 그래서 ping/pong이 필요하다.

---

## 3. 밑바닥 구현과 관찰

스파이크 6개, 총 430줄. Node 22, `ws` 8, `socket.io` 4.

### ① 라이브러리 없이 핸드셰이크 · 프레임 파싱 — `01-raw-handshake.mjs`

`node:http`의 `upgrade` 이벤트에서 `Sec-WebSocket-Accept`를 직접 계산하고, 마스크를 XOR로 풀어 텍스트를 꺼냈다.

**첫 실행에서 버그가 났다.** 클라이언트가 `send('안녕')`, `send('hello')`를 연달아 보냈는데 서버는 첫 번째만 받았다. 로그를 보니 `data` 이벤트가 23바이트 한 번 — 프레임 두 개(12 + 11바이트)가 한 덩어리로 왔고, 코드는 첫 프레임만 읽고 나머지를 버렸다.

```js
// 2026-11-09 수정: 버퍼에 쌓고, 프레임 하나가 다 찰 때까지 기다리며, 찼으면 잘라내고 반복
let pending = Buffer.alloc(0);
socket.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= 2) {
    // ... 길이 계산
    if (pending.length < offset + 4 + len) return; // 반쪽 — 다음 data를 기다림
    // ... 마스크 풀기
    pending = pending.subarray(offset + len);
  }
});
```

→ `ws` · Socket.IO가 대신해 주는 첫 번째 것: **프레임 경계 복원.**

### ② 반쯤 열린 연결과 하트비트 — `02-heartbeat.mjs`

클라이언트 소켓의 읽기를 멈춰(`_socket.pause()`) 프로세스가 얼어붙은 상황을 만들었다.

| 조건 | 서버가 끊김을 안 시점 |
| --- | --- |
| 하트비트 없음 | **끝까지 모름.** 3.5초 뒤 테스트가 정리하며 끊을 때까지 `clients.size = 1` |
| 1초 간격 ping, 직전 pong 없으면 종료 | 2.0초 (간격 × 2) |

부수 발견: `terminate()` 뒤에도 `setInterval`이 한 번 더 돌았다. 연결마다 만든 타이머를 `close`에서 지우지 않으면 연결 수만큼 새어 나간다.

→ 대신해 주는 두 번째 것: **ping/pong과 끊김 판정.** Socket.IO 기본값은 `pingInterval 25s + pingTimeout 20s` = **최대 45초 동안 끊긴 걸 모른다.**

### ③ 재연결 · ④ 놓친 메시지 복구 — `03-reconnect-recover.mjs`

서버를 내렸다 올리는 사이 두 메시지가 DB에 저장된 상황. 클라이언트 둘 중 하나만 재연결 시 `join { after: 마지막 id }`를 보낸다.

| 클라이언트 | 받은 메시지 |
| --- | --- |
| `after` 커서 있음 | m1 · **m2 · m3** · m4 |
| 커서 없음 | m1 · m4 — **m2 · m3 영영 유실** |

재연결은 지수 백오프 + 지터(112 → 297 → 466ms)로 서버가 다시 뜨자마자 붙었다. 지터가 없으면 서버 재시작 순간 모든 클라이언트가 같은 박자로 몰린다.

순서 규칙도 확인: **저장이 먼저, 전송이 나중.** 반대면 전송은 됐는데 저장 전에 죽은 메시지는 복구 쿼리에도 없다.

### ⑤ Socket.IO로 다시 — `04-socketio.mjs` · `05-socketio-buffer-recovery.mjs` · `06-buffer-no-timeout.mjs`

| 실험 | 관찰 | 의미 |
| --- | --- | --- |
| 쿠키 없는 연결 | 미들웨어에서 `next(new Error('UNAUTHORIZED'))` → 클라이언트 `connect_error` | 핸드셰이크 인증이 미들웨어 한 곳에 모인다 |
| 같은 사용자 두 탭, `user:{id}` 룸 | 탭 A의 `room:read`를 탭 B가 받음 | 다른 세션 동기화는 룸 하나로 해결 |
| **서버가 명시적으로 끊음** (`disconnectSockets`) | 이유 `io server disconnect`, **자동 재연결 안 함** | 토큰 만료로 서버가 끊으면 클라이언트가 직접 재로그인 후 `connect()`해야 한다 |
| **서버 크래시** 순간 emit (클라이언트는 아직 `connected=true`) | ack 즉시 `socket has been disconnected`, 버퍼에도 없음, **재연결 후 DB에 없음.** 같은 `tempId`로 재시도해야 저장 | 보낸 줄 알았는데 사라지는 창이 실제로 있다 → `tempId` 재시도 필수 |
| `connected=false`일 때 emit, **ack 타임아웃 있음** | `sendBuffer=1` → 타임아웃 시 버퍼에서 제거 → 재연결 후에도 전송 안 됨 | 실패 표시와 실제가 일치 |
| `connected=false`일 때 emit, **타임아웃 없음** | 버퍼에 남았다가 **재연결 후 1.9초 늦게 몰래 전송** | 사용자는 실패로 보는데 상대에겐 도착하는 유령 전송 가능 → 타임아웃 없이 보내지 않는다 |
| 내장 복구 `connectionStateRecovery`, 순단 · 서버 살아 있음 · 사전에 메시지 1개 받음 | `recovered=true`, 순단 중 메시지 받음 | 짧은 순단엔 동작 |
| 내장 복구, 사전에 받은 메시지 없음 | `recovered=false` | "마지막으로 받은 위치"가 없으면 복구 불가 |
| 내장 복구, **서버 재시작** | `recovered=false`, 재연결 전 메시지 **유실** | 복구 저장소가 서버 메모리라 재시작을 못 넘는다 → DB 커서가 여전히 필요 |

### Socket.IO가 지운 코드 · 남긴 일

| 밑바닥에서 직접 쓴 것 | Socket.IO에서 |
| --- | --- |
| 핸드셰이크 · `Sec-WebSocket-Accept` | 사라짐 |
| 프레임 버퍼링 · 마스크 · 경계 복원 | 사라짐 |
| ping/pong · 끊김 판정 · 타이머 정리 | 사라짐 (간격만 설정) |
| 지수 백오프 + 지터 재연결 | 사라짐 (`reconnectionDelay` · `randomizationFactor`) |
| 룸 · 브로드캐스트 · 요청-응답(ack) | 사라짐 |
| WebSocket 막힌 네트워크 대응 | 사라짐 (long-polling 폴백) |
| **놓친 메시지 복구 (서버 재시작 포함)** | **남음** — DB `after` 커서 |
| **보낸 줄 알았던 메시지의 유실 · 중복 방지** | **남음** — `tempId` + 서버 유니크 + 재시도 |
| **서버가 끊었을 때의 재연결** | **남음** — `io server disconnect` 처리 |
| **인증 토큰 만료 검사 (연결 중)** | **남음** — 이벤트마다 `exp` 확인 |

---

## 4. 이 프로젝트에서 쓰는 방식

| 항목 | 값 · 규칙 | 근거 |
| --- | --- | --- |
| 하트비트 | `pingInterval 10s` · `pingTimeout 5s` → 최대 15초 안에 끊김 감지. 기본 45초는 "보낸 줄 아는 창"이 너무 길다 | ② |
| 재연결 | Socket.IO 기본 지수 백오프, `reconnectionDelayMax 5s`, `randomizationFactor 0.5` | ③ |
| 메시지 전송 | **반드시** `socket.timeout(5000).emit('message:send', { roomId, tempId, content }, cb)`. 타임아웃 없는 emit 금지 (lint 규칙으로) | ⑤ 유령 전송 |
| 끊긴 상태의 전송 | `connected=false`면 emit하지 않고 앱 대기열에 넣고 말풍선을 "연결 중…"으로. `connect` 이벤트에서 같은 `tempId`로 순서대로 재전송. 30초 넘으면 "전송 실패" | ⑤ 버퍼 동작에 기대지 않음 |
| 중복 방지 | 서버 `Message (roomId, senderId, tempId)` 유니크. 충돌 시 기존 메시지를 ack로 반환 | ⑤ 크래시 창 |
| 복구 | 재연결 시 열려 있는 방마다 `room:join { roomId, after }` → 서버가 DB에서 누락분 반환. **`connectionStateRecovery`는 켜지 않는다** — 재시작을 못 넘어서 어차피 DB 커서가 필요하고, 복구 경로가 둘이면 중복 처리가 두 배 | ④ · ⑤ |
| 다른 세션 동기화 | 연결 시 `user:{userId}` 룸에 조인. 읽음 · 배지는 이 룸으로 | ⑤ 두 탭 |
| 상품 변경 실시간 반영 | 상태 변경 · 삭제 · 가격 수정 시 그 상품의 모든 방(`room:{id}`)에 `room:product_updated` | 룸 비용 낮음 |
| 서버가 끊을 때 | 토큰 만료 → `error: UNAUTHORIZED` 후 `disconnect()`. 클라이언트는 `disconnect` 이유가 `io server disconnect`면 재로그인 화면으로, 로그인 후 수동 `connect()` | ⑤ |
| 인증 | 프론트(같은 오리진)가 `/api/auth/socket-token`으로 **60초짜리 소켓 전용 토큰**을 받아 `io(SOCKET_URL, { auth: { token } })`. 서버 미들웨어가 검증. 재연결마다 새 토큰(`auth`를 함수로) | ⑤ `handshake.auth` 동작 확인 · [결정 0004 갱신](../decisions/0004-api-proxy-same-origin.md) |
| 저장 순서 | DB 커밋 → emit. 반대 금지 | ③ |
| 폴링 폴백 | Socket.IO 기본(`websocket` → 실패 시 `polling`). 별도 HTTP 폴링 루프는 두지 않음 | ⑤ |

### 검증하지 못한 것

- **브라우저의 쿠키 · `SameSite` 동작.** Node 클라이언트는 쿠키를 헤더로 직접 넣어 실험했다. 실제 브라우저에서 교차 사이트 소켓 핸드셰이크에 쿠키가 실리는지는 확인 못 했고, 그래서 쿠키 대신 단기 토큰을 `auth`로 넘기는 쪽으로 정했다 — 이 방식은 쿠키 정책과 무관하다.
- **모바일 사파리 백그라운드 탭에서 소켓이 언제 끊기는가.** 실기기가 필요하다. 구현 단계 워크스루에서 확인 후 5절에 적는다.
- **Railway의 유휴 연결 타임아웃.** 배포 후 확인.

---

## 5. 겪은 문제와 원인

### 2026-11-09 · 연달아 보낸 두 메시지 중 두 번째가 사라짐 (스파이크 ①)

- 증상: 클라이언트가 `send` 두 번, 서버 로그엔 첫 번째만.
- 가설: 두 번째 `send`가 전송되지 않았다.
- 확인: `data` 이벤트 바이트 수를 찍어 보니 23바이트 한 번 = 두 프레임 합.
- 원인: **TCP는 메시지 경계를 보존하지 않는다.** `data` 한 번 ≠ 프레임 하나.
- 수정: 버퍼 누적 + 프레임 길이만큼 잘라내는 루프.
- 재발 방지: 운영 코드는 `ws` · Socket.IO가 처리. 같은 원리가 HTTP 스트리밍 · 업로드 파싱에도 해당한다는 것을 `image-pipeline.md`에 연결.

### 2026-11-09 · 연결 종료 뒤에도 하트비트 타이머가 돎 (스파이크 ②)

- 증상: `terminate` 로그가 같은 연결에 대해 두 번.
- 원인: 연결마다 만든 `setInterval`을 `close`에서 지우지 않음.
- 재발 방지: 운영 코드는 Socket.IO 내장 하트비트를 쓰고 직접 타이머를 만들지 않는다. 직접 만들 일이 생기면 `close` 핸들러에서 정리하는 것을 리뷰 체크리스트에.

### 2026-11-09 · 서버를 다시 올려도 클라이언트가 붙지 않음 (스파이크 ⑤)

- 증상: 실험 3에서 서버 재기동 후에도 `bob.connected = false`.
- 가설: 재연결 지연이 길다.
- 확인: `disconnect` 이유를 찍으니 `io server disconnect`.
- 원인: 서버가 `disconnectSockets()`로 **명시적으로** 끊으면 Socket.IO는 "의도된 종료"로 보고 자동 재연결하지 않는다. 배포 재시작(프로세스 종료)은 `transport close`라 재연결된다 — 실험이 실제 재시작을 잘못 흉내 냈다.
- 수정: 실험은 TCP를 직접 끊는 방식으로 변경. 설계에는 "서버가 끊는 경우(토큰 만료) 클라이언트가 수동 재연결"을 추가.
- 재발 방지: AC-CH-31에 클라이언트 동작까지 명시.
