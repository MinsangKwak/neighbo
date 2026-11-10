'use strict';
// 결정 0016 확인: 방 행을 잠그고 last_seq를 올려 번호를 받으면, 같은 방에서는 번호 순서 = 커밋 순서가 된다
import { connect, reset, sleep } from './db.mjs';

await reset();
const a = await connect(), b = await connect(), reader = await connect();
const room = (await reader.query(`INSERT INTO chat_room (product_id, buyer_id) VALUES ('p1', 'buyer') RETURNING id`)).rows[0].id;

const save = async (c, content) => {
  const seq = (await c.query(`UPDATE chat_room SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq`, [room])).rows[0].last_seq;
  await c.query(`INSERT INTO message (room_id, seq, content) VALUES ($1, $2, $3)`, [room, seq, content]);
  return seq;
};

await a.query('BEGIN');
const seqA = await save(a, 'A — 먼저 시작, 늦게 커밋');
console.log('① A가 번호', seqA, '를 받음 (커밋 전, 방 행 잠금 보유)');

await b.query('BEGIN');
let bSeq = null;
const t0 = performance.now();
const bSave = save(b, 'B — 나중 시작').then((s) => { bSeq = s; });
await sleep(300);
console.log('② 300ms 뒤 B의 번호:', bSeq, '(A가 커밋할 때까지 UPDATE에서 대기)');

// 이 시점에 복구 조회를 해도 아무것도 안 보인다 — 빠뜨릴 "먼저 커밋된 뒤 번호"가 생길 수 없다
console.log('③ 대기 중 조회되는 메시지', (await reader.query('SELECT count(*)::int n FROM message')).rows[0].n, '건');

await a.query('COMMIT');
await bSave;
console.log('④ A 커밋 → B가 번호', bSeq, '를 받음 · 대기', Math.round(performance.now() - t0), 'ms');
await b.query('COMMIT');

const after = await reader.query(`SELECT seq, content FROM message WHERE room_id = $1 AND seq > $2 ORDER BY seq`, [room, 0]);
console.log('⑤ seq > 0 조회:', after.rows.map((r) => `${r.seq}:${r.content[0]}`).join(', '));

// 롤백하면 번호도 함께 돌아가 구멍이 생기지 않는다
await a.query('BEGIN');
const rolled = await save(a, '롤백될 메시지');
await a.query('ROLLBACK');
const next = await save(reader, 'C');
console.log('⑥ 롤백된 번호', rolled, '· 다음 메시지가 받은 번호', next, '(같으면 구멍 없음)');

// 다른 방끼리는 서로 기다리지 않는다
const room2 = (await reader.query(`INSERT INTO chat_room (product_id, buyer_id) VALUES ('p1', 'buyer2') RETURNING id`)).rows[0].id;
await a.query('BEGIN');
await a.query(`UPDATE chat_room SET last_seq = last_seq + 1 WHERE id = $1`, [room]);
const t1 = performance.now();
await b.query(`UPDATE chat_room SET last_seq = last_seq + 1 WHERE id = $1`, [room2]);
console.log('⑦ 방 1이 잠긴 동안 방 2 저장', Math.round(performance.now() - t1), 'ms — 대기 없음');
await a.query('ROLLBACK');

// 읽음: GREATEST · LEAST
const read = async (cur, seq) => (await reader.query(`SELECT GREATEST($1::int, LEAST($2::int, last_seq)) v FROM chat_room WHERE id = $3`, [cur, seq, room])).rows[0].v;
console.log('⑧ 읽음 위치 — 현재 2에 1이 늦게 도착 →', await read(2, 1), '· 현재 1에 999 →', await read(1, 999), `(방의 last_seq에서 멈춤)`);
await a.end(); await b.end(); await reader.end();
