import type { AuthResponse, ChangePasswordInput, MyProductPage, PurchasePage, UpdateMeInput } from '@neighbo/shared-schema';
import { apiFetch } from '@/lib/api/apiFetch';

export const MY_PAGE_SIZE = 20;
export const MY_TABS = ['ON_SALE', 'RESERVED', 'SOLD', 'PURCHASED'] as const;
export type MyTab = (typeof MY_TABS)[number];

export const isMyTab = (value: unknown): value is MyTab => MY_TABS.includes(value as MyTab);

// 탭별 목록의 경로 — 서버 렌더와 브라우저가 같은 함수로 만든다
export function myListPath(tab: MyTab, cursor: string | null): string {
  const query = new URLSearchParams({ limit: String(MY_PAGE_SIZE), ...(cursor === null ? {} : { cursor }) });
  if (tab === 'PURCHASED') return `/me/purchases?${query.toString()}`;
  query.set('status', tab);
  return `/me/products?${query.toString()}`;
}

export const fetchMyList = (tab: MyTab, cursor: string | null) => apiFetch<MyProductPage | PurchasePage>(myListPath(tab, cursor));

export const updateMe = (input: UpdateMeInput) => apiFetch<AuthResponse>('/me', { method: 'PATCH', body: input });

export const changePassword = (input: ChangePasswordInput) => apiFetch<void>('/me/password', { method: 'PATCH', body: input });
