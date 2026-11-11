import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusBadge } from '@/components/StatusBadge';
import Link from 'next/link';
import { ChatButton } from '@/features/chat';
import { Carousel, FavoriteButton, SellerControls, ShareButton } from '@/features/products';
import { getProduct } from '@/features/products/server';
import { formatPrice } from '@/lib/format';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

// 메타데이터와 본문이 같은 조회 한 번을 나눠 쓴다
const loadProduct = cache(getProduct);

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const data = await loadProduct((await params).id);
  if (data === null) return { title: '찾을 수 없어요' };
  const { product } = data;
  const description = `${formatPrice(product.price)} · ${product.description.slice(0, 80)}`;
  const cover = product.images[0];
  // 링크를 공유했을 때 제목 · 대표 사진 · 가격이 보이게 [AC-PD-21]
  return {
    title: product.title,
    description,
    openGraph: {
      title: product.title,
      description,
      // 큰 카드로 보이므로 400px 썸네일이 아니라 본 사진을 쓴다
      ...(cover === undefined ? {} : { images: [{ url: cover.url, width: cover.width, height: cover.height }] }),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const data = await loadProduct((await params).id);
  // 없음 · 삭제됨은 판매자에게도 404 [AC-PD-19]
  if (data === null) notFound();
  const { product, viewer } = data;
  const isSeller = viewer?.isSeller === true;

  return (
    <>
      <AppHeader action={<ShareButton title={product.title} />} />
      <main className="flex flex-1 flex-col">
        <Carousel images={product.images} title={product.title} />
        <div className="flex flex-col gap-4 px-4 py-5">
          {/* 판매자가 올린 다른 물건을 보러 간다 [AC-UP-04] */}
          <p>
            <Link href={`/users/${product.seller.id}`} className="flex min-h-touch items-center gap-3 text-sm">
              <Avatar url={product.seller.avatarUrl} />
              <span className="flex-1">
                <span className="sr-only">판매자 </span>
                <span className="block font-semibold">{product.seller.nickname}</span>
                <span aria-hidden="true" className="block text-xs text-text-muted">
                  판매자
                </span>
              </span>
              <span aria-hidden="true" className="text-text-muted">
                ›
              </span>
            </Link>
          </p>
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">{product.title}</h1>
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <StatusBadge status={product.status} />
              <RelativeTime iso={product.createdAt} />
              {/* 다른 사람도 관심을 보이는 물건인지 알 수 있게 — 판매자에게는 아래 링크가 같은 수를 보인다 */}
              {!isSeller && product.chatRoomCount > 0 && <span>채팅 {product.chatRoomCount}</span>}
              {/* 구매자는 아래 버튼에서 같은 수를 본다 */}
              {isSeller && product.favoriteCount > 0 && <span>관심 {product.favoriteCount}</span>}
            </p>
          </div>
          {/* 줄바꿈은 보존하고, 입력한 글자를 그대로 보여준다. 주소를 링크로 바꾸지 않는다 [AC-PC-07] */}
          {product.description !== '' && <p className="whitespace-pre-wrap break-words text-base">{product.description}</p>}
        </div>
        {isSeller && <SellerControls product={product} />}
      </main>
      <footer className="sticky bottom-0 flex items-center gap-3 border-t border-divider bg-bg px-4 py-3">
        {!isSeller && (
          <FavoriteButton
            productId={product.id}
            loggedIn={viewer !== null}
            initial={{ on: viewer?.isFavorite === true, count: product.favoriteCount }}
          />
        )}
        <p className="flex-1 text-lg font-semibold">{formatPrice(product.price)}</p>
        {isSeller ? (
          // 이 상품의 방만 모아 본다 [AC-CL-07]
          <Link
            href={`/chats?productId=${product.id}`}
            className="inline-flex min-h-touch items-center text-sm font-semibold underline"
          >
            대화 중인 채팅 {product.chatRoomCount}
          </Link>
        ) : (
          <ChatButton
            productId={product.id}
            loggedIn={viewer !== null}
            existingRoomId={viewer?.existingChatRoomId ?? null}
            sold={product.status === 'SOLD'}
          />
        )}
      </footer>
    </>
  );
}
