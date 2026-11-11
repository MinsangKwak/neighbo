'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  createProductSchema,
  countGraphemes,
  DESCRIPTION_MAX,
  IMAGES_MAX,
  normalizeText,
  PRICE_MAX,
  TITLE_MAX,
  toFieldErrors,
  type ProductDetail,
  type ProductResponse,
  type Upload,
} from '@neighbo/shared-schema';
import { Button } from '@/components/Button';
import { useCooldown } from '@/lib/form/useCooldown';
import { useLeaveGuard } from '@/lib/form/useLeaveGuard';
import { usePasteClip } from '@/lib/form/usePasteClip';
import { Dialog } from '@/components/Dialog';
import { ImagePicker, type PickedImage } from '@/components/ImagePicker';
import { useToast } from '@/components/Toast';
import { ApiError, describeApiError } from '@/lib/api/ApiError';
import { apiFetch } from '@/lib/api/apiFetch';
import { queryKeys } from '@/lib/query/queryKeys';
import { prepareImage, uploadImage } from './imageUpload';

type FieldName = 'title' | 'price' | 'description' | 'imageIds';

interface ProductFormProps {
  // 있으면 수정, 없으면 등록
  product?: ProductDetail;
  // 테스트에서 바꿔 끼운다
  prepare?: (file: File) => Promise<Blob>;
  upload?: (blob: Blob, onProgress: (ratio: number) => void) => Promise<Upload>;
}

const digitsOnly = (value: string) => value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
// 입력 중 천 단위 콤마 [AC-PC-06]
const withCommas = (digits: string) => (digits === '' ? '' : Number(digits).toLocaleString('ko-KR'));

const inputClass = 'min-h-touch w-full rounded-lg border bg-bg px-3 text-base';

