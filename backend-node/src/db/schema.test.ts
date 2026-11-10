import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../../test/app.js';

// 진짜 PostgreSQL에서 첫 마이그레이션이 약속한 제약을 지키는지 확인한다
beforeEach(resetDb);

let n = 0;
function makeUser() {
  n += 1;
  return db.user.create({
    data: { email: `u${n}@test.dev`, passwordHash: 'x', nickname: `User${n}`, nicknameLower: `user${n}` },
  });
}

function makeProduct(sellerId: string, data: Record<string, unknown> = {}) {
  n += 1;
  return db.product.create({
    data: { sellerId, title: '원목 의자', price: 10000, idempotencyKey: `key-${n}`, ...data },
  });
}

describe('첫 마이그레이션', () => {
  it('어댑터를 거친 조회가 동작한다 (/readyz가 쓰는 쿼리)', async () => {
    const rows = await db.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(rows).toEqual([{ ok: 1 }]);
  });

  it('이메일과 소문자 닉네임은 유니크다', async () => {
    const user = await makeUser();
    await expect(
      db.user.create({ data: { email: user.email, passwordHash: 'x', nickname: 'Other', nicknameLower: 'other' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      db.user.create({
        data: { email: 'other@test.dev', passwordHash: 'x', nickname: 'X', nicknameLower: user.nicknameLower },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('[AC-CM-51] 가격은 0 이상 1억 이하만 저장된다', async () => {
    const seller = await makeUser();
    await expect(makeProduct(seller.id, { price: 0 })).resolves.toMatchObject({ price: 0, status: 'ON_SALE' });
    await expect(makeProduct(seller.id, { price: 100_000_000 })).resolves.toBeDefined();
    await expect(makeProduct(seller.id, { price: -1 })).rejects.toThrow(/product_price_range/);
    await expect(makeProduct(seller.id, { price: 100_000_001 })).rejects.toThrow(/product_price_range/);
  });

  it('거래완료와 soldAt은 함께 움직이고, 구매자는 거래완료일 때만 있다', async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    await expect(makeProduct(seller.id, { status: 'SOLD' })).rejects.toThrow(/product_sold_at/);
    await expect(makeProduct(seller.id, { soldAt: new Date() })).rejects.toThrow(/product_sold_at/);
    await expect(makeProduct(seller.id, { buyerId: buyer.id })).rejects.toThrow(/product_buyer_only_sold/);
    await expect(
      makeProduct(seller.id, { status: 'SOLD', soldAt: new Date(), buyerId: seller.id }),
    ).rejects.toThrow(/product_buyer_not_seller/);
    await expect(
      makeProduct(seller.id, { status: 'SOLD', soldAt: new Date(), buyerId: buyer.id, soldPrice: 9000 }),
    ).resolves.toMatchObject({ status: 'SOLD' });
  });

  it('같은 판매자의 같은 멱등 키로는 상품이 하나만 만들어진다', async () => {
    const seller = await makeUser();
    await makeProduct(seller.id, { idempotencyKey: 'same' });
    await expect(makeProduct(seller.id, { idempotencyKey: 'same' })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('채팅방은 상품 × 구매자당 하나이고, 판매자는 자기 물건에 방을 만들 수 없다', async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const product = await makeProduct(seller.id);
    const room = { productId: product.id, sellerId: seller.id, buyerId: buyer.id };
    await db.chatRoom.create({ data: room });
    await expect(db.chatRoom.create({ data: room })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.chatRoom.create({ data: { ...room, buyerId: seller.id } })).rejects.toThrow(
      /room_buyer_not_seller/,
    );
  });

  it('[결정 0016] 방 안의 번호와 전송 식별자는 겹칠 수 없고, 빈 메시지는 저장되지 않는다', async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const product = await makeProduct(seller.id);
    const room = await db.chatRoom.create({
      data: { productId: product.id, sellerId: seller.id, buyerId: buyer.id },
    });
    const message = { roomId: room.id, senderId: buyer.id, seq: 1, content: '안녕하세요', tempId: 't1' };
    await db.message.create({ data: message });
    await expect(db.message.create({ data: { ...message, tempId: 't2' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.message.create({ data: { ...message, seq: 2 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.message.create({ data: { ...message, seq: 3, tempId: 't3', content: '' } })).rejects.toThrow(
      /message_length/,
    );
  });
});
