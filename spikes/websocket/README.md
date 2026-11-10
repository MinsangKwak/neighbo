# 스파이크 · WebSocket

**WebSocket 핸드셰이크부터 Socket.IO 재연결·버퍼까지 확인하는 여섯 개의 실험 코드입니다.** 서비스와 분리해 실행하며, 관찰 결과와 적용할 설계는 [WebSocket 기술 노트](../../docs/tech/websocket.md)에 정리했습니다.

```bash
npm install
npm run 01   # 라이브러리 없이 핸드셰이크 · 프레임 파싱
npm run 02   # 반쯤 열린 연결과 하트비트
npm run 03   # 재연결 · after 커서로 놓친 메시지 복구
npm run 04   # Socket.IO — 인증 · 두 탭 · 서버 끊음 vs 크래시 · 내장 복구
npm run 05   # Socket.IO — 끊긴 상태의 emit 버퍼 · 내장 복구의 조건과 한계
npm run 06   # Socket.IO — 타임아웃 없는 emit의 유령 전송
```

Node 22 이상 (01은 내장 `WebSocket` 클라이언트 사용).
