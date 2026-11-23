'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { countGraphemes, normalizeText, SEARCH_MIN } from '@neighbo/shared-schema';

// 검색어는 URL(?q=)에 둔다 — 새로고침 · 공유에서 유지된다 [AC-PL-12]
export function SearchForm({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = normalizeText(value);
    if (countGraphemes(q) < SEARCH_MIN) {
      setError('2자 이상 입력해 주세요');
      return;
    }
    setError(null);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <form role="search" onSubmit={submit} className="flex flex-1 flex-col gap-1">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          물건 검색
        </label>
        <input
          id={id}
          type="search"
          name="q"
          value={value}
          enterKeyHint="search"
          placeholder="물건 이름으로 검색"
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? `${id}-error` : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            if (error !== null) setError(null);
          }}
          className="min-h-touch min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 text-base"
        />
        <button type="submit" className="min-h-touch rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary">
          검색
        </button>
      </div>
      {error !== null && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
