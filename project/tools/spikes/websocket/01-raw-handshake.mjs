'use strict';
// ① 라이브러리 없이 WebSocket 핸드셰이크 + 프레임 파싱 + 에코
// node:http 의 upgrade 이벤트만 사용
import http from 'node:http';
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'; // RFC 6455 고정값

const server = http.createServer((req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('upgrade required');
});

server.on('upgrade', (req, socket) => {
  // 1) 요청 헤더 확인
  console.log('[server] request headers', {
    upgrade: req.headers.upgrade,
    connection: req.headers.connection,
    key: req.headers['sec-websocket-key'],
    version: req.headers['sec-websocket-version'],
    cookie: req.headers.cookie ?? '(none)',
    origin: req.headers.origin ?? '(none)',
  });
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') return socket.destroy();

  // 2) Sec-WebSocket-Accept = base64(sha1(key + GUID))
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '', '',
  ].join('\r\n'));

  // 3) 프레임 파싱 — TCP는 바이트 흐름이라 한 번의 data에 프레임이 여러 개 오거나 반쪽만 올 수 있다
  // 2026-11-09 첫 실행에서 send 두 번이 한 data로 와서 두 번째를 버린 버그 → 버퍼 누적 + 루프로 수정
  let pending = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    console.log('[server] data chunk bytes', chunk.length);
    while (pending.length >= 2) {
      const fin = (pending[0] & 0x80) !== 0;
      const opcode = pending[0] & 0x0f;
      const masked = (pending[1] & 0x80) !== 0; // 클라이언트 → 서버는 반드시 마스킹
      let len = pending[1] & 0x7f;
      let offset = 2;
      if (len === 126) { if (pending.length < 4) return; len = pending.readUInt16BE(2); offset = 4; }
      if (pending.length < offset + 4 + len) return; // 아직 반쪽 — 다음 data를 기다린다
      const mask = pending.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.alloc(len);
      for (let i = 0; i < len; i++) payload[i] = pending[offset + i] ^ mask[i % 4];
      pending = pending.subarray(offset + len);

      if (opcode === 0x8) { console.log('[server] close frame'); socket.end(); return; }
      if (opcode === 0x9) { console.log('[server] ping'); continue; }
      const text = payload.toString('utf8');
      console.log('[server] frame', { fin, opcode, masked, len, text });

      // 4) 서버 → 클라이언트는 마스킹하지 않는다
      const out = Buffer.from(`echo:${text}`);
      socket.write(Buffer.concat([Buffer.from([0x81, out.length]), out]));
    }
  });
});

server.listen(4001, async () => {
  // 클라이언트는 Node 22 내장 WebSocket (브라우저와 같은 API)
  const ws = new WebSocket('ws://localhost:4001');
  ws.addEventListener('open', () => { ws.send('안녕'); ws.send('hello'); });
  let n = 0;
  ws.addEventListener('message', (e) => {
    console.log('[client] got', e.data);
    if (++n === 2) { ws.close(); setTimeout(() => server.close(), 100); }
  });
});
