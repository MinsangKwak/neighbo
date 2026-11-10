import { CardSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <>
      <div className="h-14 border-b border-divider" />
      <CardSkeleton />
    </>
  );
}
