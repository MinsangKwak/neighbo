'use strict';
// ② 반쯤 열린 연결(half-open): 상대가 FIN 없이 사라지면 TCP는 모른다
// A) 하트비트 없음 → 서버가 끊김을 모름  B) ping/pong 하트비트 → 감지
import { WebSocketServer, WebSocket } from 'ws';

function run(label, heartbeatMs) {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    const port = wss.address().port;
    let timer;
    wss.on('connection', (ws) => {
      const t0 = Date.now();
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('close', () => console.log(`[${label}] server saw close after ${Date.now() - t0}ms`));
      if (heartbeatMs) {
        timer = setInterval(() => {
          // 직전 ping에 pong이 안 왔으면 죽은 연결
          if (!ws.isAlive) { console.log(`[${label}] no pong → terminate at ${Date.now() - t0}ms`); return ws.terminate(); }
          ws.isAlive = false;
          ws.ping();
        }, heartbeatMs);
      }
    });
    const client = new WebSocket(`ws://localhost:${port}`);
    client.on('open', () => {
      // 클라이언트 프로세스가 얼어붙은 상황 흉내: 소켓 읽기를 멈춰 ping을 못 받게 한다
      client._socket.pause();
      console.log(`[${label}] client frozen`);
    });
    setTimeout(() => {
      console.log(`[${label}] clients still registered on server: ${wss.clients.size}`);
      clearInterval(timer); client.terminate(); wss.close(); resolve();
    }, 3500);
  });
}

await run('A no-heartbeat', 0);
await run('B heartbeat-1s', 1000);
