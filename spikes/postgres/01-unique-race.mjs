'use strict';
// 같은 구매자가 [채팅하기]를 동시에 두 번 — "먼저 조회하고 없으면 생성"은 둘 다 생성으로 간다. 유니크 제약이 하나만 남기는지 재현
import { connect, reset, sleep } from './db.mjs';

await reset();
const a = await connect(), b = await connect();

// 두 요청 모두 "방이 있나?"를 먼저 본다 — 둘 다 없다고 답을 받는다
const seen = await Promise.all([a, b].map((c) => c.query(`SELECT id FROM chat_room WHERE product_id = 'p1' AND buyer_id = 'buyer'`)));
console.log('① 조회 결과 — A', seen[0].rowCount, '행 · B', seen[1].rowCount, '행 (둘 다 "없음")');

await a.query('BEGIN'); await b.query('BEGIN');
await a.query(`INSERT INTO chat_room (product_id, buyer_id) VALUES ('p1', 'buyer')`);
console.log('② A INSERT 성공 (아직 커밋 전)');

let bState = '대기 중';
const bInsert = b.query(`INSERT INTO chat_room (product_id, buyer_id) VALUES ('p1', 'buyer')`)
  .then(() => { bState = '성공'; }, (e) => { bState = `실패 ${e.code} ${e.constraint}`; });
await sleep(300);
console.log('③ B INSERT — 300ms 뒤 상태:', bState, '(A의 커밋을 기다린다)');

await a.query('COMMIT');
await bInsert;
console.log('④ A 커밋 직후 B:', bState);
await b.query('ROLLBACK');

// 실패한 쪽은 기존 방을 다시 읽어 돌려준다 — 사용자에겐 둘 다 "성공"
const room = await b.query(`SELECT id FROM chat_room WHERE product_id = 'p1' AND buyer_id = 'buyer'`);
console.log('⑤ B가 다시 조회한 방 id', room.rows[0].id, '· 전체 방 수', (await b.query('SELECT count(*)::int n FROM chat_room')).rows[0].n);

// 같은 일을 한 문장으로 — ON CONFLICT는 트랜잭션을 깨뜨리지 않는다
await b.query('BEGIN');
const up = await b.query(`INSERT INTO chat_room (product_id, buyer_id) VALUES ('p1', 'buyer') ON CONFLICT (product_id, buyer_id) DO NOTHING RETURNING id`);
const still = await b.query('SELECT 1 ok');
await b.query('COMMIT');
console.log('⑥ ON CONFLICT DO NOTHING — 반환 행', up.rowCount, '· 같은 트랜잭션에서 다음 쿼리 가능', still.rows[0].ok === 1);

// 유니크 위반(23505)을 잡은 뒤 같은 트랜잭션을 계속 쓰면?
await b.query('BEGIN');
await b.query(`INSERT INTO chat_room (product_id, buyer_id) VALUES ('p1', 'buyer')`).catch(() => {});
const after = await b.query('SELECT 1 ok').then(() => '가능', (e) => `불가 ${e.code}`);
await b.query('ROLLBACK');
console.log('⑦ 23505를 잡은 뒤 같은 트랜잭션에서 다음 쿼리:', after);
await a.end(); await b.end();
