import type {
  ChangeStatusInput,
  ChatPartnersResponse,
  ProductDetailResponse,
  ProductPage,
  ProductResponse,
} from '@neighbo/shared-schema';
import { apiFetch } from '@/lib/api/apiFetch';
import type { ProductListFilters } from '@/lib/query/queryKeys';

export const PAGE_SIZE = 20;

// 목록 조회의 쿼리 문자열 — 서버 렌더와 브라우저가 같은 함수로 만든다
export function listQuery(filters: ProductListFilters, cursor: string | null): Record<string, string> {
  return {
    limit: String(PAGE_SIZE),
    ...(filters.q === null ? {} : { q: filters.q }),
    ...(filters.hideSold ? { hideSold: '1' } : {}),
    ...(filters.sellerId === undefined ? {} : { sellerId: filters.sellerId }),
    ...(cursor === null ? {} : { cursor }),
  };
}

export const fetchProductPage = (filters: ProductListFilters, cursor: string | null) =>
  apiFetch<ProductPage>('/products', { query: listQuery(filters, cursor) });

export const fetchProduct = (id: string) => apiFetch<ProductDetailResponse>(`/products/${id}`);

export const changeProductStatus = (id: string, input: ChangeStatusInput) =>
  apiFetch<ProductResponse>(`/products/${id}/status`, { method: 'PATCH', body: input });

export const deleteProduct = (id: string) => apiFetch<void>(`/products/${id}`, { method: 'DELETE' });

export const fetchChatPartners = (id: string) => apiFetch<ChatPartnersResponse>(`/products/${id}/chat-partners`);
