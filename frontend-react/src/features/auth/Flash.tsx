'use client';

import { useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { takeFlash } from './LogoutButton';

// 전체 새로고침을 건넌 안내(로그아웃했어요)를 한 번 보여준다
export function Flash() {
  const toast = useToast();
  useEffect(() => {
    const message = takeFlash();
    if (message !== null) toast(message);
  }, [toast]);
  return null;
}
