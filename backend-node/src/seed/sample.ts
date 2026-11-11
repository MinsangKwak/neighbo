import { MESSAGE_MAX } from '@neighbo/shared-schema';
import type { Db } from '../db/client.js';
import { toPreview } from '../modules/chat/service.js';
import { thumbnailKey } from '../modules/products/service.js';
import type { ImageStorage } from '../storage/ImageStorage.js';
import { drawSeedAvatar, type SeedImage } from './images.js';
import { upsertSeedProduct, type SeedProduct } from './products.js';

// 샘플 데이터 — 양이 많을 때와 경계 조건을 눈으로 확인한다
// 사용자 10 · 상품 60 · 방 15 · 메시지 300. SEED_SAMPLE=1일 때만 넣는다
// 근거: docs/architecture/backend.md 11절 4. 시드 데이터

const pad = (n: number) => String(n).padStart(2, '0');

const NICKNAMES = ['초록지붕', '망원동토끼', '책읽는고양이', '주말캠퍼', '새벽러너', '빵굽는곰', '느린산책', '연남자전거', '커피한잔', '옥상정원'];

// 로그인할 수 없는 계정이다 — 해시 자리에 bcrypt가 만들 수 없는 값을 둔다
const NO_LOGIN = '!seed-no-login';

export const SAMPLE_USERS = NICKNAMES.map((nickname, i) => ({
  id: `sample_u${pad(i + 1)}`,
  email: `sample${pad(i + 1)}@neighbo.app`,
  nickname,
  // 아바타가 있는 사람과 없는 사람을 섞는다
  avatar: i % 2 === 0,
}));

const ITEMS: [title: string, price: number, description: string][] = [
  ['아이패드 9세대 64GB', 280000, '케이스 끼워서 썼어요. 충전기 포함입니다.'],
  ['로드 자전거 입문용', 350000, '주말에만 탔어요. 키 170~180에 맞아요.'],
  ['이케아 책상 120cm', 40000, '분해해 뒀어요. 나사 다 있습니다.'],
  ['무선 청소기', 90000, '배터리 1년 전에 교체했어요.'],
  ['원두 그라인더', 35000, '핸드드립용으로 썼어요.'],
  ['겨울 패딩 100 사이즈', 45000, '드라이클리닝 해 뒀습니다.'],
  ['어린이 자전거 16인치', 30000, '보조 바퀴 같이 드려요.'],
  ['캠핑 테이블', 28000, '접이식이에요. 가방 포함.'],
  ['전자레인지 20L', 25000, '이사 가면서 정리해요.'],
  ['기계식 키보드', 55000, '갈축입니다. 키캡 여분 있어요.'],
  ['4단 책장', 20000, '흰색이고 튼튼해요.'],
  ['러닝화 270', 38000, '세 번 신었어요. 박스 있음.'],
  ['필름 카메라', 150000, '셔터 잘 떨어지고 노출계 정상이에요.'],
  ['에어프라이어 5L', 32000, '바스켓 코팅 상태 좋아요.'],
  ['요가 매트 10mm', 8000, '거의 안 썼어요.'],
  ['모니터 27인치', 110000, '화소 불량 없어요. 케이블 포함.'],
  ['유아 식탁 의자', 22000, '트레이 분리돼요.'],
  ['전기 자전거 배터리', 130000, '36V 10Ah, 충전기 포함입니다.'],
  ['턴테이블', 95000, '바늘 새것으로 갈았어요.'],
  ['스탠드 조명', 15000, '전구색이에요.'],
  ['등산 배낭 38L', 42000, '레인 커버 있어요.'],
  ['만화책 전권 세트', 60000, '1~42권, 변색 조금 있어요.'],
  ['핸드 블렌더', 18000, '거품기 날 포함.'],
  ['보드게임 5종', 33000, '구성품 다 확인했어요.'],
  ['가습기', 12000, '필터 새것 하나 드려요.'],
  ['사무용 의자', 48000, '메쉬 등받이, 바퀴 부드러워요.'],
  ['전기 히터', 27000, '작년 겨울에 샀어요.'],
  ['통기타', 70000, '줄 새로 갈았어요. 소프트 케이스 포함.'],
  ['빔 프로젝터', 85000, '램프 시간 200시간.'],
  ['스팀 다리미', 14000, '물통 깨끗해요.'],
];

const PREFIXES = ['급처', '거의 새것', '가격 내림', '상태 좋은'];
const HOUR = 60 * 60 * 1000;

