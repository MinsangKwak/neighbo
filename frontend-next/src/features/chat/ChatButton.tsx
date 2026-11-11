'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { loginHref } from '@/features/auth/next';
import { ApiError, describeApiError } from '@/lib/api/ApiError';
import { openChatRoom } from './api';

interface ChatButtonProps {
  productId: string;
  loggedIn: boolean;
  // 이미 이 상품으로 대화한 방
  existingRoomId: string | null;
  sold: boolean;
}

// 상세 화면의 [채팅하기] — 구매자에게만 보인다 [AC-PD-12~16, 18, 20]
export function ChatButton({ productId, loggedIn, existingRoomId, sold }: ChatButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  // 끝난 거래에 새 대화는 열 수 없다. 대화하던 사람은 들어갈 수 있다
  const blocked = sold && existingRoomId === null;

  const open = async () => {
    if (blocked) {
      toast('거래가 완료된 물건이에요');
      return;
    }
    if (!loggedIn) {
      // 로그인하고 돌아와 다시 눌러야 한다 — 자동으로 방을 만들지 않는다 [AC-PD-16]
      router.push(loginHref(`/products/${productId}`));
      return;
    }
    if (existingRoomId !== null) {
      router.push(`/chats/${existingRoomId}`);
      return;
    }
    // 첫 클릭에 잠근다. 두 번 눌러도 방은 하나다 [AC-PD-15]
    setLoading(true);
    try {
      const { chatRoom } = await openChatRoom(productId);
      router.push(`/chats/${chatRoom.id}`);
    } catch (err) {
      setLoading(false);
      toast(describeApiError(err), 'error');
      if (err instanceof ApiError && err.code === 'PRODUCT_SOLD') router.refresh();
      if (err instanceof ApiError && err.code === 'NOT_FOUND') router.replace('/');
    }
  };

  return (
    // 막힌 이유를 눌러서 들을 수 있게 disabled가 아니라 aria-disabled로 둔다 [AC-PD-18]
    <Button loading={loading} aria-disabled={blocked || undefined} onClick={() => void open()}>
      {existingRoomId === null ? '채팅하기' : '채팅 이어하기'}
    </Button>
  );
}
