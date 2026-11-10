# 백엔드 09 · 소켓 서버

[백엔드 설계](README.md) · 앞: [08 관찰 가능성](08-observability.md) · 근거: [WebSocket 기술 노트](../tech/websocket.md) · 클라이언트 쪽: [프론트 07 소켓 클라이언트](../frontend/07-socket-client.md)

**소켓 서버는 "전달 통로"이고 데이터의 출처는 DB입니다.** 서버 메모리에는 누가 어느 방에 조인했는지만 있고, 재시작하면 사라져도 괜찮게 설계합니다 — 클라이언트가 재연결하며 다시 조인하고, 놓친 것은 DB 커서로 받아 갑니다. 이벤트 처리 로직은 HTTP와 같은 서비스 함수를 부르고, 소켓 계층은 인증 · 검증 · 속도 제한 · 전달만 합니다.

## 1. 연결

| 순서 | 처리 | 실패 시 |
| --- | --- | --- |
| 1 | 핸드셰이크 `auth.token` 검증 — 서명 · 만료 · `purpose: socket` | `connect_error UNAUTHORIZED` [AC-CH-31] |
| 2 | 사용자 연결 수 확인 — 5개 넘으면 가장 오래된 연결 끊음 | — [AC-CH-33] |
| 3 | `socket.data = { userId, tokenExp }` | — |
| 4 | `user:{userId}` 룸 조인 — 알림 · 읽음 동기화 대상 | — |
| 5 | 연결 로그 (`connId`, `userId`) | — |

토큰을 쿠키가 아니라 `auth`로 받는 이유와 발급 흐름은 [결정 0004](../decisions/0004-api-proxy-same-origin.md).

## 2. 모든 이벤트 공통 처리

```
수신 ─▶ ① 토큰 만료 확인 ─▶ ② 속도 제한 ─▶ ③ Zod 검증 ─▶ ④ 서비스 호출 ─▶ ⑤ ack ─▶ ⑥ 커밋 후 브로드캐스트
         만료면 error +       초과면           실패면
         disconnect           RATE_LIMITED     INVALID_PAYLOAD (연결 유지)
```

① **연결 중에도 만료를 확인하는 이유**: 핸드셰이크 때 한 번만 보면, 소켓이 살아 있는 한 만료된 토큰으로 계속 보낼 수 있다 [AC-CH-31]. 매 이벤트마다 `socket.data.tokenExp < now`만 비교하면 되므로 비용이 거의 없다. 서버가 끊으면 클라이언트는 자동 재연결하지 않는다(`io server disconnect`, [스파이크 ⑤](../tech/websocket.md)) — 클라이언트가 이 이유를 보고 재로그인으로 보낸다.

④ 서비스는 HTTP 핸들러와 **같은 함수**다. `chatService.sendMessage(user, input)`이 `AppError`를 던지면 소켓 계층이 `{ ok: false, code }`로 바꾼다. 같은 규칙이 두 군데 구현되지 않는다.

## 3. 이벤트별 처리

### 클라이언트 → 서버

| 이벤트 | 페이로드 | 처리 | ack |
| --- | --- | --- | --- |
| `room:join` | `{ roomId, after? }` | ① 참여자 확인 → 아니면 `FORBIDDEN` ② `socket.join('room:' + roomId)` ③ `after`(번호)가 있으면 `seq > after`를 최대 101개 조회. **조인 다음에 조회**해야 그 사이에 커밋된 메시지가 조회 결과나 `message:new` 둘 중 하나로 반드시 온다 | `{ ok, missed: Message[≤100], hasMore }` [AC-CH-05] |
| `room:leave` | `{ roomId }` | `socket.leave` | 없음 |
| `message:send` | `{ roomId, tempId, content }` | 조인한 방인지 확인 → 아니면 `FORBIDDEN` → 정규화 → 트랜잭션 [T7](03-transactions.md) | `{ ok: true, message }` / `{ ok: false, code }` |
| `room:read` | `{ roomId, seq }` | 참여자 확인 → [T8](03-transactions.md) `GREATEST` · `LEAST` 갱신 | 없음 (결과는 브로드캐스트로) |

### 서버 → 클라이언트

| 이벤트 | 대상 | 언제 | 페이로드 |
| --- | --- | --- | --- |
| `message:new` | `room:{id}` (보낸 소켓 제외) + 보낸 사람의 다른 세션(`user:{senderId}`) | T7 커밋 후 | `{ message }` |
| `room:read` | `room:{id}` + `user:{readerId}` | T8 후 | `{ roomId, userId, lastReadSeq }` — 상대는 "읽음" 표시, 내 다른 탭은 배지 [AC-CH-02, 40] |
| `notification:unread` | `user:{receiverId}` | T7 · T8 후 | `{ total, latest? }` — 토스트용 최신 메시지 요약 [AC-NT-01, 05] |
| `room:product_updated` | 그 상품의 모든 `room:{id}` | 상태 변경 · 삭제 · 수정 커밋 후 | `{ roomId, product: { status, price, title, deletedAt } }` [AC-CH-41] |
| `error` | 해당 소켓 | ack 없는 이벤트의 실패 | `{ code, message }` |

