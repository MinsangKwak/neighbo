'use strict';
// T-01 재현: created_at(now())으로 순서와 복구 커서를 잡으면, 먼저 시작해 늦게 커밋된 메시지가 복구 조회에서 빠진다
import { connect, reset, sleep } from './db.mjs';

await reset();
const a = await connect(), b = await connect(), reader = await connect();
const room = (await reader.query(`INSERT INTO chat_room (product_id, buyer_id) VALUES ('p1', 'buyer') RETURNING id`)).rows[0].id;

// now()와 clock_timestamp()의 차이부터
await a.query('BEGIN');
const t1 = (await a.query('SELECT now() n, clock_timestamp() c')).rows[0];
await sleep(200);
const t2 = (await a.query('SELECT now() n, clock_timestamp() c')).rows[0];
await a.query('ROLLBACK');
console.log('① 한 트랜잭션 안에서 200ms 간격 — now() 변화', t2.n - t1.n, 'ms · clock_timestamp() 변화', t2.c - t1.c, 'ms');

// A가 먼저 시작해 INSERT까지 하고 커밋을 미룬다 (실제로는 상품 FOR SHARE 대기 등)
await a.query('BEGIN');
await a.query(`INSERT INTO message (room_id, content) VALUES ($1, 'A — 먼저 시작, 늦게 커밋')`, [room]);
await sleep(100);
// B는 나중에 시작해 먼저 커밋
await b.query('BEGIN');
await b.query(`INSERT INTO message (room_id, content) VALUES ($1, 'B — 나중 시작, 먼저 커밋')`, [room]);
await b.query('COMMIT');

// 클라이언트가 B까지 받았다
const got = await reader.query(`SELECT id, content, created_at FROM message WHERE room_id = $1 ORDER BY created_at, id`, [room]);
console.log('② B 커밋 직후 보이는 메시지:', got.rows.map((r) => r.content[0]).join(', '));
const cursor = got.rows.at(-1);

await sleep(100);
await a.query('COMMIT');

// 재연결 복구: "마지막으로 받은 것 이후"
// 커서 시각은 문자열로 주고받는다 — JS Date는 밀리초까지라 마이크로초가 잘린다 (⑥에서 따로 확인)
const cursorText = (await reader.query(`SELECT created_at::text t FROM message WHERE id = $1`, [cursor.id])).rows[0].t;
const missed = await reader.query(`SELECT content FROM message WHERE room_id = $1 AND (created_at, id) > ($2::timestamptz, $3) ORDER BY created_at, id`, [room, cursorText, cursor.id]);
const all = await reader.query(`SELECT content, created_at FROM message WHERE room_id = $1 ORDER BY created_at, id`, [room]);
console.log('③ A 커밋 뒤 after 커서로 복구 조회 →', missed.rowCount, '건');
console.log('④ 실제 DB에는', all.rowCount, '건:', all.rows.map((r) => `${r.content[0]}@${r.created_at.toISOString().slice(17, 23)}`).join(' → '));
console.log('   A의 시각이 B보다', all.rows.find((r) => r.content[0] === 'B').created_at - all.rows.find((r) => r.content[0] === 'A').created_at, 'ms 앞 — 커밋은 뒤인데 시각은 앞이라 커서 조건에 걸리지 않는다');

// serial id로 커서를 잡으면? — 발급 순서도 커밋 순서가 아니다
const byId = await reader.query(`SELECT id, content FROM message WHERE room_id = $1 ORDER BY id`, [room]);
console.log('⑤ serial id 순서:', byId.rows.map((r) => `${r.content[0]}=${r.id}`).join(', '), '— B(먼저 커밋)의 id가 더 크다. id > B 로 조회해도 A는 빠진다');
// ⑥ 덤: 커서 시각을 JS Date로 넘기면 마이크로초가 잘려 "마지막으로 받은 것"이 다시 나온다
const viaDate = await reader.query(`SELECT content FROM message WHERE room_id = $1 AND (created_at, id) > ($2, $3) ORDER BY created_at, id`, [room, cursor.created_at, cursor.id]);
console.log('⑥ 같은 조회를 JS Date 커서로 →', viaDate.rowCount, '건:', viaDate.rows.map((r) => r.content[0]).join(', ') || '-', '· DB 값', cursorText.slice(17, 32), '· Date 값', cursor.created_at.toISOString().slice(17, 23));
await a.end(); await b.end(); await reader.end();
