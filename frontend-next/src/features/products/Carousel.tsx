'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import type { ProductImage } from '@neighbo/shared-schema';

// 사진 캐러셀 — 자동 재생 없음, 이전 · 다음 버튼으로 키보드 조작 [AC-PD-17]
export function Carousel({ images, title }: { images: ProductImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLUListElement>(null);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center bg-surface text-sm text-text-muted">사진 없음</div>
    );
  }

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(images.length - 1, next));
    setIndex(clamped);
    const slide = track.current?.children[clamped];
    if (slide instanceof HTMLElement) slide.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  return (
    <section aria-roledescription="carousel" aria-label="물건 사진" className="relative bg-surface">
      <ul
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(event) => {
          const element = event.currentTarget;
          setIndex(Math.round(element.scrollLeft / Math.max(1, element.clientWidth)));
        }}
      >
        {images.map((image, i) => (
          <li
            key={image.id}
            aria-roledescription="slide"
            aria-label={`${images.length}장 중 ${i + 1}번째`}
            className="aspect-square w-full shrink-0 snap-start"
          >
            {/* 서버가 준 크기로 자리를 먼저 잡아 로드 중에 화면이 밀리지 않는다 [AC-PD-24] */}
            <Image
              src={image.url}
              alt={i === 0 ? title : `${title} 사진 ${i + 1}`}
              width={image.width}
              height={image.height}
              unoptimized
              priority={i === 0}
              className="size-full object-contain"
            />
          </li>
        ))}
      </ul>
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="이전 사진"
            aria-disabled={index === 0 || undefined}
            onClick={() => go(index - 1)}
            className="absolute left-2 top-1/2 inline-flex size-touch -translate-y-1/2 items-center justify-center rounded-full bg-bg text-xl aria-disabled:opacity-60"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            aria-label="다음 사진"
            aria-disabled={index === images.length - 1 || undefined}
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 inline-flex size-touch -translate-y-1/2 items-center justify-center rounded-full bg-bg text-xl aria-disabled:opacity-60"
          >
            <span aria-hidden="true">›</span>
          </button>
          <p aria-hidden="true" className="absolute bottom-2 right-2 rounded bg-text px-2 py-1 text-xs text-bg">
            {index + 1} / {images.length}
          </p>
        </>
      )}
    </section>
  );
}
