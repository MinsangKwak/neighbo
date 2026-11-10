import { PRODUCT_STATUS_LABEL, type ProductStatus } from '@neighbo/shared-schema';

// 판매중은 표시하지 않는다. 색만으로 구분하지 않고 글자를 함께 쓴다 [AC-CM-46]
export function StatusBadge({ status, deleted = false }: { status: ProductStatus; deleted?: boolean }) {
  if (deleted) {
    return <span className="rounded bg-surface px-2 py-1 text-xs font-semibold text-text-muted">삭제됨</span>;
  }
  if (status === 'ON_SALE') return null;
  return (
    <span
      className={`rounded px-2 py-1 text-xs font-semibold ${
        status === 'RESERVED' ? 'bg-primary text-on-primary' : 'bg-text text-bg'
      }`}
    >
      {PRODUCT_STATUS_LABEL[status]}
    </span>
  );
}
