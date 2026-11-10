import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '찾을 수 없어요' };

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">찾을 수 없어요</h1>
      <p className="text-text-muted">주소가 바뀌었거나 삭제된 화면이에요.</p>
      <Link
        href="/"
        className="mt-4 inline-flex min-h-touch items-center rounded-lg bg-primary px-5 font-semibold text-on-primary"
      >
        홈으로
      </Link>
    </main>
  );
}
