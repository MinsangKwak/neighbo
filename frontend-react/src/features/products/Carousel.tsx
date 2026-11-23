'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ProductImage } from '@neighbo/shared-schema';

// 사진 캐러셀 — 자동 재생 없음, 이전 · 다음 버튼으로 키보드 조작 [AC-PD-17]
// 사진을 누르면 화면 가득 크게 본다 — 정사각 칸에서는 세로 사진의 글씨나 흠집이 보이지 않는다
export function Carousel({ images, title }: { images: ProductImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLUListElement>(null);
  // 크게 보는 사진의 번호. null이면 닫혀 있다
  const [zoomed, setZoomed] = useState<number | null>(null);
  const viewer = useRef<HTMLDialogElement>(null);

  // 네이티브 <dialog> — 포커스 가두기 · Esc 닫기 · 닫힌 뒤 누른 사진으로 복귀를 브라우저가 해 준다 [AC-CM-42]
  useEffect(() => {
    const dialog = viewer.current;
    if (dialog === null) return;
    if (zoomed !== null && !dialog.open) dialog.showModal();
    if (zoomed === null && dialog.open) dialog.close();
  }, [zoomed]);

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
            <button
              type="button"
              aria-label={`사진 ${i + 1} 크게 보기`}
              onClick={() => setZoomed(i)}
              className="block size-full cursor-zoom-in"
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
            </button>
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
      <dialog
        ref={viewer}
        aria-label="사진 크게 보기"
        onClose={() => setZoomed(null)}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-text p-0 text-bg backdrop:bg-text"
      >
        {zoomed !== null && images[zoomed] !== undefined && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-2">
              <p aria-live="polite" className="px-2 text-sm">
                {zoomed + 1} / {images.length}
              </p>
              <button
                type="button"
                onClick={() => setZoomed(null)}
                className="inline-flex min-h-touch items-center px-3 text-sm font-semibold"
              >
                닫기
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <Image
                key={images[zoomed].id}
                src={images[zoomed].url}
                alt={zoomed === 0 ? title : `${title} 사진 ${zoomed + 1}`}
                width={images[zoomed].width}
                height={images[zoomed].height}
                unoptimized
                className="size-full object-contain"
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="이전 사진 크게 보기"
                    aria-disabled={zoomed === 0 || undefined}
                    onClick={() => setZoomed(Math.max(0, zoomed - 1))}
                    className="absolute left-2 top-1/2 inline-flex size-touch -translate-y-1/2 items-center justify-center rounded-full bg-bg text-xl text-text aria-disabled:opacity-60"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <button
                    type="button"
                    aria-label="다음 사진 크게 보기"
                    aria-disabled={zoomed === images.length - 1 || undefined}
                    onClick={() => setZoomed(Math.min(images.length - 1, zoomed + 1))}
                    className="absolute right-2 top-1/2 inline-flex size-touch -translate-y-1/2 items-center justify-center rounded-full bg-bg text-xl text-text aria-disabled:opacity-60"
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
