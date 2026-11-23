'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import {
  PRODUCT_STATUS_LABEL,
  STATUS_TRANSITIONS,
  type ProductDetail,
  type ProductStatus,
} from '@neighbo/shared-schema';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { useToast } from '@/components/Toast';
import { ApiError, describeApiError } from '@/lib/api/ApiError';
import { queryKeys } from '@/lib/query/queryKeys';
import { changeProductStatus, deleteProduct, fetchChatPartners } from './api';

// 판매자에게만 보이는 조작 — 상태 변경 · 수정 · 삭제 [AC-PD-03, 11]
export function SellerControls({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const selectId = useId();
  const [status, setStatus] = useState<ProductStatus>(product.status);
  // 서버가 다시 그려 준 상태가 바뀌면 선택값도 따라간다 (다른 탭에서 바꾼 경우 포함)
  const [syncedStatus, setSyncedStatus] = useState<ProductStatus>(product.status);
  if (syncedStatus !== product.status) {
    setSyncedStatus(product.status);
    setStatus(product.status);
  }
  const [announcement, setAnnouncement] = useState('');
  const [asking, setAsking] = useState<'buyer' | 'revert' | 'delete' | null>(null);

  const partners = useQuery({
    queryKey: queryKeys.chatPartners(product.id),
    queryFn: () => fetchChatPartners(product.id),
    // 바텀시트를 열 때마다 새로 가져온다
    enabled: asking === 'buyer',
    staleTime: 0,
  });

  const change = useMutation({
    mutationFn: (input: { status: ProductStatus; buyerId?: string | null }) => changeProductStatus(product.id, input),
    onSuccess: ({ product: updated }) => {
      setStatus(updated.status);
      setAnnouncement(`${PRODUCT_STATUS_LABEL[updated.status]}(으)로 바꿨어요`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.allProducts() });
      // 서버가 그린 상세(배지 · 버튼)를 새 상태로 다시 받는다
      router.refresh();
    },
    onError: (error) => {
      // 선택을 이전 값으로 되돌리고 알린다 [AC-PD-08]
      setStatus(product.status);
      toast(describeApiError(error), 'error');
      if (error instanceof ApiError && error.code === 'NOT_FOUND') router.replace('/');
      else router.refresh();
    },
    onSettled: () => setAsking(null),
  });

  const remove = useMutation({
    mutationFn: () => deleteProduct(product.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.product(product.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.allProducts() });
      toast('삭제했어요');
      router.replace('/');
    },
    onError: (error) => {
      // 이미 삭제된 상품의 404는 성공으로 본다 — 두 번 눌러도 결과가 같다
      if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        toast('삭제했어요');
        router.replace('/');
        return;
      }
      setAsking(null);
      toast(describeApiError(error), 'error');
    },
  });

  const choose = (next: ProductStatus) => {
    if (next === status) return;
    setStatus(next);
    // 거래완료는 누구와 거래했는지 묻고, 완료 취소는 구매자 정보가 지워진다고 확인한다 [AC-PD-04, 06]
    if (next === 'SOLD') setAsking('buyer');
    else if (status === 'SOLD') setAsking('revert');
    else change.mutate({ status: next });
  };

  const cancel = () => {
    setStatus(product.status);
    setAsking(null);
  };

  // 지금 상태에서 갈 수 있는 상태만 고를 수 있다
  const options: ProductStatus[] = [product.status, ...STATUS_TRANSITIONS[product.status]];

  return (
    <section aria-label="판매자 메뉴" className="flex flex-col gap-3 border-t border-divider px-4 py-4">
      <div className="flex items-center gap-3">
        <label htmlFor={selectId} className="text-sm font-semibold">
          거래 상태
        </label>
        <select
          id={selectId}
          value={status}
          disabled={change.isPending}
          onChange={(event) => choose(event.target.value as ProductStatus)}
          className="min-h-touch flex-1 rounded-lg border border-border bg-bg px-3 text-base"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {PRODUCT_STATUS_LABEL[option]}
            </option>
          ))}
        </select>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex gap-2">
        <Link
          href={`/products/${product.id}/edit`}
          className="inline-flex min-h-touch flex-1 items-center justify-center rounded-lg border border-border px-5 font-semibold"
        >
          수정
        </Link>
        <Button variant="secondary" onClick={() => setAsking('delete')}>
          삭제
        </Button>
      </div>

      <Dialog open={asking === 'buyer'} onClose={cancel} title="누구와 거래했나요?">
        {partners.isPending && <p className="text-sm text-text-muted">대화 상대를 불러오는 중이에요</p>}
        {partners.isError && <p className="text-sm text-danger">대화 상대를 불러오지 못했어요. 선택 없이 완료할 수 있어요</p>}
        <ul className="flex flex-col gap-2">
          {partners.data?.items.map((partner) => (
            <li key={partner.roomId}>
              <Button variant="secondary" block onClick={() => change.mutate({ status: 'SOLD', buyerId: partner.user.id })}>
                {partner.user.nickname}
              </Button>
            </li>
          ))}
          <li>
            {/* 대화 상대와 같은 모양으로 둔다 — 이것만 강조하면 구매자를 고르지 않는 쪽으로 이끈다 */}
            <Button
              variant="secondary"
              block
              loading={change.isPending}
              onClick={() => change.mutate({ status: 'SOLD', buyerId: null })}
            >
              선택 안 함
            </Button>
          </li>
        </ul>
        <Button variant="ghost" block onClick={cancel}>
          취소
        </Button>
      </Dialog>

      <Dialog open={asking === 'revert'} onClose={cancel} title="판매중으로 되돌릴까요?" alert>
        <p className="text-sm text-text-muted">구매자 정보가 지워져요.</p>
        <div className="flex gap-2">
          <Button variant="secondary" block onClick={cancel}>
            취소
          </Button>
          <Button block loading={change.isPending} onClick={() => change.mutate({ status: 'ON_SALE' })}>
            되돌리기
          </Button>
        </div>
      </Dialog>

      <Dialog open={asking === 'delete'} onClose={() => setAsking(null)} title="이 물건을 삭제할까요?" alert>
        <p className="text-sm text-text-muted">
          {product.chatRoomCount > 0
            ? `대화 중인 채팅 ${product.chatRoomCount}개가 있어요. 삭제하면 상대방은 대화 내용만 볼 수 있어요.`
            : '삭제하면 목록과 검색에서 사라져요.'}
        </p>
        <div className="flex gap-2">
          {/* 되돌릴 수 없는 행동이라 [취소]가 먼저 포커스를 받는다 [AC-PX-02] */}
          <Button variant="secondary" block autoFocus onClick={() => setAsking(null)}>
            취소
          </Button>
          <Button variant="danger" block loading={remove.isPending} onClick={() => remove.mutate()}>
            삭제
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
