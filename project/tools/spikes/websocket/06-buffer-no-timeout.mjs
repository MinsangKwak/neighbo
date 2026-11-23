'use strict';
// ⑤-3 ack 타임아웃 없이 끊긴 상태에서 emit하면 — 재연결 후 늦게 전송되는가
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
const PORT = 4006; const got = []; let httpServer, io, tcp;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function start() {
  httpServer = createServer(); tcp = new Set();
  httpServer.on('connection', (s) => { tcp.add(s); s.on('close', () => tcp.delete(s)); });
  io = new Server(httpServer);
  io.on('connection', (s) => s.on('message:send', (m, ack) => { got.push({ ...m, at: Date.now() }); ack?.({ ok: true }); }));
  httpServer.listen(PORT);
}
async function crash() { for (const s of tcp) s.destroy(); await new Promise((r) => io.close(r)); }
start();
const c = ioc(`http://localhost:${PORT}`, { reconnectionDelay: 2000, reconnectionDelayMax: 2000 });
await sleep(300); await crash(); await sleep(100);
const sentAt = Date.now();
c.emit('message:send', { tempId: 'x1', content: 'ack 없이 끊긴 상태에서' });
c.emit('message:send', { tempId: 'x2', content: 'ack 있지만 timeout 없이' }, () => console.log('ack x2 arrived', Date.now() - sentAt, 'ms later'));
console.log('sendBuffer =', c.sendBuffer.length);
start(); await sleep(3000);
console.log('server got:', got.map((g) => `${g.tempId} +${g.at - sentAt}ms`));
c.close(); await crash(); process.exit(0);