export function ProductForm({
  product,
  prepare = prepareImage,
  upload = (blob, onProgress) => uploadImage(blob, 'PRODUCT', onProgress),
}: ProductFormProps) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const ids = { title: useId(), price: useId(), description: useId() };
  const isEdit = product !== undefined;

  const [title, setTitle] = useState(product?.title ?? '');
  const [priceDigits, setPriceDigits] = useState(product === undefined || product.price === 0 ? '' : String(product.price));
  const [free, setFree] = useState(product?.price === 0);
  const [description, setDescription] = useState(product?.description ?? '');
  const [images, setImages] = useState<PickedImage[]>(
    () =>
      product?.images.map((image) => ({
        key: image.id,
        previewUrl: image.thumbnailUrl,
        status: 'done' as const,
        progress: 1,
        error: null,
        uploadId: null,
        imageId: image.id,
        file: null,
      })) ?? [],
  );
  // 폼을 열 때 한 번 만든다 — 응답을 못 받고 다시 보내도 상품이 중복되지 않는다 [AC-PC-08, 09]
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // 작성 중에 탭을 닫거나 새로고침하면 브라우저가 확인한다 [AC-PC-04]
  const leave = useLeaveGuard(dirty);
  const cooldown = useCooldown();
  const titlePaste = usePasteClip(TITLE_MAX);
  const descriptionPaste = usePasteClip(DESCRIPTION_MAX);

  const uploading = images.filter((image) => image.status === 'uploading').length;
  // 올리지 못한 사진을 둔 채 등록하면 그 사진이 말없이 빠진다 — 다시 시도하거나 지울 때까지 막는다
  const failed = images.filter((image) => image.status === 'error').length;
  const blocked = uploading > 0 || failed > 0;
  const ready = images.filter((image) => image.status === 'done');

  const candidate = () => ({
    title,
    price: free ? 0 : priceDigits === '' ? undefined : Number(priceDigits),
    description,
    imageIds: ready.map((image) => image.uploadId ?? image.imageId ?? ''),
    idempotencyKey,
  });

  const validate = () => {
    const result = createProductSchema.safeParse(candidate());
    return result.success ? {} : (toFieldErrors(result.error) as Partial<Record<FieldName, string>>);
  };

  // 칸을 떠날 때 그 칸만 검증한다. 오류가 보이던 칸은 입력마다 다시 본다
  const check = (name: FieldName) => {
    const found = validate()[name];
    setErrors((current) => {
      const next = { ...current };
      if (found === undefined) delete next[name];
      else next[name] = found;
      return next;
    });
  };
  const touch = (name: FieldName) => {
    setDirty(true);
    if (errors[name] !== undefined) queueMicrotask(() => check(name));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || blocked || cooldown.active) return;
    setFormError(null);
    const found = validate();
    setErrors(found);
    const first = (['title', 'price', 'description'] as const).find((name) => found[name] !== undefined);
    if (first !== undefined) {
      ({ title: titleRef, price: priceRef, description: descriptionRef })[first].current?.focus();
      return;
    }
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const input = candidate();
      const { product: saved } = isEdit
        ? await apiFetch<ProductResponse>(`/products/${product.id}`, {
            method: 'PATCH',
            body: {
              title: input.title,
              price: input.price,
              description: input.description,
              // 최종 사진 목록 — 기존 사진은 imageId, 새 사진은 uploadId
              images: ready.map((image) => (image.imageId !== null ? { imageId: image.imageId } : { uploadId: image.uploadId })),
            },
          })
        : await apiFetch<ProductResponse>('/products', { method: 'POST', body: input });

      leave.allow();
      await queryClient.invalidateQueries({ queryKey: queryKeys.allProducts() });
      toast(isEdit ? '수정했어요' : '물건을 올렸어요');
      // replace: 뒤로가기로 폼에 돌아오지 않게 [AC-PC-01, 33]
      router.replace(`/products/${saved.id}`);
      router.refresh();
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        // 수정하는 사이 삭제됐다 [AC-PC-35]
        leave.allow();
        toast('삭제된 물건이에요', 'error');
        router.replace('/');
        return;
      }
      if (err instanceof ApiError && err.fields !== null) {
        const fields = err.fields as Partial<Record<FieldName | 'images', string>>;
        setErrors({ ...fields, ...(fields.images === undefined ? {} : { imageIds: fields.images }) });
        return;
      }
      // 입력은 그대로 두고 알린다 [AC-CM-22]
      cooldown.startFrom(err);
      setFormError(describeApiError(err));
    }
  };

  const titleLength = countGraphemes(normalizeText(title));
  const descriptionLength = countGraphemes(description);
  const errorId = (name: 'title' | 'price' | 'description') => `${ids[name]}-error`;
  const describedBy = (name: 'title' | 'price' | 'description', extra: string) =>
    [extra, errors[name] !== undefined ? errorId(name) : null].filter((part) => part !== null).join(' ');

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 px-4 py-5">
        <div role="alert">
          {formError !== null && <p className="rounded-lg bg-surface px-3 py-2 text-sm text-danger">{formError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <ImagePicker
            max={IMAGES_MAX}
            value={images}
            onChange={(update) => {
              setDirty(true);
              setImages(update);
            }}
            prepare={prepare}
            upload={upload}
            onOverflow={() => toast('사진은 10장까지 올릴 수 있어요', 'error')}
          />
          {errors.imageIds !== undefined && <p className="text-sm text-danger">{errors.imageIds}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={ids.title} className="text-sm font-semibold">
            제목
          </label>
          <input
            ref={titleRef}
            id={ids.title}
            name="title"
            value={title}
            required
            // 조합 중인 한글이 잘리지 않게 넉넉히 두고, 정확한 길이는 검증이 본다
            maxLength={TITLE_MAX * 2}
            aria-invalid={errors.title !== undefined || undefined}
            aria-describedby={describedBy('title', `${ids.title}-count`)}
            onPaste={titlePaste.onPaste}
            onChange={(event) => {
              // 줄바꿈은 공백으로 [AC-PC-05]
              setTitle(titlePaste.clip(event.target.value.replace(/[\r\n]+/g, ' ')));
              touch('title');
            }}
            onBlur={() => {
              setTitle(normalizeText(title));
              check('title');
            }}
            className={`${inputClass} ${errors.title !== undefined ? 'border-danger' : 'border-border'}`}
          />
          <p id={`${ids.title}-count`} className="text-right text-sm text-text-muted">
            <span className="sr-only">글자 수 </span>
            {titleLength}/{TITLE_MAX}
          </p>
          {errors.title !== undefined && (
            <p id={errorId('title')} className="text-sm text-danger">
              {errors.title}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={ids.price} className="text-sm font-semibold">
            가격
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={priceRef}
              id={ids.price}
              name="price"
              inputMode="numeric"
              autoComplete="off"
              value={free ? '0' : withCommas(priceDigits)}
              disabled={free}
              required
              aria-invalid={errors.price !== undefined || undefined}
              aria-describedby={describedBy('price', `${ids.price}-unit`)}
              onChange={(event) => {
                const digits = digitsOnly(event.target.value);
                // 상한(1억)의 자릿수까지만 받는다
                if (digits.length <= String(PRICE_MAX).length) setPriceDigits(digits);
                touch('price');
              }}
              onBlur={() => check('price')}
              className={`${inputClass} flex-1 ${errors.price !== undefined ? 'border-danger' : 'border-border'}`}
            />
            <span id={`${ids.price}-unit`} className="text-base">
              원
            </span>
            <label className="flex min-h-touch items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={free}
                onChange={(event) => {
                  // 나눔이면 0원으로 고정하고 칸을 잠근다
                  setFree(event.target.checked);
                  setDirty(true);
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.price;
                    return next;
                  });
                }}
                className="size-5 accent-primary"
              />
              나눔
            </label>
          </div>
          {errors.price !== undefined && (
            <p id={errorId('price')} className="text-sm text-danger">
              {errors.price}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={ids.description} className="text-sm font-semibold">
            설명 <span className="font-normal text-text-muted">(선택)</span>
          </label>
          <textarea
            ref={descriptionRef}
            id={ids.description}
            name="description"
            value={description}
            rows={5}
            aria-invalid={errors.description !== undefined || undefined}
            aria-describedby={describedBy('description', `${ids.description}-count`)}
            onPaste={descriptionPaste.onPaste}
            onChange={(event) => {
              setDescription(descriptionPaste.clip(event.target.value));
              touch('description');
            }}
            onBlur={() => {
              setDescription(normalizeText(description, { multiline: true }));
              check('description');
            }}
            className={`${inputClass} field-sizing-content max-h-96 py-3 ${
              errors.description !== undefined ? 'border-danger' : 'border-border'
            }`}
          />
          <p id={`${ids.description}-count`} className="text-right text-sm text-text-muted">
            <span className="sr-only">글자 수 </span>
            {descriptionLength.toLocaleString('ko-KR')}/{DESCRIPTION_MAX.toLocaleString('ko-KR')}
          </p>
          {errors.description !== undefined && (
            <p id={errorId('description')} className="text-sm text-danger">
              {errors.description}
            </p>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-divider bg-bg px-4 py-3">
        {/* 올리는 중에는 등록할 수 없다는 것을 버튼 옆 글로 알린다 [AC-PC-16] */}
        {uploading > 0 && (
          <p role="status" className="text-center text-sm text-text-muted">
            사진 올리는 중 {images.length - uploading}/{images.length}
          </p>
        )}
        {uploading === 0 && failed > 0 && (
          <p role="status" className="text-center text-sm text-danger">
            올리지 못한 사진 {failed}장을 다시 시도하거나 삭제해 주세요
          </p>
        )}
        <div className="flex gap-2">
          {/* 좁은 화면에서 [취소]가 눌려 글자가 세로로 꺾이지 않게 줄어들지 않는 칸에 둔다 */}
          <span className="shrink-0">
          <Button
            variant="secondary"
            onClick={() => {
              if (dirty) setConfirmLeave(true);
              else router.back();
            }}
          >
            취소
          </Button>
          </span>
          <Button type="submit" block loading={submitting} aria-disabled={blocked || cooldown.active || undefined}>
            {isEdit ? '저장하기' : '등록하기'}
          </Button>
        </div>
      </div>

      <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)} title="작성 중인 내용이 사라져요. 나갈까요?" alert>
        <div className="flex gap-2">
          <Button variant="secondary" block autoFocus onClick={() => setConfirmLeave(false)}>
            계속 작성
          </Button>
          <Button
            variant="danger"
            block
            onClick={() => {
              leave.allow();
              router.back();
            }}
          >
            나가기
          </Button>
        </div>
      </Dialog>
    </form>
  );
}
