import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Button } from '@/components/Button';
import { Field, type FieldKind } from '@/components/Field';
import { ToastProvider } from '@/components/Toast';
import { ApiError } from '@/lib/api/ApiError';
import { useForm } from './useForm';
import { useLeaveGuard } from './useLeaveGuard';

afterEach(() => vi.useRealTimers());

const schema = z.object({ name: z.string().min(1, '이름을 입력해 주세요') });

function Form({ onSubmit }: { onSubmit: () => Promise<void> }) {
  const form = useForm({ initial: { name: '김당근' }, schema, onSubmit });
  return (
    <form noValidate onSubmit={form.handleSubmit}>
      <p data-testid="form-error">{form.formError}</p>
      <Field kind="text" label="이름" {...form.field('name')} />
      <Button type="submit" loading={form.submitting} aria-disabled={form.coolingDown || undefined}>
        저장
      </Button>
    </form>
  );
}
const mount = (onSubmit: () => Promise<void>) =>
  render(
    <ToastProvider>
      <Form onSubmit={onSubmit} />
    </ToastProvider>,
  );

describe('제출', () => {
  it('[AC-CM-24] 첫 클릭에서 버튼이 잠기고, 응답 전에 다시 눌러도 요청은 하나다', async () => {
    let finish: () => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    mount(onSubmit);
    const button = screen.getByRole('button', { name: '저장' });

    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    fireEvent.click(button);
    fireEvent.submit(button.closest('form')!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await act(async () => finish());
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });

  it('[AC-CM-26] 429를 받으면 문구를 알리고 Retry-After 동안 버튼을 잠근다. 시간이 지나면 풀린다', async () => {
    vi.useFakeTimers();
    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, '잠시 후 다시 시도해 주세요', null, null, 30))
      .mockResolvedValue(undefined);
    mount(onSubmit);
    const button = screen.getByRole('button', { name: '저장' });

    await act(async () => {
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('form-error').textContent).toBe('잠시 후 다시 시도해 주세요');
    expect(button.getAttribute('aria-disabled')).toBe('true');

    // 잠긴 동안에는 눌러도 보내지 않는다
    await act(async () => {
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(button.getAttribute('aria-disabled')).toBeNull();
    await act(async () => {
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('[AC-CM-26] 다른 실패는 버튼을 잠그지 않는다', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new ApiError('INTERNAL', 500, '일시적인 문제가 생겼어요')));
    mount(onSubmit);
    const button = screen.getByRole('button', { name: '저장' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('form-error').textContent).toContain('일시적인 문제가 생겼어요'));
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });
});

describe('입력 칸', () => {
  function Limited() {
    const form = useForm({ initial: { name: '' }, schema, onSubmit: () => Promise.resolve() });
    return <Field kind="nickname" label="닉네임" maxGraphemes={5} {...form.field('name')} />;
  }
  const mountField = () =>
    render(
      <ToastProvider>
        <Limited />
      </ToastProvider>,
    );

  it('[AC-CM-61] 손으로 친 글자는 길이를 넘어도 말없이 지우지 않는다', () => {
    mountField();
    const input = screen.getByLabelText<HTMLInputElement>('닉네임');
    fireEvent.change(input, { target: { value: '가나다라마바사' } });
    expect(input.value).toBe('가나다라마바사');
    expect(screen.queryByText('5자까지 입력할 수 있어요')).toBeNull();
  });

  it('[AC-CM-64] 붙여넣은 값이 길이를 넘으면 사용자가 느끼는 글자 단위로 잘라 넣고 알린다', () => {
    mountField();
    const input = screen.getByLabelText<HTMLInputElement>('닉네임');
    fireEvent.paste(input);
    // 가족 이모지는 여러 코드포인트지만 한 글자로 센다
    fireEvent.change(input, { target: { value: '가나👨‍👩‍👧다라마바' } });
    expect(input.value).toBe('가나👨‍👩‍👧다라');
    expect(screen.getByRole('status').textContent).toBe('5자까지 입력할 수 있어요');

    // 붙여넣기 뒤에 이어서 치는 글자는 다시 자르지 않는다
    fireEvent.change(input, { target: { value: '가나👨‍👩‍👧다라마' } });
    expect(input.value).toBe('가나👨‍👩‍👧다라마');
  });

  it('[AC-CM-60, 65] 칸 종류마다 자판 · 자동 완성 · 자동 고침 속성이 정해져 있다', () => {
    const attributes = (kind: FieldKind) => {
      const view = render(
        <ToastProvider>
          <Field kind={kind} name={kind} label={kind} value="" onChange={() => undefined} />
        </ToastProvider>,
      );
      const input = view.container.querySelector('input')!;
      const picked = Object.fromEntries(
        ['type', 'inputmode', 'autocomplete', 'autocapitalize', 'spellcheck', 'maxlength'].map((name) => [name, input.getAttribute(name)]),
      );
      view.unmount();
      return picked;
    };

    expect(attributes('email')).toEqual({
      type: 'email',
      inputmode: 'email',
      autocomplete: 'email',
      autocapitalize: 'off',
      spellcheck: 'false',
      maxlength: '254',
    });
    expect(attributes('newPassword')).toMatchObject({ type: 'password', autocomplete: 'new-password', maxlength: '64' });
    expect(attributes('currentPassword')).toMatchObject({ type: 'password', autocomplete: 'current-password' });
    expect(attributes('nickname')).toMatchObject({ type: 'text', autocomplete: 'nickname', autocapitalize: 'off', maxlength: null });
  });

  it('[AC-LI-08] 비밀번호 칸에서 Caps Lock이 켜져 있으면 안내가 뜨고, 칸을 떠나면 사라진다', () => {
    render(
      <ToastProvider>
        <Field kind="currentPassword" name="password" label="비밀번호" value="" onChange={() => undefined} />
      </ToastProvider>,
    );
    const input = screen.getByLabelText('비밀번호');
    fireEvent.keyUp(input, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock이 켜져 있어요')).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toContain('-caps');
    fireEvent.blur(input);
    expect(screen.queryByText('Caps Lock이 켜져 있어요')).toBeNull();
  });
});

describe('이탈 확인', () => {
  function Guarded({ dirty, onReady }: { dirty: boolean; onReady: (allow: () => void) => void }) {
    const leave = useLeaveGuard(dirty);
    onReady(leave.allow);
    return null;
  }
  const leaving = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('[AC-PC-04, AC-MP-10] 고친 내용이 있을 때만 브라우저가 확인하고, 저장했거나 나가기로 했으면 묻지 않는다', () => {
    let allow: () => void = () => undefined;
    const view = render(<Guarded dirty={false} onReady={(fn) => (allow = fn)} />);
    expect(leaving()).toBe(false);

    view.rerender(<Guarded dirty onReady={(fn) => (allow = fn)} />);
    expect(leaving()).toBe(true);

    allow();
    expect(leaving()).toBe(false);

    view.unmount();
    expect(leaving()).toBe(false);
  });
});
