'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { nicknameField, normalizeNickname, type UserSelf } from '@neighbo/shared-schema';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { prepareAvatar, uploadImage } from '@/features/products/imageUpload';
import { describeApiError } from '@/lib/api/ApiError';
import { useForm } from '@/lib/form/useForm';
import { updateMe } from './api';

// 가입과 같은 닉네임 규칙 [AC-MP-06]
const schema = z.object({ nickname: nicknameField });

// 아바타의 바뀐 상태: 그대로 · 새로 올림 · 기본 이미지로
type AvatarChange = { kind: 'keep' } | { kind: 'new'; uploadId: string; url: string } | { kind: 'reset' };

export function ProfileForm({ user }: { user: UserSelf }) {
  const router = useRouter();
  const toast = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<AvatarChange>({ kind: 'keep' });
  const [uploading, setUploading] = useState(false);
  const shownAvatar = avatar.kind === 'new' ? avatar.url : avatar.kind === 'reset' ? null : user.avatarUrl;

  const form = useForm({
    initial: { nickname: user.nickname },
    schema,
    normalize: { nickname: normalizeNickname },
    onSubmit: async ({ nickname }) => {
      // 바뀐 것만 보낸다. 생략한 값은 서버가 그대로 둔다
      await updateMe({
        ...(nickname === user.nickname ? {} : { nickname }),
        ...(avatar.kind === 'new' ? { avatarUploadId: avatar.uploadId } : avatar.kind === 'reset' ? { avatarUploadId: null } : {}),
      });
      toast('프로필을 저장했어요');
      router.replace('/me');
      // 헤더 · 목록 등 서버가 그린 닉네임을 새로 받는다 [AC-MP-07]
      router.refresh();
    },
  });

  const pick = async (file: File | undefined) => {
    if (file === undefined) return;
    setUploading(true);
    try {
      // 가운데를 정사각으로 잘라 올린다 [AC-MP-08]
      const upload = await uploadImage(await prepareAvatar(file), 'AVATAR', () => undefined);
      setAvatar({ kind: 'new', uploadId: upload.id, url: upload.url });
    } catch (err) {
      toast(
        err instanceof Error && err.name === 'UnreadableImageError'
          ? '이 사진은 열 수 없어요. JPEG나 PNG로 바꿔서 올려 주세요'
          : describeApiError(err),
        'error',
      );
    } finally {
      setUploading(false);
    }
  };

  // 여러 사람이 함께 쓰는 계정은 바꿀 수 없다. 버튼을 숨기지 않고 이유를 적는다 [AC-LI-19]
  if (user.isDemo) {
    return (
      <p className="rounded-lg bg-surface px-4 py-3 text-sm">
        둘러보기 계정은 여러 사람이 함께 써서 프로필을 바꿀 수 없어요. 직접 가입하면 닉네임과 사진을 정할 수 있어요
      </p>
    );
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
      <div role="alert">
        {form.formError !== null && <p className="rounded-lg bg-surface px-3 py-2 text-sm text-danger">{form.formError}</p>}
      </div>

      <div className="flex items-center gap-4">
        <span className="relative block size-16 shrink-0 overflow-hidden rounded-full bg-surface">
          {shownAvatar === null ? (
            <span aria-hidden="true" className="flex size-full items-center justify-center text-xl text-text-muted">
              ☺
            </span>
          ) : (
            <Image src={shownAvatar} alt="" width={64} height={64} unoptimized className="size-full object-cover" />
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            ref={picker}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              // 같은 파일을 다시 고를 수 있게 비운다
              event.target.value = '';
            }}
          />
          <Button variant="secondary" loading={uploading} onClick={() => picker.current?.click()}>
            프로필 사진 바꾸기
          </Button>
          {shownAvatar !== null && (
            <Button variant="ghost" onClick={() => setAvatar({ kind: 'reset' })}>
              기본 이미지로
            </Button>
          )}
        </div>
      </div>

      <Field kind="nickname" label="닉네임" hint="2~12자 · 한글, 영문, 숫자, 공백, _ . -" {...form.field('nickname')} />

      <Button type="submit" block loading={form.submitting} aria-disabled={uploading || undefined}>
        저장
      </Button>
    </form>
  );
}
