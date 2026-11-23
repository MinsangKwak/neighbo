'use strict';
// 상태 변경 경합: 판매자가 두 탭에서 동시에 "거래완료 + 구매자 지정" — 조건부 UPDATE는 한쪽만 1행을 바꾼다
import { connect, reset, sleep } from './db.mjs';

await reset();
const a = await connect(), b = await connect();

// 잘못된 방식: 읽고 → 판단하고 → 무조건 쓴다
await a.query('BEGIN'); await b.query('BEGIN');
const ra = (await a.query(`SELECT status FROM product WHERE id = 'p1'`)).rows[0].status;
const rb = (await b.query(`SELECT status FROM product WHERE id = 'p1'`)).rows[0].status;
console.log('① 읽고 쓰기 — A가 본 상태', ra, '· B가 본 상태', rb, '(둘 다 전이 가능하다고 판단)');
await a.query(`UPDATE product SET status = 'SOLD', buyer_id = 'buyer_A' WHERE id = 'p1'`);
const bw = b.query(`UPDATE product SET status = 'SOLD', buyer_id = 'buyer_B' WHERE id = 'p1'`);
await a.query('COMMIT'); await bw; await b.query('COMMIT');
console.log('   결과 구매자:', (await a.query(`SELECT buyer_id FROM product WHERE id = 'p1'`)).rows[0].buyer_id, '— A에게 "성공"이라 답했는데 B가 덮어썼다');

// 조건부 UPDATE: 이전 상태를 WHERE에 넣는다
await reset();
await a.query('BEGIN'); await b.query('BEGIN');
const ua = await a.query(`UPDATE product SET status = 'SOLD', buyer_id = 'buyer_A' WHERE id = 'p1' AND status IN ('ON_SALE', 'RESERVED') AND deleted_at IS NULL`);
let ubCount = null;
const ub = b.query(`UPDATE product SET status = 'SOLD', buyer_id = 'buyer_B' WHERE id = 'p1' AND status IN ('ON_SALE', 'RESERVED') AND deleted_at IS NULL`).then((r) => { ubCount = r.rowCount; });
await sleep(200);
console.log('② 조건부 UPDATE — A', ua.rowCount, '행 · B는 200ms 뒤', ubCount === null ? '대기 중' : ubCount);
await a.query('COMMIT'); await ub; await b.query('COMMIT');
console.log('   A 커밋 뒤 B', ubCount, '행 — READ COMMITTED는 잠금이 풀리면 WHERE를 새 값으로 다시 평가한다');
console.log('   결과 구매자:', (await a.query(`SELECT buyer_id FROM product WHERE id = 'p1'`)).rows[0].buyer_id);

// 0행일 때 원인을 구분하려면 다시 읽는다
const why = (await b.query(`SELECT status, seller_id, deleted_at FROM product WHERE id = 'p1'`)).rows[0];
console.log('③ 0행의 원인 구분 — 다시 읽은 값', JSON.stringify(why), '→ 409 INVALID_TRANSITION');
await a.end(); await b.end();
