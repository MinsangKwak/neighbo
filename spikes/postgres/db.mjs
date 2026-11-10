'use strict';
// 스파이크 공용 — 연결과 스키마 초기화. DATABASE_URL이 없으면 로컬 기본값
import pg from 'pg';

export const url = process.env.DATABASE_URL ?? 'postgresql://spike:spike@127.0.0.1:5432/neighbo_spike';
export const connect = async () => { const c = new pg.Client({ connectionString: url }); await c.connect(); return c; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function reset() {
  const c = await connect();
  await c.query(`
    DROP TABLE IF EXISTS message, chat_room, product;
    CREATE TABLE product (id text PRIMARY KEY, seller_id text NOT NULL, status text NOT NULL DEFAULT 'ON_SALE', buyer_id text, deleted_at timestamptz);
    CREATE TABLE chat_room (id serial PRIMARY KEY, product_id text NOT NULL REFERENCES product(id), buyer_id text NOT NULL, last_seq int NOT NULL DEFAULT 0, UNIQUE (product_id, buyer_id));
    CREATE TABLE message (id serial PRIMARY KEY, room_id int NOT NULL REFERENCES chat_room(id), seq int, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (room_id, seq));
    INSERT INTO product (id, seller_id) VALUES ('p1', 'seller');
  `);
  await c.end();
}
