import { describe, expect, it } from 'vitest';
import { loginSchema, signupSchema, toFieldErrors } from './auth';
import { countGraphemes, normalizeEmail, normalizeNickname, normalizePassword } from './normalize';

const valid = { email: 'kim@example.com', password: 'correct horse', passwordConfirm: 'correct horse', nickname: '김당근' };

function errors(input: Record<string, unknown>) {
  const result = signupSchema.safeParse({ ...valid, ...input });
  return result.success ? {} : toFieldErrors(result.error);
}

describe('정규화', () => {
  it('[AC-SU-06] 이메일은 공백 · 제로폭 문자 제거 → 전각을 반각으로 → 소문자', () => {
    expect(normalizeEmail('  Kim@Example.COM ')).toBe('kim@example.com');
    expect(normalizeEmail('kim​@example.com')).toBe('kim@example.com');
    expect(normalizeEmail('ｋｉｍ＠ｇｍａｉｌ．ｃｏｍ')).toBe('kim@gmail.com');
  });

  it('[AC-SU-09b, AC-LI-05b] 비밀번호는 제로폭 제거 + NFC, 앞뒤 공백은 로그인에서만 지운다', () => {
    const decomposed = '가'; // 자모로 풀린 "가"
    expect(normalizePassword(decomposed)).toBe('가');
    expect(normalizePassword(' pass​word ')).toBe(' password ');
    expect(normalizePassword(' password ', { trim: true })).toBe('password');
  });

  it('[SU-IN-44] 닉네임은 앞뒤 공백을 지우고 연속 공백을 하나로', () => {
    expect(normalizeNickname('  당근   마켓  ')).toBe('당근 마켓');
  });

  it('글자 수는 사용자가 느끼는 단위로 센다', () => {
    expect(countGraphemes('가나다')).toBe(3);
    expect(countGraphemes('👨‍👩‍👧')).toBe(1);
  });
});

describe('가입 스키마', () => {
  it('[AC-SU-01] 유효한 입력은 정규화된 값으로 통과한다', () => {
    const parsed = signupSchema.parse({ ...valid, email: ' KIM@Example.com', nickname: ' 김  당근 ' });
    expect(parsed.email).toBe('kim@example.com');
    expect(parsed.nickname).toBe('김 당근');
  });

  it('[AC-SU-05] 이메일: 비었음 · 형식 · 길이를 구분해 알린다', () => {
    expect(errors({ email: '' }).email).toBe('이메일을 입력해 주세요');
    expect(errors({ email: 'kim@' }).email).toBe('이메일 형식이 아니에요');
    expect(errors({ email: '김@example.com' }).email).toBe('이메일 형식이 아니에요');
    expect(errors({ email: `${'a'.repeat(250)}@example.com` }).email).toBe('이메일이 너무 길어요');
  });

  it('[AC-SU-09, 09a] 비밀번호: 길이 · 앞뒤 공백 · 72바이트', () => {
    const pw = (password: string) => errors({ password, passwordConfirm: password }).password;
    expect(pw('')).toBe('비밀번호를 입력해 주세요');
    expect(pw('short')).toBe('8자 이상 입력해 주세요');
    expect(pw(' password1')).toBe('비밀번호 앞뒤에 공백을 넣을 수 없어요');
    expect(pw('a'.repeat(65))).toBe('64자 이하로 입력해 주세요');
    // 한글 25자 = 75바이트 — 글자 수는 통과하지만 bcrypt 한계를 넘는다 (T-12)
    expect(pw('가'.repeat(25))).toMatch(/^비밀번호가 너무 길어요/);
    expect(pw('가'.repeat(24))).toBeUndefined();
    expect(pw('pass word 12')).toBeUndefined();
  });

  it('[AC-SU-09] 이메일 · 닉네임과 같은 비밀번호는 거부한다', () => {
    const same = 'kim@example.com';
    expect(errors({ password: same, passwordConfirm: same }).password).toBe(
      '이메일이나 닉네임과 같은 비밀번호는 쓸 수 없어요',
    );
    expect(errors({ nickname: 'longnick', password: 'LongNick', passwordConfirm: 'LongNick' }).password).toBeDefined();
  });

  it('[AC-SU-10] 확인이 다르면 확인 칸에 알린다', () => {
    expect(errors({ passwordConfirm: 'different1' })).toEqual({ passwordConfirm: '비밀번호가 일치하지 않아요' });
  });

  it('[AC-SU-13, 15] 닉네임: 길이 · 허용 문자 · 금칙어', () => {
    expect(errors({ nickname: '' }).nickname).toBe('닉네임을 입력해 주세요');
    expect(errors({ nickname: '김' }).nickname).toBe('2~12자로 입력해 주세요');
    expect(errors({ nickname: '가'.repeat(13) }).nickname).toBe('2~12자로 입력해 주세요');
    expect(errors({ nickname: '당근🥕' }).nickname).toBe('한글, 영문, 숫자, 공백, _ . - 만 쓸 수 있어요');
    expect(errors({ nickname: '관 리 자' }).nickname).toBe('사용할 수 없는 닉네임이에요');
    expect(errors({ nickname: 'Neighbo_팀' }).nickname).toBe('사용할 수 없는 닉네임이에요');
    expect(errors({ nickname: 'ㅋㅋㅋ' }).nickname).toBeUndefined();
    expect(errors({ nickname: '12345' }).nickname).toBeUndefined();
    expect(errors({ nickname: 'kim_dang.geun-1' }).nickname).toBe('2~12자로 입력해 주세요');
  });

  it('[AC-SU-17] 여러 칸이 틀리면 전부 알려준다', () => {
    expect(Object.keys(errors({ email: 'x', password: '1', passwordConfirm: '2', nickname: '' })).sort()).toEqual([
      'email',
      'nickname',
      'password',
      'passwordConfirm',
    ]);
    const missing = signupSchema.safeParse({});
    expect(missing.success).toBe(false);
  });
});

describe('로그인 스키마', () => {
  it('[AC-LI-05, 05a, 05b] 형식만 보고, 이메일 · 비밀번호를 정규화한다', () => {
    const parsed = loginSchema.parse({ email: ' KIM@example.com ', password: ' pw ' });
    expect(parsed).toEqual({ email: 'kim@example.com', password: 'pw' });
    const result = loginSchema.safeParse({ email: 'nope', password: '' });
    expect(result.success ? {} : toFieldErrors(result.error)).toEqual({
      email: '이메일 형식이 아니에요',
      password: '비밀번호를 입력해 주세요',
    });
  });
});

describe('UTF-8 바이트 수', () => {
  it('영문 1 · 한글 3 · 이모지 4바이트로 센다', async () => {
    const { utf8ByteLength } = await import('./normalize');
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('가')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('🥕')).toBe(4);
  });
});
