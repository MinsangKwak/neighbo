// 앱 안 이동의 이탈 확인 — App Router에는 이동을 막는 공식 API가 없어 이동하는 쪽이 먼저 묻는다 [AC-PC-04, AC-NT-05]
// 켜진 가드는 폼마다 하나, 확인을 기다리는 이동은 한 번에 하나다 (F05 5절)

interface Guard {
  allowed: boolean;
}

const guards = new Set<Guard>();
const listeners = new Set<() => void>();
let pending: (() => void) | null = null;

const emit = () => {
  for (const listener of listeners) listener();
};

// 저장하거나 나가기로 정한 가드는 더 묻지 않는다
const blocking = () => Array.from(guards).some((guard) => !guard.allowed);

export const leaveGuard = {
  register(guard: Guard): () => void {
    guards.add(guard);
    return () => {
      guards.delete(guard);
      // 확인을 기다리던 폼이 사라졌으면 물을 이유도 없다
      if (pending !== null && !blocking()) {
        pending = null;
        emit();
      }
    };
  },
  isBlocking: blocking,
  // 고친 내용이 있으면 확인 창을 띄우고, 없으면 바로 이동한다
  request(go: () => void): void {
    if (!blocking()) {
      go();
      return;
    }
    pending = go;
    emit();
  },
  confirm(): void {
    const go = pending;
    pending = null;
    for (const guard of guards) guard.allowed = true;
    emit();
    go?.();
  },
  cancel(): void {
    pending = null;
    emit();
  },
  isPending: (): boolean => pending !== null,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
