import {
  nicknameKey,
  type ChangePasswordInput,
  type MeCounts,
  type MyProductsQuery,
  type PurchasesQuery,
  type UpdateMeInput,
} from '@neighbo/shared-schema';
import type { Db } from '../../db/client.js';
import { uniqueViolationIndex } from '../../db/errors.js';
import { AppError } from '../../errors/AppError.js';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { decodeCursor, encodeCursor } from '../../lib/cursor.js';
import { isCommonPassword, type PasswordHasher } from '../../lib/password.js';
import type { Realtime } from '../../realtime/Realtime.js';
import type { ImageStorage } from '../../storage/ImageStorage.js';

// 업로드는 24시간 안에 연결해야 한다 — 상품 사진과 같은 규칙
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const cover = { images: { orderBy: { order: 'asc' }, take: 1 } } satisfies Prisma.ProductInclude;

export function createMeService(db: Db, hasher: PasswordHasher, storage: ImageStorage, realtime: Realtime) {
  // 비밀번호가 공개된 계정은 누구나 로그인한다 — 한 사람이 바꾸면 다음 사람이 못 쓴다 (T-11)
  function assertNotDemo(user: User): void {
    if (user.isDemo) throw new AppError('DEMO_RESTRICTED');
  }

  // 저장소 주소에서 키를 되찾는다. 이 저장소의 주소가 아니면 null
  function keyOf(url: string | null): string | null {
    const base = storage.url('');
    return url !== null && url.startsWith(base) ? url.slice(base.length) : null;
  }

  return {
    // 탭에 보일 개수 — 삭제된 상품은 판매 쪽에서 빠지고 구매 내역에는 남는다 [AC-MP-03, 04, 11]
    async counts(userId: string): Promise<MeCounts> {
      const [selling, purchased] = await Promise.all([
        db.product.groupBy({ by: ['status'], where: { sellerId: userId, deletedAt: null }, _count: { _all: true } }),
        db.withDeleted().product.count({ where: { buyerId: userId, status: 'SOLD' } }),
      ]);
      const of = (status: string) => selling.find((row) => row.status === status)?._count._all ?? 0;
      return { onSale: of('ON_SALE'), reserved: of('RESERVED'), sold: of('SOLD'), purchased };
    },

    // T10 · T11 — 닉네임과 아바타만 바꾼다 [AC-MP-06, 08, 12]
    async update(user: User, input: UpdateMeInput): Promise<User> {
      assertNotDemo(user);
      if (input.nickname === undefined && input.avatarUploadId === undefined) return user;

      let updated: User;
      try {
        updated = await db.$transaction(async (tx) => {
          let avatarUrl: string | null | undefined;
          if (input.avatarUploadId === null) avatarUrl = null;
          if (typeof input.avatarUploadId === 'string') {
            const upload = await tx.upload.findUnique({ where: { id: input.avatarUploadId } });
            if (
              upload === null ||
              upload.kind !== 'AVATAR' ||
              upload.createdAt.getTime() < Date.now() - UPLOAD_TTL_MS
            ) {
              throw new AppError('VALIDATION_FAILED', { avatarUploadId: '사진을 다시 올려 주세요' });
            }
            if (upload.uploaderId !== user.id) throw new AppError('FORBIDDEN');
            // 읽은 것만으로는 내 것이 아니다 — 임시 행을 지우는 데 성공한 요청만 파일을 넘겨받는다 (I-09)
            const { count } = await tx.upload.deleteMany({ where: { id: upload.id, uploaderId: user.id } });
            if (count !== 1) throw new AppError('VALIDATION_FAILED', { avatarUploadId: '사진을 다시 올려 주세요' });
            avatarUrl = upload.url;
          }
          return tx.user.update({
            where: { id: user.id },
            data: {
              // 대소문자만 바꾸는 것도 된다 — 중복 판단 값은 그대로라 제약에 걸리지 않는다
              ...(input.nickname === undefined
                ? {}
                : { nickname: input.nickname, nicknameLower: nicknameKey(input.nickname) }),
              ...(avatarUrl === undefined ? {} : { avatarUrl }),
            },
          });
        });
      } catch (err) {
        if (uniqueViolationIndex(err) === 'User_nicknameLower_key') {
          throw new AppError('NICKNAME_TAKEN', { nickname: '이미 사용 중인 닉네임이에요' });
        }
        throw err;
      }

      // 이전 아바타 파일은 커밋 뒤에 지운다. 실패하면 정리 배치의 몫이다
      const previous = keyOf(user.avatarUrl);
      if (previous !== null && updated.avatarUrl !== user.avatarUrl) {
        await storage.remove([previous]).catch(() => undefined);
      }
      return updated;
    },

    // T9 — 해시는 트랜잭션 밖에서. 성공하면 다른 세션이 전부 무효가 된다 [AC-MP-09]
    async changePassword(user: User, input: ChangePasswordInput): Promise<User> {
      assertNotDemo(user);
      if (!(await hasher.verify(input.currentPassword, user.passwordHash))) {
        throw new AppError('WRONG_PASSWORD', { currentPassword: '비밀번호가 맞지 않아요' });
      }
      const lowered = input.newPassword.toLowerCase();
      if (lowered === user.email || lowered === user.nicknameLower) {
        throw new AppError('VALIDATION_FAILED', { newPassword: '이메일이나 닉네임과 같은 비밀번호는 쓸 수 없어요' });
      }
      if (isCommonPassword(input.newPassword)) {
        throw new AppError('VALIDATION_FAILED', { newPassword: '너무 흔한 비밀번호예요. 다른 비밀번호를 써 주세요' });
      }
      const passwordHash = await hasher.hash(input.newPassword);
      // 읽었던 버전일 때만 바꾼다 — 동시에 두 번 바꾸면 하나만 성공한다
      const { count } = await db.user.updateMany({
        where: { id: user.id, tokenVersion: user.tokenVersion },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      if (count === 0) throw new AppError('UNAUTHORIZED');
      // 열려 있는 실시간 연결도 옛 세션의 것이다
      realtime.userRevoked({ userId: user.id });
      return { ...user, passwordHash, tokenVersion: user.tokenVersion + 1 };
    },

    // 판매 탭 — 삭제된 상품 제외(자동 주입), 최신순 [AC-MP-02, 03]
    async products(userId: string, query: MyProductsQuery) {
      const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
      const rows = await db.product.findMany({
        where: {
          sellerId: userId,
          status: query.status,
          ...(cursor === null
            ? {}
            : { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        include: { ...cover, buyer: true, _count: { select: { chatRooms: true } } },
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor({ at: last.createdAt, id: last.id }) : null,
      };
    },

    // 구매 내역 — 거래 사실은 상대가 글을 지워도 남는다 [AC-MP-04]
    async purchases(userId: string, query: PurchasesQuery) {
      const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
      const rows = await db.withDeleted().product.findMany({
        where: {
          buyerId: userId,
          status: 'SOLD',
          ...(cursor === null
            ? {}
            : { OR: [{ soldAt: { lt: cursor.at } }, { soldAt: cursor.at, id: { lt: cursor.id } }] }),
        },
        orderBy: [{ soldAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        include: { ...cover, seller: true },
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > query.limit && last !== undefined && last.soldAt !== null
            ? encodeCursor({ at: last.soldAt, id: last.id })
            : null,
      };
    },
  };
}

export type MeService = ReturnType<typeof createMeService>;
