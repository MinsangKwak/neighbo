'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { describeApiError } from '@/lib/api/ApiError';
import { apiFetch } from '@/lib/api/apiFetch';
import { announceLogout } from './crossTab';

const TOAST_KEY = 'nb:flash';

// 확인 없이 로그아웃 → 쿠키 삭제 → 홈 [AC-LI-12]
export function LogoutButton() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' });
      announceLogout();
      leaveFlash('로그아웃했어요');
      // 문서를 새로 받아 클라이언트에 남은 상태(캐시 · 연결)를 전부 버린다 [AC-LI-13]
      // 라우터 이동이 아니라 문서를 새로 받는다 — 이 탭에 남은 이전 계정의 상태를 전부 버리려고
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/');
    } catch (err) {
      setLoading(false);
      toast(describeApiError(err), 'error');
    }
  };

  return (
    <Button variant="secondary" block loading={loading} onClick={() => void logout()}>
      로그아웃
    </Button>
  );
}

// 문서를 새로 받기 직전에 남긴다 — 새 문서가 뜨면 한 번 보여준다
export function leaveFlash(message: string): void {
  try {
    sessionStorage.setItem(TOAST_KEY, message);
  } catch {
    // 저장소를 쓸 수 없으면 토스트만 빠진다
  }
}

// 문서를 새로 받은 뒤 한 번 보여줄 토스트
export function takeFlash(): string | null {
  try {
    const message = sessionStorage.getItem(TOAST_KEY);
    if (message !== null) sessionStorage.removeItem(TOAST_KEY);
    return message;
  } catch {
    return null;
  }
}
