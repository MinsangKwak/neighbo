import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import { meResponseSchema, myProductPageSchema, purchasePageSchema, type MeResponse } from '@neighbo/shared-schema';
import { serverFetch } from '@/lib/api/serverFetch';
import { queryKeys } from '@/lib/query/queryKeys';
import { myListPath, type MyTab } from './api';

// 내 정보와 탭 개수. 로그인이 아니면 null [AC-MP-11]
export async function getMe(): Promise<MeResponse | null> {
  const response = await serverFetch('/me');
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`내 정보 조회 실패 ${response.status}`);
  return meResponseSchema.parse(await response.json());
}

// 지금 탭의 첫 목록을 서버에서 가져온다. 실패하면 브라우저의 조회가 [다시 시도]를 맡는다
export async function prefetchMyList(tab: MyTab): Promise<DehydratedState> {
  const client = new QueryClient();
  try {
    await client.fetchInfiniteQuery({
      queryKey: queryKeys.myList(tab),
      initialPageParam: null as string | null,
      queryFn: async () => {
        const response = await serverFetch(myListPath(tab, null));
        if (!response.ok) throw new Error(`내 목록 조회 실패 ${response.status}`);
        const body: unknown = await response.json();
        return tab === 'PURCHASED' ? purchasePageSchema.parse(body) : myProductPageSchema.parse(body);
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ lvl: 'error', msg: 'prefetch', err: err instanceof Error ? err.message : String(err) }));
  }
  return dehydrate(client);
}