### `message:new`를 보낸 사람의 다른 세션에도 보내는 이유

같은 사용자가 휴대폰과 PC에 같은 방을 열어 두면, PC에서 보낸 메시지가 휴대폰에도 보여야 한다 [CH-CC-04]. 보낸 소켓 자체는 ack로 이미 확정했으므로 제외한다 — 같은 말풍선이 두 번 생기지 않게.

## 4. 순서 보장

| 규칙 | 이유 |
| --- | --- |
| DB 커밋 → emit | 롤백된 메시지를 상대가 보지 않게 [AC-CH-44] |
| emit 실패를 재시도하지 않음 | 메시지는 DB에 있다. 상대가 재연결하거나 다음 메시지에서 번호 틈을 보고 `after`로 받는다 |
| `connectionStateRecovery` 끔 | 서버 재시작을 못 넘어 DB 커서가 어차피 필요하고, 복구 경로가 둘이면 중복 처리가 두 배 [결정 0005] |
| 방 안 순서는 `seq` | 방 행 잠금으로 번호 순서 = 커밋 순서. 시각은 트랜잭션 시작 시각이라 순서에 쓰면 복구에서 메시지가 빠진다 [결정 0016, CH-CC-06, 07] |

## 5. HTTP 서비스에서 소켓으로 알리기

상품 상태 변경은 HTTP 요청인데 알림은 소켓으로 가야 한다. 서비스가 Socket.IO를 직접 import하면 HTTP · 테스트 · 배치가 모두 소켓 서버에 묶인다. 그래서 서비스는 **이벤트 발행 인터페이스**만 안다:

```ts
interface Realtime {
  productUpdated(productId: string, snapshot: ProductSnapshot): void;
  messageCreated(message: Message, receiverId: string): void;
  roomRead(roomId: string, userId: string, lastReadSeq: number): void;
}
```

운영에서는 Socket.IO 구현이, 테스트에서는 호출을 기록하는 가짜 구현이 들어간다. 서비스는 트랜잭션이 커밋된 **뒤에** 이 인터페이스를 부른다.

## 6. 설정값

| 설정 | 값 | 이유 |
| --- | --- | --- |
| `pingInterval` · `pingTimeout` | 10s · 5s | 기본값(25s + 20s)은 끊긴 걸 45초 동안 모름 [AC-CH-43, 스파이크 ②] |
| `maxHttpBufferSize` | 80KB | 메시지 1,000자(grapheme)는 코드포인트 최대 16,000 × UTF-8 4바이트 = 64KB. 처음 정한 10KB는 이모지 위주 메시지를 연결째 끊었다 [AC-CH-32, 트러블슈팅 T-05] |
| `transports` | `["websocket", "polling"]` | WebSocket이 막힌 네트워크 폴백 [AC-CH-35] |
| `cors.origin` | HTTP `Origin` 검사와 **같은 허용 함수** (운영 = 도메인 하나, staging = 미리보기 패턴) | 소켓은 프록시를 거치지 않으므로 별도 설정. 목록을 두 군데 따로 두면 한쪽만 고쳐 미리보기에서 채팅만 안 되는 일이 생긴다 |
| 어댑터 | 기본(메모리) | 단일 인스턴스. 둘 이상이면 Redis 어댑터 + 속도 제한 저장소 교체 |

## 7. 테스트

| 테스트 | 방법 |
| --- | --- |
| 비참여자 조인 · 전송 거절 | 클라이언트 2개(참여자 · 비참여자) |
| 메시지 왕복 · 보낸 사람 다른 세션 수신 · 보낸 소켓 미수신 | 같은 사용자 클라이언트 2개 + 상대 1개 |
| 같은 `tempId` 재전송 → 메시지 1개 | ack 두 번의 `message.id` 비교 |
| 재연결 누락분 | 클라이언트 끊고 → HTTP로 메시지 3개 저장 → 재조인 `after` → `missed.length === 3` |
| 동시 저장 순서 | 같은 방에 저장 두 개를 동시에 시작하고 먼저 시작한 쪽을 상품 잠금으로 늦게 커밋시킨 뒤, 먼저 커밋된 쪽의 `seq`로 `after` 조회 → 늦게 커밋된 메시지가 **포함**되는지 (결정 0016의 회귀 테스트) |
| 읽음 상한 | `room:read { seq: 999 }` → `lastReadSeq`가 방의 `lastSeq`에서 멈춤 |
| 토큰 만료 중 이벤트 → `UNAUTHORIZED` + 끊김 이유 `io server disconnect` | 만료 1초 토큰 |
| 서버 재시작 후 복구 | 스파이크 ⑤의 크래시 흉내(TCP 직접 끊기)를 테스트 헬퍼로 |
