import { z } from 'zod';
import {
  countGraphemes,
  normalizeEmail,
  normalizeNickname,
  normalizePassword,
  utf8ByteLength,
} from './normalize';
import { userSelfSchema } from './user';

// 칸마다 오류 문구 하나만 돌려준다 — 가장 먼저 고쳐야 할 것부터
type Check = (value: string) => string | null;

function field(normalize: (raw: string) => string, check: Check) {
  return z
    .string({ error: '값을 입력해 주세요' })
    .transform(normalize)
    .superRefine((value, ctx) => {
      const message = check(value);
      if (message !== null) ctx.addIssue({ code: 'custom', message });
    });
}

export const EMAIL_MAX = 254;
const EMAIL_FORMAT = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

// [AC-SU-05, 06] 정규화 후 ASCII 이메일만
export const checkEmail: Check = (email) => {
  if (email === '') return '이메일을 입력해 주세요';
  if (email.length > EMAIL_MAX) return '이메일이 너무 길어요';
  if (!EMAIL_FORMAT.test(email)) return '이메일 형식이 아니에요';
  return null;
};

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;
// bcrypt는 앞 72바이트만 쓴다 (T-12)
export const PASSWORD_MAX_BYTES = 72;

// [AC-SU-09, 09a] 길이 규칙만 — 문자 종류 규칙은 없다
export const checkNewPassword: Check = (password) => {
  if (password === '') return '비밀번호를 입력해 주세요';
  if (password !== password.trim()) return '비밀번호 앞뒤에 공백을 넣을 수 없어요';
  const length = [...password].length;
  if (length < PASSWORD_MIN) return '8자 이상 입력해 주세요';
  if (length > PASSWORD_MAX) return '64자 이하로 입력해 주세요';
  if (utf8ByteLength(password) > PASSWORD_MAX_BYTES) {
    return '비밀번호가 너무 길어요. 한글 · 이모지는 영문보다 길이를 많이 차지해요';
  }
  return null;
};

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;
const NICKNAME_CHARS = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 _.-]+$/;
// 운영자 사칭을 막는 소규모 목록 [AC-SU-15]
// '데모'는 둘러보기 계정의 닉네임을 먼저 차지하지 못하게 막는다
const NICKNAME_BANNED = ['관리자', '운영자', '고객센터', '데모', 'neighbo', 'admin'];

// [AC-SU-13, 15]
export const checkNickname: Check = (nickname) => {
  if (nickname === '') return '닉네임을 입력해 주세요';
  const length = countGraphemes(nickname);
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return '2~12자로 입력해 주세요';
  if (!NICKNAME_CHARS.test(nickname)) return '한글, 영문, 숫자, 공백, _ . - 만 쓸 수 있어요';
  const compact = nickname.toLowerCase().replace(/[ _.-]/g, '');
  if (NICKNAME_BANNED.some((word) => compact.includes(word))) return '사용할 수 없는 닉네임이에요';
  return null;
};

// 중복 판단용 — Kim과 kim은 같은 닉네임이다 [AC-SU-14]
export function nicknameKey(nickname: string): string {
  return nickname.toLowerCase();
}

export const emailField = field(normalizeEmail, checkEmail);
export const nicknameField = field(normalizeNickname, checkNickname);
export const newPasswordField = field(normalizePassword, checkNewPassword);

// 서비스 도메인의 주소는 가입에 쓸 수 없다 — 둘러보기 계정(demo@neighbo.app)의 자리다
const RESERVED_EMAIL_DOMAIN = '@neighbo.app';

// POST /auth/signup
export const signupSchema = z
  .object({
    email: emailField.refine((email) => !email.endsWith(RESERVED_EMAIL_DOMAIN), '사용할 수 없는 이메일이에요'),
    password: newPasswordField,
    passwordConfirm: z.string({ error: '비밀번호를 한 번 더 입력해 주세요' }).transform((v) => normalizePassword(v)),
    nickname: nicknameField,
  })
  .superRefine((value, ctx) => {
    // 교차 검증 — 확인 칸의 오류는 확인 칸에 [AC-SU-10]
    if (value.passwordConfirm !== value.password) {
      ctx.addIssue({ code: 'custom', path: ['passwordConfirm'], message: '비밀번호가 일치하지 않아요' });
    }
    const password = value.password.toLowerCase();
    if (password === value.email || password === nicknameKey(value.nickname)) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: '이메일이나 닉네임과 같은 비밀번호는 쓸 수 없어요',
      });
    }
  });
export type SignupInput = z.infer<typeof signupSchema>;

// POST /auth/login — 형식만 본다. 비밀번호 규칙은 검사하지 않는다 [AC-LI-05]
export const loginSchema = z.object({
  email: emailField,
  password: field(
    (raw) => normalizePassword(raw, { trim: true }),
    (password) => (password === '' ? '비밀번호를 입력해 주세요' : null),
  ),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const emailAvailableQuerySchema = z.object({ email: emailField });
export const nicknameAvailableQuerySchema = z.object({ nickname: nicknameField });

export const authResponseSchema = z.object({ user: userSelfSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const availabilityResponseSchema = z.object({
  available: z.boolean(),
  // available=false면 칸 아래 그대로 보일 문구
  message: z.string().nullable(),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

// Zod 오류를 칸별 문구로 — 칸마다 첫 오류 하나, 실패한 칸 전부 [AC-CM-11]
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    fields[key] ??= issue.message;
  }
  return fields;
}

export const SESSION_COOKIE = 'nb_session';
