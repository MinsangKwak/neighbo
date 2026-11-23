'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { UserSelf } from '@neighbo/shared-schema';

const SessionContext = createContext<UserSelf | null>(null);

// 서버가 /me로 알아낸 사용자를 클라이언트 컴포넌트에 내려준다
export function SessionProvider({ user, children }: { user: UserSelf | null; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): UserSelf | null {
  return useContext(SessionContext);
}