function sampleProduct(i: number): SeedProduct {
  const [title, price, description] = ITEMS[i % ITEMS.length] ?? ['물건', 1000, ''];
  const seller = SAMPLE_USERS[i % SAMPLE_USERS.length]?.id ?? 'sample_u01';
  const spec: SeedProduct = {
    id: `sample_p${pad(i + 1)}`,
    sellerId: seller,
    title: i < ITEMS.length ? title : `${PREFIXES[i % PREFIXES.length]} ${title}`,
    price: i % 10 === 9 ? 0 : price,
    description: i % 5 === 2 ? `${description}\n\n직거래만 해요.\n평일 저녁, 주말 오후에 시간 됩니다.` : description,
    status: 'ON_SALE',
    hoursAgo: 3 + i * 5,
    photos: 1 + (i % 4),
  };
  // 경계 조건 — 제목 40자, 가격 상한, 사진 0장 · 10장, 설명 없음 · 2,000자
  if (i === 7) spec.title = '캠핑 테이블과 의자 네 개 그리고 타프까지 한 번에 가져가실 분 구합니다';
  if (i === 11) spec.price = 100_000_000;
  if (i % 9 === 4) spec.photos = 0;
  if (i === 13) spec.photos = 10;
  if (i === 19) spec.description = '';
  if (i === 23) spec.description = '꼼꼼하게 적어 둡니다. '.repeat(160).slice(0, 2000);

  if (i % 12 === 5) {
    spec.status = 'SOLD';
    spec.buyerId = 'demo_buyer';
  } else if (i % 12 === 11) {
    spec.status = 'SOLD';
    spec.buyerId = SAMPLE_USERS[(i + 3) % SAMPLE_USERS.length]?.id ?? 'sample_u01';
  } else if (i % 7 === 3) {
    spec.status = 'RESERVED';
  }
  return spec;
}

export const SAMPLE_PRODUCTS = Array.from({ length: 60 }, (_, i) => sampleProduct(i));

interface SampleRoom {
  id: string;
  productId: string;
  sellerId: string;
  buyerId: string;
  count: number;
  // 마지막 메시지가 지금으로부터 몇 시간 전인지 — 채팅 목록의 순서가 된다
  lastHoursAgo: number;
}

const sellerOf = (index: number) => SAMPLE_PRODUCTS[index]?.sellerId ?? 'sample_u01';

// 로그인해서 볼 수 있게 모든 방의 한쪽은 데모 계정이다
// 데모구매자 ↔ 샘플 판매자 9개, 샘플 구매자 ↔ 데모판매자 6개 (상품 하나에 상대가 여럿인 경우 포함)
export const SAMPLE_ROOMS: SampleRoom[] = [
  ...(
    [
      [54, 120, 0.2],
      [48, 45, 1],
      [30, 12, 3],
      [36, 8, 6],
      [5, 10, 9],
      [17, 6, 14],
      [29, 14, 20],
      [41, 9, 30],
      [53, 11, 50],
    ] as const
  ).map(([index, count, lastHoursAgo]) => ({
    id: `sample_r_p${pad(index + 1)}`,
    productId: `sample_p${pad(index + 1)}`,
    sellerId: sellerOf(index),
    buyerId: 'demo_buyer',
    count,
    lastHoursAgo,
  })),
  ...(
    [
      ['demo_p1', 1, 10, 0.5],
      ['demo_p1', 2, 7, 2],
      ['demo_p1', 3, 13, 4],
      ['demo_p2', 4, 9, 7],
      ['demo_p4', 5, 12, 11],
      ['demo_p3', 6, 14, 16],
    ] as const
  ).map(([productId, user, count, lastHoursAgo]) => ({
    id: `sample_r_${productId}_u${pad(user)}`,
    productId,
    sellerId: 'demo_seller',
    buyerId: `sample_u${pad(user)}`,
    count,
    lastHoursAgo,
  })),
];

const BUYER_LINES = [
  '안녕하세요, 아직 판매 중인가요?',
  '혹시 조금 깎아 주실 수 있을까요?',
  '직거래 어디서 가능하세요?',
  '오늘 저녁 7시쯤 괜찮으세요?',
  '사진 몇 장 더 볼 수 있을까요?',
  '네 좋아요!',
  '사용 기간이 얼마나 되나요?',
  '역 2번 출구 앞에서 뵐게요.',
  '조금 늦을 것 같아요. 10분만요 🙏',
  '잘 받았습니다. 감사합니다!',
  '넵 확인했어요',
  '내일은 어려울까요?',
];

