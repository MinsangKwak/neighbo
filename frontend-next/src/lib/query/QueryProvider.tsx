'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 서버가 방금 준 데이터를 브라우저가 곧바로 다시 요청하지 않게
        staleTime: 30_000,
        // 실패는 화면이 [다시 시도]로 받는다. 자동 재시도는 하지 않는다 [AC-CM-22]
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // 탭마다 하나. 경로를 옮겨도 유지되어 뒤로가기에서 불러온 페이지가 그대로 남는다 [AC-PL-08]
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
