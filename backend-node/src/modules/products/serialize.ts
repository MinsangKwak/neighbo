import type { Image, ProductCard, ProductDetail } from '@neighbo/shared-schema';
import type { Product, ProductImage, User } from '../../generated/prisma/client.js';
import { toUserPublic } from '../auth/serialize.js';

const THUMBNAIL_SIZE = 400;

// 썸네일은 긴 변 400px로 줄여 저장한다 — 화면이 자리를 미리 잡을 수 있게 줄인 크기를 돌려준다 [AC-PL-09]
function toThumbnail(image: ProductImage): Image {
  const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(image.width, image.height));
  return {
    url: image.thumbnailUrl,
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}

type CardRow = Product & { images: ProductImage[]; _count: { chatRooms: number } };

export function toProductCard(product: CardRow): ProductCard {
  const cover = product.images[0];
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    status: product.status,
    thumbnail: cover === undefined ? null : toThumbnail(cover),
    chatRoomCount: product._count.chatRooms,
    createdAt: product.createdAt.toISOString(),
  };
}

export type DetailRow = CardRow & { seller: User };

export function toProductDetail(product: DetailRow): ProductDetail {
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    description: product.description,
    status: product.status,
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      thumbnailUrl: image.thumbnailUrl,
      width: image.width,
      height: image.height,
    })),
    seller: toUserPublic(product.seller),
    chatRoomCount: product._count.chatRooms,
    soldAt: product.soldAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
