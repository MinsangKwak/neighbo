'use strict';
// 메시지 저장과 상품 삭제가 겹칠 때: FOR SHARE로 상품을 읽으면 "삭제 뒤에 저장된 메시지"가 생기지 않는다
import { connect, reset, sleep } from './db.mjs';

const run = async (lock) => {
  await reset();
  const msg = await connect(), del = await connect();
  const room = (await msg.query(`INSERT INTO chat_room (product_id, buyer_id) VALUES ('p1', 'buyer') RETURNING id`)).rows[0].id;
  // 삭제가 먼저 시작해 UPDATE까지 했지만 아직 커밋 전
  await del.query('BEGIN');
  await del.query(`UPDATE product SET deleted_at = now() WHERE id = 'p1' AND deleted_at IS NULL`);
  // 메시지 저장이 상품을 확인한다
  await msg.query('BEGIN');
  let seen = '대기 중';
  const check = msg.query(`SELECT deleted_at FROM product WHERE id = 'p1' ${lock}`).then((r) => { seen = r.rows[0].deleted_at ? '삭제됨' : '살아 있음'; });
  await sleep(200);
  const early = seen;
  await del.query('COMMIT');
  await check;
  let saved = false;
  if (seen === '살아 있음') { await msg.query(`INSERT INTO message (room_id, content) VALUES ($1, '안녕하세요')`, [room]); saved = true; }
  await msg.query('COMMIT');
  console.log(`${lock || '(잠금 없음)'} — 삭제 커밋 전 확인 결과: ${early} · 최종 판단: ${seen} · 메시지 저장: ${saved}`);
  await msg.end(); await del.end();
};
await run('');
await run('FOR SHARE');