const SELLER_LINES = [
  '네, 판매 중이에요.',
  '이미 많이 내린 가격이라 어려워요 ㅠㅠ',
  '역 근처에서 가능해요.',
  '네 그 시간 괜찮습니다.',
  '방금 찍어서 올렸어요. 확인해 보세요.',
  '1년 정도 썼어요.',
  '도착하면 메시지 주세요.',
  '천천히 오세요~',
  '좋은 거래 감사합니다 😊',
  '내일은 오후 2시 이후에 돼요.',
  '네네',
  '먼저 연락 주신 분이 계셔서 잠시만요.',
];

// 방 안의 간격 — 같은 분 안에 이어진 묶음과 날짜가 바뀌는 지점이 함께 나오게
const GAPS = [20_000, 45_000, 4 * 60_000, 15_000, 2 * HOUR, 30_000, 70_000, 9 * HOUR];
const TURNS = ['B', 'S', 'S', 'B', 'B', 'S'] as const;

function roomMessages(room: SampleRoom, roomIndex: number, now: Date) {
  // 홀수 번째 방은 데모 계정이 읽지 않은 메시지로 끝난다 — 배지와 목록의 읽지 않은 수
  const demoIsBuyer = room.buyerId === 'demo_buyer';
  const unread = roomIndex % 2 === 1 ? 2 + (roomIndex % 3) : 0;

  const times: number[] = new Array<number>(room.count);
  times[room.count - 1] = now.getTime() - room.lastHoursAgo * HOUR;
  for (let k = room.count - 1; k > 0; k -= 1) {
    times[k - 1] = (times[k] ?? 0) - (GAPS[k % GAPS.length] ?? 60_000);
  }

  const messages = Array.from({ length: room.count }, (_, k) => {
    let fromBuyer = TURNS[k % TURNS.length] === 'B';
    // 끝의 unread개는 상대가 보낸 것으로 맞춘다
    if (k >= room.count - unread) fromBuyer = !demoIsBuyer;
    const pool = fromBuyer ? BUYER_LINES : SELLER_LINES;
    let content = pool[(k * 3 + roomIndex) % pool.length] ?? '네';
    // 가장 긴 방에 경계 조건을 넣는다 — 최대 길이, 여러 줄, 결합 이모지, 긴 주소
    if (roomIndex === 0) {
      if (k === 10) content = '길게 적어 봅니다. 상태를 하나씩 말씀드릴게요. '.repeat(40).slice(0, MESSAGE_MAX);
      if (k === 20) content = '정리하면\n1. 토요일 오후 3시\n2. 역 2번 출구\n3. 현금\n\n맞을까요?';
      if (k === 30) content = '가족이랑 같이 갈게요 👨‍👩‍👧';
      if (k === 40) content = 'https://example.com/maps/place/very-long-address-that-should-wrap-inside-the-bubble-without-breaking-layout?query=1234567890';
    }
    return {
      id: `${room.id}_m${k + 1}`,
      roomId: room.id,
      senderId: fromBuyer ? room.buyerId : room.sellerId,
      seq: k + 1,
      content,
      tempId: `seed-${k + 1}`,
      createdAt: new Date(times[k] ?? now.getTime()),
    };
  });
  return { messages, unread };
}

export interface SampleReport {
  // 샘플 이메일 · 닉네임을 다른 계정이 쓰고 있으면 통째로 건너뛴다
  skipped: boolean;
  users: number;
  products: number;
  // 이번 실행에서 새로 만든 수 — 이미 있는 방은 건드리지 않는다
  rooms: number;
  messages: number;
}

