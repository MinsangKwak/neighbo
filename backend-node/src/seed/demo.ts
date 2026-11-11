import { normalizePassword } from '@neighbo/shared-schema';
import type { Db } from '../db/client.js';
import type { PasswordHasher } from '../lib/password.js';
import type { ImageStorage } from '../storage/ImageStorage.js';
import type { SeedImage } from './images.js';
import { upsertSeedProduct, type SeedProduct } from './products.js';

// 데모 계정 — 고정 ID로 upsert해서 몇 번을 돌려도 같은 결과가 된다
// 근거: docs/architecture/backend.md 11절 4. 시드 데이터 [AC-LI-19]
export const DEMO_ACCOUNTS = [
  { id: 'demo_seller', email: 'demo@neighbo.app', nickname: '데모판매자' },
  { id: 'demo_buyer', email: 'demo2@neighbo.app', nickname: '데모구매자' },
] as const;

export interface SeedReport {
  seeded: string[];
  // 같은 이메일 · 닉네임을 다른 계정이 이미 쓰고 있어 만들지 못한 데모 계정
  conflicts: string[];
}

export async function seedDemoAccounts(db: Db, hasher: PasswordHasher, rawPassword: string): Promise<SeedReport> {
  // 로그인이 비밀번호를 정규화(제로폭 제거 · NFC · 앞뒤 공백 제거)한 뒤 비교하므로 같은 값으로 해시한다
  const password = normalizePassword(rawPassword, { trim: true });
  const report: SeedReport = { seeded: [], conflicts: [] };

  for (const account of DEMO_ACCOUNTS) {
    const nicknameLower = account.nickname.toLowerCase();
    // 고정 ID가 없다고 이메일 · 닉네임이 비어 있는 것은 아니다 — 먼저 가입한 계정이 쓰고 있을 수 있다
    // 그 계정을 건드리지 않고 이 데모 계정만 건너뛴다. 배포를 멈추지 않는다
    const taken = await db.user.findFirst({
      where: { id: { not: account.id }, OR: [{ email: account.email }, { nicknameLower }] },
      select: { id: true },
    });
    if (taken !== null) {
      report.conflicts.push(account.email);
      continue;
    }

    const existing = await db.user.findUnique({ where: { id: account.id } });
    // 비밀번호가 그대로면 해시를 다시 만들지 않는다 — 배포할 때마다 행이 바뀌지 않게
    const passwordHash =
      existing !== null && (await hasher.verify(password, existing.passwordHash))
        ? existing.passwordHash
        : await hasher.hash(password);
    const data = {
      email: account.email,
      nickname: account.nickname,
      nicknameLower,
      passwordHash,
      isDemo: true,
      deletedAt: null,
    };
    // tokenVersion은 건드리지 않는다 — 시드가 접속 중인 사람을 로그아웃시키지 않게
    await db.user.upsert({ where: { id: account.id }, create: { id: account.id, ...data }, update: data });
    report.seeded.push(account.email);
  }
  return report;
}

// 데모 판매자의 상품 6개 — 판매중 3 · 예약중 1 · 거래완료 1(구매자 = 데모구매자) · 나눔 1
// 목록 · 상세 · 구매 내역이 비어 있지 않게 한다
export const DEMO_PRODUCTS: SeedProduct[] = [
  {
    id: 'demo_p1',
    sellerId: 'demo_seller',
    title: '원목 2인용 식탁 세트',
    price: 85000,
    description: '2년 쓴 원목 식탁이에요. 의자 두 개 포함입니다.\n상판에 잔흠집이 조금 있어요. 직접 가져가셔야 해요.',
    status: 'ON_SALE',
    hoursAgo: 20,
    photos: 3,
  },
  {
    id: 'demo_p2',
    sellerId: 'demo_seller',
    title: '접이식 자전거 20인치',
    price: 120000,
    description: '출퇴근용으로 탔어요. 브레이크와 타이어는 지난달에 갈았습니다.',
    status: 'ON_SALE',
    hoursAgo: 33,
    photos: 2,
  },
  {
    id: 'demo_p3',
    sellerId: 'demo_seller',
    title: '블루투스 스피커',
    price: 30000,
    description: '충전 케이블 같이 드려요. 소리 잘 나옵니다.',
    status: 'ON_SALE',
    hoursAgo: 52,
    photos: 1,
  },
  {
    id: 'demo_p4',
    sellerId: 'demo_seller',
    title: '캠핑 의자 2개',
    price: 25000,
    description: '두 번 썼어요. 수납 가방 포함입니다.',
    status: 'RESERVED',
    hoursAgo: 75,
    photos: 2,
  },
  {
    id: 'demo_p5',
    sellerId: 'demo_seller',
    title: '전기 주전자 1.7L',
    price: 12000,
    description: '이사하면서 정리합니다. 물때 없이 깨끗해요.',
    status: 'SOLD',
    buyerId: 'demo_buyer',
    hoursAgo: 98,
    photos: 1,
  },
  {
    id: 'demo_p6',
    sellerId: 'demo_seller',
    title: '화분 받침 나눔해요',
    price: 0,
    description: '크기별로 다섯 개 있어요. 필요하신 분 가져가세요.',
    status: 'ON_SALE',
    hoursAgo: 140,
    photos: 1,
  },
];

// 두 데모 계정이 모두 있을 때만 부른다 — 상품의 판매자 · 구매자가 그 둘이다
export async function seedDemoProducts(db: Db, storage: ImageStorage, images: SeedImage[], now = new Date()): Promise<number> {
  for (const spec of DEMO_PRODUCTS) await upsertSeedProduct(db, storage, spec, images, now);
  return DEMO_PRODUCTS.length;
}
