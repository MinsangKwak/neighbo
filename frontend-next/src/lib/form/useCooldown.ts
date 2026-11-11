'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/ApiError';

// 요청이 너무 많다는 응답(429)을 받으면 서버가 알려 준 시간(Retry-After) 동안 다시 보내지 못하게 한다 [AC-CM-26]
// 안내 문구는 호출한 쪽이 보인다. 여기는 "지금 잠겨 있는가"만 안다
export function useCooldown() {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (seconds === null) return;
    const timer = setTimeout(() => setSeconds(null), seconds * 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return {
    active: seconds !== null,
    // 429가 아니거나 시간이 없으면 아무것도 하지 않는다
    startFrom(error: unknown) {
      if (error instanceof ApiError && error.code === 'RATE_LIMITED' && error.retryAfter !== null) {
        setSeconds(error.retryAfter);
      }
    },
  };
}
