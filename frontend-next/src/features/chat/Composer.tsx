'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import {
  checkMessage,
  clipGraphemes,
  countGraphemes,
  MESSAGE_COUNTER_FROM,
  MESSAGE_MAX,
  normalizeMessage,
} from '@neighbo/shared-schema';
import { useToast } from '@/components/Toast';

interface ComposerProps {
  onSend(content: string): void;
  // 보낼 수 없는 이유. 있으면 입력창을 잠그고 이 문구를 보여준다
  disabledReason: string | null;
  // 전송 한도에 걸려 잠시 보낼 수 없다 — 쓰던 글은 그대로 둔다 [AC-CH-33]
  blocked: boolean;
}

// 마우스 · 키보드 환경에서만 Enter로 보낸다. 터치 키보드의 Enter는 줄바꿈이다 [AC-CH-12]
function entersToSend(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: fine)').matches;
}

export function Composer({ onSend, disabledReason, blocked }: ComposerProps) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  const length = countGraphemes(value);
  const content = normalizeMessage(value);
  const sendable = disabledReason === null && !blocked && checkMessage(content) === null;

  const send = () => {
    // 빈 메시지 · 두 번째 Enter는 조용히 무시한다 [CH-CC-01]
    if (!sendable) return;
    onSend(content);
    setValue('');
    input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // 한글 조합 중의 Enter는 글자를 확정하는 키다 — 보내면 마지막 글자가 두 번 간다 [CH-IN-07]
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (!entersToSend()) return;
    event.preventDefault();
    send();
  };

  // 1~5줄로 늘어난다
  const rows = Math.min(5, Math.max(1, value.split('\n').length));

  return (
    <form
      className="flex flex-col gap-1 border-t border-divider bg-bg px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      {disabledReason !== null && <p className="text-sm text-text-muted">{disabledReason}</p>}
      {disabledReason === null && blocked && (
        <p role="status" className="text-sm text-text-muted">
          잠시 후 보낼 수 있어요
        </p>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          메시지 입력
        </label>
        <textarea
          id="chat-input"
          ref={input}
          rows={rows}
          value={value}
          disabled={disabledReason !== null}
          placeholder={disabledReason === null ? '메시지 보내기' : ''}
          aria-describedby={length >= MESSAGE_COUNTER_FROM ? 'chat-counter' : undefined}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            const next = event.target.value;
            if (countGraphemes(next) > MESSAGE_MAX) {
              // 넘치는 붙여넣기는 잘라 넣고 알린다 [CH-IN-06]
              setValue(clipGraphemes(next, MESSAGE_MAX));
              toast('1,000자까지 보낼 수 있어요');
              return;
            }
            setValue(next);
          }}
          className="min-h-touch flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-base disabled:bg-surface"
        />
        <button
          type="submit"
          aria-disabled={!sendable || undefined}
          className="inline-flex min-h-touch shrink-0 items-center rounded-lg bg-primary px-4 font-semibold text-on-primary aria-disabled:opacity-60"
        >
          보내기
        </button>
      </div>
      {length >= MESSAGE_COUNTER_FROM && (
        <p id="chat-counter" className="self-end text-xs text-text-muted">
          {length}/{MESSAGE_MAX}
        </p>
      )}
    </form>
  );
}
