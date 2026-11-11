import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusBadge } from '@/components/StatusBadge';
import Link from 'next/link';
import { ChatButton } from '@/features/chat';
import { Carousel, SellerControls, ShareButton } from '@/features/products';
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
      ...(cover === undefined ? {} : { images: [{ url: cover.thumbnailUrl }] }),
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
          <p className="text-sm">
            <span className="text-text-muted">판매자 </span>
            <span className="font-semibold">{product.seller.nickname}</span>
          </p>
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">{product.title}</h1>
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <StatusBadge status={product.status} />
              <RelativeTime iso={product.createdAt} />
            </p>
          </div>
          {/* 줄바꿈은 보존하고, 입력한 글자를 그대로 보여준다. 주소를 링크로 바꾸지 않는다 [AC-PC-07] */}
          {product.description !== '' && <p className="whitespace-pre-wrap break-words text-base">{product.description}</p>}
        </div>
        {isSeller && <SellerControls product={product} />}
      </main>
      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-divider bg-bg px-4 py-3">
        <p className="text-lg font-semibold">{formatPrice(product.price)}</p>
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
