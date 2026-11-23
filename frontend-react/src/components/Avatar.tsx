import Image from 'next/image';

// 아바타가 없으면 기본 그림 — 한글 이니셜은 어색해서 쓰지 않는다 [CL-DT-11]
// 장식이다. 이름은 옆의 닉네임이 말한다
export function Avatar({ url, large = false }: { url: string | null; large?: boolean }) {
  const pixels = large ? 64 : 40;
  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-hidden rounded-full bg-surface ${large ? 'size-16' : 'size-10'}`}
    >
      {url === null ? (
        <span className={`flex size-full items-center justify-center text-text-muted ${large ? 'text-xl' : 'text-lg'}`}>☺</span>
      ) : (
        <Image src={url} alt="" width={pixels} height={pixels} unoptimized className="size-full object-cover" />
      )}
    </span>
  );
}
