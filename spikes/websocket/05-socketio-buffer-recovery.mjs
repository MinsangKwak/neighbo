'use strict';
// ⑤-2 끊긴 상태의 emit 버퍼 · 내장 복구의 조건과 한계
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';

const PORT = 4005;
const db = []; let seq = 0; let httpServer, io, tcp;
const log = (...a) => console.log(new Date().toISOString().slice(17, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start() {
  httpServer = createServer(); tcp = new Set();
  httpServer.on('connection', (s) => { tcp.add(s); s.on('close', () => tcp.delete(s)); });
  io = new Server(httpServer, { pingInterval: 1000, pingTimeout: 1000, connectionStateRecovery: { maxDisconnectionDuration: 10_000 } });
  io.on('connection', (socket) => {
    const user = socket.handshake.auth.user;
    log('[server] connect', user, 'recovered=', socket.recovered);
    socket.on('message:send', ({ tempId, content }, ack) => {
      let m = db.find((x) => x.tempId === tempId); const dup = !!m;
      if (!m) { m = { id: ++seq, tempId, content }; db.push(m); }
      log('[server] message:send', content, dup ? '(duplicate)' : '(saved)');
      ack?.({ ok: true, message: m });
      if (!dup) socket.broadcast.emit('message:new', m);
    });
  });
  httpServer.listen(PORT);
}
async function crash() { for (const s of tcp) s.destroy(); await new Promise((r) => io.close(r)); }
function drop(user) { for (const [, s] of io.of('/').sockets) if (s.handshake.auth.user === user) s.conn.transport.socket._socket.destroy(); }
const client = (user, delay = 200) => ioc(`http://localhost:${PORT}`, { auth: { user }, reconnectionDelay: delay, reconnectionDelayMax: delay });

// 실험 5: 연결이 끊긴 걸 안 뒤(connected=false)에 보낸 메시지
start();
const bob = client('bob', 2500);
await sleep(300);
await crash();
await sleep(100);
log('[exp5] bob.connected =', bob.connected);
bob.timeout(1500).emit('message:send', { tempId: 'b1', content: '끊긴 걸 안 뒤에 보냄' }, (err) =>
  log('[exp5] ack →', err ? `error: ${err.message} (사용자에겐 "전송 실패"로 보임)` : 'ok'));
log('[exp5] sendBuffer length =', bob.sendBuffer.length);
start();
await sleep(3500);
log('[exp5] db after bob reconnected =', db.map((m) => m.content), '← 실패라고 표시했는데 실제로는 저장됐는가');
bob.close(); await crash();

// 실험 6: 내장 복구 — 사전에 메시지를 한 번 받은 상태에서 순단
start();
const carol = client('carol', 300), dave = client('dave');
const got = []; carol.on('message:new', (m) => got.push(m.content));
await sleep(400);
dave.emit('message:send', { tempId: 'd0', content: '순단 전 메시지' });
await sleep(200);
drop('carol');
await sleep(30);
dave.emit('message:send', { tempId: 'd1', content: '순단 중 메시지' });
await sleep(1000);
log('[exp6] carol got:', got);

// 실험 7: 서버 재시작 + carol이 늦게 재연결 (그 사이 메시지)
carol.io.opts.reconnectionDelay = 1500; carol.io.opts.reconnectionDelayMax = 1500;
carol.io.reconnectionDelay(1500); carol.io.reconnectionDelayMax(1500);
await crash(); start();
await sleep(500);
dave.emit('message:send', { tempId: 'd2', content: '재시작 후 carol 재연결 전 메시지' });
await sleep(2000);
log('[exp7] carol got:', got, '← d2가 없으면 내장 복구는 재시작을 못 넘는다');
carol.close(); dave.close(); await crash();
process.exit(0);
