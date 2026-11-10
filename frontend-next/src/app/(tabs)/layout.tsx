import type { ReactNode } from 'react';
import { TabBar } from '@/components/TabBar';

// 탭 화면 묶음 — 하단 탭바가 있다. 상세 · 폼 · 채팅방은 이 묶음 밖이다
export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex flex-1 flex-col">{children}</div>
      <TabBar />
    </>
  );
}
