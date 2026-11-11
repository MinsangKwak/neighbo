'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { loginHref } from '@/features/auth/next';
import { ApiError, describeApiError } from '@/lib/api/ApiError';
import { queryKeys } from '@/lib/query/queryKeys';
import { setFavorite } from './api';

interface FavoriteState {
  on: boolean;
  count: number;
}

interface FavoriteButtonProps {
  productId: string;
  loggedIn: boolean;
  initial: FavoriteState;
}

// 상세 화면의 관심(찜) — 누르는 즉시 바뀌고, 실패하면 되돌린다 [AC-FV-08]
export function FavoriteButton({ productId, loggedIn, initial }: FavoriteButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [state, setState] = useState(initial);
  // 응답을 기다리는 동안의 연타는 버린다 — 켜기와 끄기가 엇갈려 도착하지 않게
  const busy = useRef(false);

  const toggle = async () => {
    if (!loggedIn) {
      // 로그인하고 돌아와 다시 눌러야 한다 — 자동으로 켜지 않는다
      router.push(loginHref(`/products/${productId}`));
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const before = state;
    const on = !before.on;
    setState({ on, count: Math.max(0, before.count + (on ? 1 : -1)) });
    try {
      const result = await setFavorite(productId, on);
      setState({ on: result.isFavorite, count: result.favoriteCount });
      // 관심 목록이 다음에 열릴 때 새로 읽게 한다
      void queryClient.invalidateQueries({ queryKey: queryKeys.allProducts() });
    } catch (err) {
      setState(before);
      toast(describeApiError(err), 'error');
      if (err instanceof ApiError && err.code === 'NOT_FOUND') router.replace('/');
    } finally {
      busy.current = false;
    }
  };

  return (
    <button
      type="button"
      // 눌린 상태는 aria-pressed가 말한다. 이름은 바뀌지 않는다
      aria-pressed={state.on}
      aria-label={`관심 ${state.count}`}
      onClick={() => void toggle()}
      className={`inline-flex min-h-touch min-w-touch shrink-0 flex-col items-center justify-center rounded-lg text-xs ${
        state.on ? 'text-primary' : 'text-text-muted'
      }`}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        {state.on ? '♥' : '♡'}
      </span>
      {state.count}
    </button>
  );
}