// 두 데모 계정과 데모 상품이 있을 때만 부른다
export async function seedSample(db: Db, storage: ImageStorage, images: SeedImage[], now = new Date()): Promise<SampleReport> {
  const report: SampleReport = { skipped: false, users: 0, products: 0, rooms: 0, messages: 0 };
  const ids = SAMPLE_USERS.map((user) => user.id);
  const taken = await db.user.findFirst({
    where: {
      id: { notIn: ids },
      OR: [
        { email: { in: SAMPLE_USERS.map((user) => user.email) } },
        { nicknameLower: { in: SAMPLE_USERS.map((user) => user.nickname.toLowerCase()) } },
      ],
    },
    select: { id: true },
  });
  if (taken !== null) return { ...report, skipped: true };

  for (const [index, user] of SAMPLE_USERS.entries()) {
    let avatarUrl: string | null = null;
    if (user.avatar) {
      const key = `avatars/seed-${user.id}.webp`;
      await storage.put(key, await drawSeedAvatar(index), 'image/webp');
      avatarUrl = storage.url(key);
    }
    const data = {
      email: user.email,
      nickname: user.nickname,
      nicknameLower: user.nickname.toLowerCase(),
      passwordHash: NO_LOGIN,
      avatarUrl,
      deletedAt: null,
    };
    await db.user.upsert({ where: { id: user.id }, create: { id: user.id, ...data }, update: data });
    report.users += 1;
  }

  for (const spec of SAMPLE_PRODUCTS) {
    await upsertSeedProduct(db, storage, spec, images, now);
    report.products += 1;
  }

  for (const [roomIndex, room] of SAMPLE_ROOMS.entries()) {
    // 방은 처음 한 번만 만든다 — 그 뒤에 오간 대화와 읽음 위치를 덮어쓰지 않는다
    const existing = await db.chatRoom.findFirst({
      where: { OR: [{ id: room.id }, { productId: room.productId, buyerId: room.buyerId }] },
      select: { id: true },
    });
    if (existing !== null) continue;

    const { messages, unread } = roomMessages(room, roomIndex, now);
    const last = messages[messages.length - 1];
    const first = messages[0];
    if (last === undefined || first === undefined) continue;
    const demoId = room.buyerId === 'demo_buyer' ? room.buyerId : room.sellerId;
    const member = (userId: string, role: 'SELLER' | 'BUYER') => ({
      roomId: room.id,
      userId,
      role,
      lastReadSeq: userId === demoId ? room.count - unread : room.count,
      lastActivityAt: last.createdAt,
      joinedAt: first.createdAt,
    });

    await db.$transaction(async (tx) => {
      await tx.chatRoom.create({
        data: {
          id: room.id,
          productId: room.productId,
          sellerId: room.sellerId,
          buyerId: room.buyerId,
          lastSeq: room.count,
          lastMessageAt: last.createdAt,
          lastMessagePreview: toPreview(last.content),
          lastMessageSenderId: last.senderId,
          createdAt: first.createdAt,
        },
      });
      await tx.chatRoomMember.createMany({ data: [member(room.sellerId, 'SELLER'), member(room.buyerId, 'BUYER')] });
      await tx.message.createMany({ data: messages });
    });
    report.rooms += 1;
    report.messages += messages.length;
  }
  return report;
}

// 샘플 데이터를 지운다 — SEED_SAMPLE=remove
// 샘플 상품에 일반 사용자가 연 방도 함께 지운다. 상대가 로그인할 수 없는 가짜 계정이라 남길 기록이 아니다
export async function removeSample(db: Db, storage: ImageStorage): Promise<{ users: number; products: number; rooms: number }> {
  const all = db.withDeleted();
  const userIds = SAMPLE_USERS.map((user) => user.id);
  const productIds = SAMPLE_PRODUCTS.map((product) => product.id);
  const rooms = await all.chatRoom.findMany({
    where: { OR: [{ productId: { in: productIds } }, { sellerId: { in: userIds } }, { buyerId: { in: userIds } }] },
    select: { id: true },
  });
  const roomIds = rooms.map((room) => room.id);
  const images = await all.productImage.findMany({ where: { productId: { in: productIds } }, select: { storageKey: true } });

  const [, , removedRooms, , removedProducts, removedUsers] = await all.$transaction([
    all.message.deleteMany({ where: { roomId: { in: roomIds } } }),
    all.chatRoomMember.deleteMany({ where: { roomId: { in: roomIds } } }),
    all.chatRoom.deleteMany({ where: { id: { in: roomIds } } }),
    all.productImage.deleteMany({ where: { productId: { in: productIds } } }),
    all.product.deleteMany({ where: { id: { in: productIds } } }),
    all.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);

  // 파일은 DB 커밋 뒤에 지운다 — 실패해도 고아 파일만 남는다
  const keys = [
    ...images.flatMap((image) => [image.storageKey, thumbnailKey(image.storageKey)]),
    ...SAMPLE_USERS.filter((user) => user.avatar).map((user) => `avatars/seed-${user.id}.webp`),
  ];
  await storage.remove(keys).catch(() => undefined);
  return { users: removedUsers.count, products: removedProducts.count, rooms: removedRooms.count };
}
