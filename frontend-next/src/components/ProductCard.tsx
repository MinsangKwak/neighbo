import Image from 'next/image';
import Link from 'next/link';
import type { ProductCard as ProductCardData } from '@neighbo/shared-schema';
import { formatCount, formatPrice } from '@/lib/format';
import { RelativeTime } from './RelativeTime';
import { StatusBadge } from './StatusBadge';

interface ProductCardProps {
  product: ProductCardData;
  // 첫 화면에 보이는 사진은 먼저 받는다 [AC-PL-09]
  priority?: boolean;
}

// 카드 전체가 링크 하나다. 안에 버튼을 두지 않는다 [AC-PL-05]
// 읽히는 순서: 제목 → 가격 → 상태 → 시간
export function ProductCard({ product, priority = false }: ProductCardProps) {
  const chats = formatCount(product.chatRoomCount);
  const sold = product.status === 'SOLD';
  return (
    <Link
      href={`/products/${product.id}`}
      className="flex flex-col gap-2 rounded-lg"
    >
      <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface">
        {product.thumbnail === null ? (
          <span aria-hidden="true" className="flex size-full items-center justify-center text-sm text-text-muted">
            사진 없음
          </span>
        ) : (
          <Image
            src={product.thumbnail.url}
            alt=""
            width={product.thumbnail.width}
            height={product.thumbnail.height}
            // 서버가 이미 400px webp로 줄여 놓았다
            unoptimized
            priority={priority}
            // 끝난 거래는 사진만 흐리게 한다 — 카드 전체를 흐리면 글자의 명암비가 4.5:1 아래로 떨어진다
            className={`size-full object-cover ${sold ? 'opacity-60 grayscale' : ''}`}
          />
        )}
      </span>
      <span className={`line-clamp-2 text-base ${sold ? 'text-text-muted' : ''}`}>{product.title}</span>
      <span className="text-base font-semibold">{formatPrice(product.price)}</span>
      <span className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <StatusBadge status={product.status} />
        <RelativeTime iso={product.createdAt} />
        {chats !== null && <span>채팅 {chats}</span>}
      </span>
    </Link>
  );
}
