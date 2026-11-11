import Image from 'next/image';

// 아바타가 없으면 기본 그림 — 한글 이니셜은 어색해서 쓰지 않는다 [CL-DT-11]
// 장식이다. 이름은 옆의 닉네임이 말한다
export function Avatar({ url }: { url: string | null }) {
  return (
    <span aria-hidden="true" className="relative block size-10 shrink-0 overflow-hidden rounded-full bg-surface">
      {url === null ? (
        <span className="flex size-full items-center justify-center text-lg text-text-muted">☺</span>
      ) : (
        <Image src={url} alt="" width={40} height={40} unoptimized className="size-full object-cover" />
      )}
    </span>
  );
}
