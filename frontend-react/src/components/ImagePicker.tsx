'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import type { Upload } from '@neighbo/shared-schema';
import { describeApiError } from '@/lib/api/ApiError';

// 사진 한 장의 상태. 기존 사진(imageId)은 처음부터 done이다
export interface PickedImage {
  key: string;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  error: string | null;
  // 새로 올린 사진
  uploadId: string | null;
  // 수정 화면의 기존 사진
  imageId: string | null;
  // 실패했을 때 다시 올릴 원본
  file: File | null;
}

interface ImagePickerProps {
  max: number;
  value: PickedImage[];
  onChange: (update: (current: PickedImage[]) => PickedImage[]) => void;
  // 테스트에서 바꿔 끼울 수 있게 주입받는다
  prepare: (file: File) => Promise<Blob>;
  upload: (blob: Blob, onProgress: (ratio: number) => void) => Promise<Upload>;
  // 한도를 넘겨 일부만 받았을 때
  onOverflow: () => void;
}

const CONCURRENCY = 3;

// 사진은 고르는 즉시 올린다(동시 3장). 폼은 올라간 사진의 id만 보낸다 [AC-PC-10]
export function ImagePicker({ max, value, onChange, prepare, upload, onOverflow }: ImagePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const running = useRef(0);
  const queue = useRef<{ key: string; file: File }[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const patch = (key: string, change: Partial<PickedImage>) => {
    if (!alive.current) return;
    onChange((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  };

  const pump = () => {
    while (running.current < CONCURRENCY && queue.current.length > 0) {
      const job = queue.current.shift();
      if (job === undefined) return;
      running.current += 1;
      void (async () => {
        try {
          const blob = await prepare(job.file);
          const uploaded = await upload(blob, (ratio) => patch(job.key, { progress: ratio }));
          patch(job.key, { status: 'done', progress: 1, uploadId: uploaded.id, error: null });
          if (alive.current) setAnnouncement('사진을 올렸어요');
        } catch (err) {
          const message =
            err instanceof Error && err.name === 'UnreadableImageError'
              ? '이 사진은 열 수 없어요. jpg · png로 바꿔 올려 주세요'
              : describeApiError(err);
          patch(job.key, { status: 'error', error: message });
          if (alive.current) setAnnouncement(`사진을 올리지 못했어요. ${message}`);
        } finally {
          running.current -= 1;
          pump();
        }
      })();
    }
  };

  const add = (files: File[]) => {
    const room = max - value.length;
    // 한도를 넘으면 앞에서부터 들어갈 만큼만 받는다 [AC-PC-11]
    if (files.length > room) onOverflow();
    const accepted = files.slice(0, Math.max(0, room));
    const items = accepted.map((file) => ({ key: crypto.randomUUID(), file }));
    onChange((current) => [
      ...current,
      ...items.map<PickedImage>(({ key, file }) => ({
        key,
        previewUrl: URL.createObjectURL(file),
        status: 'uploading',
        progress: 0,
        error: null,
        uploadId: null,
        imageId: null,
        file,
      })),
    ]);
    queue.current.push(...items);
    pump();
  };

  const retry = (item: PickedImage) => {
    if (item.file === null) return;
    patch(item.key, { status: 'uploading', progress: 0, error: null });
    queue.current.push({ key: item.key, file: item.file });
    pump();
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex gap-3 overflow-x-auto pb-1">
        <li className="shrink-0">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              add(Array.from(event.target.files ?? []));
              // 같은 파일을 다시 골라도 change가 일어나게
              event.target.value = '';
            }}
          />
          <label
            htmlFor={inputId}
            className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-border text-sm"
          >
            <span aria-hidden="true" className="text-xl">
              +
            </span>
            {/* 읽히는 이름: "사진 추가, 현재 N장" [AC-PC-20] */}
            <span>
              사진 추가<span className="sr-only">, 현재 {value.length}장</span>
            </span>
            <span aria-hidden="true" className="text-xs text-text-muted">
              {value.length}/{max}
            </span>
          </label>
        </li>
        {value.map((item, index) => (
          <li key={item.key} className="relative size-24 shrink-0">
            <Image
              src={item.previewUrl}
              alt={`${index + 1}번째 사진`}
              width={96}
              height={96}
              unoptimized
              className={`size-full rounded-lg object-cover ${item.status === 'done' ? '' : 'opacity-60'}`}
            />
            {index === 0 && (
              <span className="absolute bottom-0 left-0 rounded-bl-lg rounded-tr-lg bg-text px-2 py-1 text-xs text-bg">대표</span>
            )}
            {item.status === 'uploading' && (
              <span className="absolute inset-x-1 bottom-1 rounded bg-bg px-1 text-center text-xs">
                {Math.round(item.progress * 100)}%
              </span>
            )}
            {item.status === 'error' && (
              <button
                type="button"
                onClick={() => retry(item)}
                className="absolute inset-x-1 bottom-1 rounded bg-danger px-1 text-xs text-on-danger"
              >
                다시 시도<span className="sr-only"> {index + 1}번째 사진</span>
              </button>
            )}
            <button
              type="button"
              aria-label={`${index + 1}번째 사진 삭제`}
              onClick={() => onChange((current) => current.filter((other) => other.key !== item.key))}
              className="absolute right-0 top-0 inline-flex size-8 items-center justify-center rounded-bl-lg rounded-tr-lg bg-text text-bg"
            >
              <span aria-hidden="true">×</span>
            </button>
            {/* 드래그 정렬 대신 버튼 하나 — 맨 앞이 대표 사진이다 [AC-PC-17] */}
            {index > 0 && item.status === 'done' && (
              <button
                type="button"
                aria-label={`${index + 1}번째 사진을 대표로`}
                onClick={() => onChange((current) => [item, ...current.filter((other) => other.key !== item.key)])}
                className="absolute left-0 top-0 rounded-br-lg rounded-tl-lg bg-bg px-2 py-1 text-xs"
              >
                대표로
              </button>
            )}
          </li>
        ))}
      </ul>
      {value
        .filter((item) => item.error !== null)
        .slice(0, 1)
        .map((item) => (
          <p key={item.key} className="text-sm text-danger">
            {item.error}
          </p>
        ))}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
