// 캐시 키는 이 파일에서만 만든다 — 문자열을 직접 쓰면 오타 하나로 무효화가 조용히 실패한다
export interface ProductListFilters {
  q: string | null;
  hideSold: boolean;
}

export const queryKeys = {
  products: (filters: ProductListFilters) => ['products', filters] as const,
  allProducts: () => ['products'] as const,
  product: (id: string) => ['product', id] as const,
  chatPartners: (id: string) => ['product', id, 'chatPartners'] as const,
};
