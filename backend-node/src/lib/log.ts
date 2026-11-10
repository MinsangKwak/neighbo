// stdout에 한 줄 JSON — 근거: docs/architecture/backend.md 08절 2. 로그 형식
// 라이브러리 없이 시작하고, 필요해지면 pino를 결정 기록과 함께 들인다

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export function createLogger(minLevel: LogLevel, write: (line: string) => void = console.log): Logger {
  const emit = (lvl: LogLevel, msg: string, fields: LogFields = {}) => {
    if (LEVELS[lvl] < LEVELS[minLevel]) return;
    write(JSON.stringify({ t: new Date().toISOString(), lvl, msg, ...fields }));
  };
  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  };
}
