import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import { productDetailResponseSchema, productPageSchema, type ProductDetailResponse } from '@neighbo/shared-schema';
import { serverFetch } from '@/lib/api/serverFetch';
import { queryKeys, type ProductListFilters } from '@/lib/query/queryKeys';
import { listQuery } from './api';

// 서버가 첫 페이지를 가져와 브라우저 캐시로 넘긴다 — 같은 키라 브라우저는 다시 요청하지 않는다
// 실패하면 빈 상태로 넘기고, 브라우저의 조회가 오류 화면과 [다시 시도]를 맡는다
export async function prefetchProductList(filters: ProductListFilters): Promise<DehydratedState> {
  const client = new QueryClient();
  try {
    await client.fetchInfiniteQuery({
      queryKey: queryKeys.products(filters),
      initialPageParam: null as string | null,
      queryFn: async () => {
        const response = await serverFetch(`/products?${new URLSearchParams(listQuery(filters, null)).toString()}`);
        if (!response.ok) throw new Error(`목록 조회 실패 ${response.status}`);
        return productPageSchema.parse(await response.json());
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ lvl: 'error', msg: 'prefetch', err: err instanceof Error ? err.message : String(err) }));
  }
  return dehydrate(client);
}

// 상세 — 없음 · 삭제됨은 null (호출부가 notFound()) [AC-PD-19]
export async function getProduct(id: string): Promise<ProductDetailResponse | null> {
  const response = await serverFetch(`/products/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`상세 조회 실패 ${response.status}`);
  return productDetailResponseSchema.parse(await response.json());
}
