'use strict';
// ⑤ Socket.IO로 같은 시나리오를 다시 — 무엇을 대신해 주고, 무엇은 여전히 우리가 해야 하나
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';

const PORT = 4004;
const db = []; let seq = 0;
let httpServer, io;
let tcp = new Set(); // 서버의 모든 TCP 소켓 — 프로세스 크래시 흉내용
const log = (...a) => console.log(new Date().toISOString().slice(17, 23), ...a);

function startServer({ recovery }) {
  httpServer = createServer();
  tcp = new Set();
  httpServer.on('connection', (s) => { tcp.add(s); s.on('close', () => tcp.delete(s)); });
  io = new Server(httpServer, {
    pingInterval: 1000, pingTimeout: 1000, // 기본 25s/20s — 실험용으로 줄임
    connectionStateRecovery: recovery ? { maxDisconnectionDuration: 10_000 } : undefined,
  });
  io.use((socket, next) => {
    // 핸드셰이크에서 쿠키를 읽어 인증 — 브라우저는 같은 오리진이면 자동으로 쿠키를 싣는다
    const cookie = socket.handshake.headers.cookie ?? '';
    const user = /token=(\w+)/.exec(cookie)?.[1];
    if (!user) return next(new Error('UNAUTHORIZED'));
    socket.data.user = user; next();
  });
  io.on('connection', (socket) => {
    log('[server] connect', socket.data.user, 'recovered=', socket.recovered);
    socket.join(`user:${socket.data.user}`); // 같은 사용자의 모든 탭 · 기기
    socket.on('message:send', ({ tempId, content }, ack) => {
      // tempId로 중복 저장 방지 (실제로는 (roomId, senderId, tempId) 유니크)
      let m = db.find((x) => x.tempId === tempId);
      const dup = !!m;
      if (!m) { m = { id: ++seq, tempId, content }; db.push(m); }
      log('[server] message:send', content, dup ? '(duplicate → 기존 반환)' : '(saved)');
      ack?.({ ok: true, message: m });
      if (!dup) socket.broadcast.emit('message:new', m);
    });
    socket.on('room:read', () => {
      io.to(`user:${socket.data.user}`).emit('room:read', { by: socket.id }); // 내 다른 세션까지
    });
  });
  httpServer.listen(PORT);
}
async function stopServer({ crash = true } = {}) {
  // crash: disconnect 패킷 없이 TCP만 끊는다 = 배포 재시작 · 프로세스 종료와 같음
  // crash=false: 서버가 명시적으로 끊음 (토큰 만료 등)
  if (crash) for (const s of tcp) s.destroy(); else io.disconnectSockets(true);
  await new Promise((r) => io.close(r));
}
function dropTcpOf(user) {
  // 서버는 살아 있고 한 클라이언트의 TCP만 끊김 = 모바일 네트워크 순단
  for (const [, s] of io.of('/').sockets) if (s.data.user === user) s.conn.transport.socket._socket.destroy();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = (user, opts = {}) => ioc(`http://localhost:${PORT}`, {
  extraHeaders: user ? { cookie: `token=${user}` } : {},
  reconnectionDelay: 200, reconnectionDelayMax: 1000, ...opts,
});

// ── 실험 1: 인증 없는 연결
startServer({ recovery: false });
const anon = client(null, { reconnection: false });
anon.on('connect_error', (e) => log('[exp1] anon connect_error:', e.message));
await sleep(300); anon.close();

// ── 실험 2: 같은 사용자 두 탭 → room:read가 두 탭 모두에
const tabA = client('alice'), tabB = client('alice');
tabB.on('room:read', (p) => log('[exp2] tabB received room:read from', p.by === tabA.id ? 'tabA' : 'self'));
await sleep(300);
tabA.emit('room:read');
await sleep(200);
tabA.close(); tabB.close();

// ── 실험 3-0: 서버가 명시적으로 끊으면 클라이언트가 재연결하나
const eve = client('eve');
eve.on('disconnect', (reason) => log('[exp3-0] eve disconnect reason =', reason));
await sleep(300);
await stopServer({ crash: false });
startServer({ recovery: false });
await sleep(1200);
log('[exp3-0] eve.connected after server back =', eve.connected);
eve.close();

// ── 실험 3: 끊긴 동안 emit → 어떻게 되나 + ack 타임아웃
const bob = client('bob');
bob.on('disconnect', (reason) => log('[exp3] bob disconnect reason =', reason));
await sleep(300);
log('[exp3] server crash');
await stopServer();
bob.timeout(1500).emit('message:send', { tempId: 't1', content: '끊긴 동안 보냄' }, (err, res) => {
  log('[exp3] ack callback →', err ? `timeout error: ${err.message}` : `ok id=${res.message.id}`);
});
log('[exp3] emitted while disconnected; bob.connected =', bob.connected, '/ sendBuffer =', bob.sendBuffer.length);
await sleep(2500);
startServer({ recovery: false });
await sleep(1500);
log('[exp3] after reconnect, db =', db.map((m) => m.content));
// 사용자가 "실패"를 보고 재시도 → 같은 tempId
bob.timeout(1500).emit('message:send', { tempId: 't1', content: '끊긴 동안 보냄' }, (err, res) => log('[exp3] retry ack →', err ? err.message : `ok id=${res.message.id}`));
await sleep(300);
bob.close();
await stopServer();

// ── 실험 4: connectionStateRecovery — 짧은 끊김 vs 서버 재시작
startServer({ recovery: true });
const carol = client('carol'), dave = client('dave');
const carolGot = [];
carol.on('message:new', (m) => carolGot.push(m.content));
await sleep(400);
log('[exp4a] carol transport drop (서버는 살아 있음)');
carol.on('disconnect', (reason) => log('[exp4] carol disconnect reason =', reason));
dropTcpOf('carol');
await sleep(50);
dave.emit('message:send', { tempId: 'd1', content: '순단 중 메시지' });
await sleep(1500);
log('[exp4a] carol got:', carolGot);

log('[exp4b] server restart');
await stopServer();
startServer({ recovery: true });
await sleep(300);
dave.emit('message:send', { tempId: 'd2', content: '재시작 직후 메시지 (carol 재연결 전)' });
await sleep(1500);
log('[exp4b] carol got:', carolGot, '← 재시작 전후로 빠진 게 있는지');
carol.close(); dave.close();
await stopServer();
process.exit(0);
