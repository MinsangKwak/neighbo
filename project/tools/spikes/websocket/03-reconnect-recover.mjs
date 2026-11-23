'use strict';
// ③ 지수 백오프 재연결  ④ 끊긴 동안 온 메시지를 after 커서로 복구
// 서버를 내렸다 올리는 사이 상대가 보낸 메시지가 사라지는지 본다
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 4003;
const db = []; // 서버 재시작에도 남는 저장소 흉내 (실제로는 Postgres)
let seq = 0;
let wss;

function startServer() {
  wss = new WebSocketServer({ port: PORT });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'join') {
        // after 이후 메시지를 돌려준다 — 없으면 끊긴 동안의 메시지는 영영 못 받는다
        const missed = msg.after == null ? [] : db.filter((m) => m.id > msg.after);
        ws.send(JSON.stringify({ type: 'joined', missed }));
      }
    });
  });
  console.log('[server] up');
}
function broadcast(content) {
  const m = { id: ++seq, content };
  db.push(m); // 저장이 먼저, 전송은 그 다음 — 순서가 바뀌면 복구에서도 빠진다
  for (const c of wss?.clients ?? []) c.send(JSON.stringify({ type: 'new', message: m }));
  return m;
}

function createClient(name, useCursor) {
  let attempt = 0;
  let lastId = null;
  const got = [];
  const connect = () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on('open', () => {
      attempt = 0;
      ws.send(JSON.stringify({ type: 'join', after: useCursor ? lastId : null }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      const list = msg.type === 'joined' ? msg.missed : [msg.message];
      for (const m of list) {
        if (lastId != null && m.id <= lastId) continue; // 중복 제거
        got.push(m.content); lastId = m.id;
      }
      if (msg.type === 'joined' && msg.missed.length) console.log(`[${name}] recovered`, msg.missed.map((m) => m.content));
    });
    ws.on('close', () => {
      // 지수 백오프 + 지터: 서버가 다시 뜰 때 모든 클라이언트가 동시에 몰리지 않게
      const base = Math.min(200 * 2 ** attempt, 3000);
      const delay = Math.round(base / 2 + Math.random() * base / 2);
      attempt++;
      console.log(`[${name}] closed → retry #${attempt} in ${delay}ms`);
      setTimeout(connect, delay);
    });
    ws.on('error', () => {}); // close가 뒤따른다
  };
  connect();
  return { got };
}

startServer();
const withCursor = createClient('with-cursor', true);
const noCursor = createClient('no-cursor', false);

await sleep(300);
broadcast('m1 (둘 다 연결됨)');
await sleep(100);

console.log('[server] restart — 클라이언트 연결이 모두 끊긴다');
for (const c of wss.clients) c.terminate();
await new Promise((r) => wss.close(r));
broadcast('m2 (서버 내려간 사이 저장됨)'); // 상대가 HTTP 폴백으로 보냈다고 가정
broadcast('m3 (서버 내려간 사이 저장됨)');
await sleep(700);
startServer();

await sleep(2500);
broadcast('m4 (재연결 후)');
await sleep(200);

console.log('\n[result] with-cursor:', withCursor.got);
console.log('[result] no-cursor  :', noCursor.got);
process.exit(0);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
