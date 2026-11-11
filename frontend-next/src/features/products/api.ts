import type {
  ChangeStatusInput,
  ChatPartnersResponse,
  FavoriteResponse,
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
    ...(filters.neighborhood === undefined ? {} : { neighborhood: filters.neighborhood }),
    ...(filters.sellerId === undefined ? {} : { sellerId: filters.sellerId }),
    ...(cursor === null ? {} : { cursor }),
  };
}

// 관심 목록은 내 것이라 경로가 다르다. 응답 모양은 같다
export const listPath = (filters: ProductListFilters) => (filters.favorites === true ? '/me/favorites' : '/products');

export const fetchProductPage = (filters: ProductListFilters, cursor: string | null) =>
  apiFetch<ProductPage>(listPath(filters), { query: listQuery(filters, cursor) });

// 켜기는 PUT, 끄기는 DELETE — 같은 요청이 두 번 가도 결과가 같다 [AC-FV-01, 02]
export const setFavorite = (id: string, on: boolean) =>
  apiFetch<FavoriteResponse>(`/products/${id}/favorite`, { method: on ? 'PUT' : 'DELETE' });

export const fetchProduct = (id: string) => apiFetch<ProductDetailResponse>(`/products/${id}`);

export const changeProductStatus = (id: string, input: ChangeStatusInput) =>
  apiFetch<ProductResponse>(`/products/${id}/status`, { method: 'PATCH', body: input });

export const deleteProduct = (id: string) => apiFetch<void>(`/products/${id}`, { method: 'DELETE' });

export const fetchChatPartners = (id: string) => apiFetch<ChatPartnersResponse>(`/products/${id}/chat-partners`);
