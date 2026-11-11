import { describe, expect, it } from 'vitest';
import { clipGraphemes, countGraphemes, normalizeEmail, normalizeNickname, normalizePassword, normalizeText } from './index';

describe('글자 수', () => {
  it('AC-CM-53 길이는 사용자가 한 글자로 느끼는 단위로 센다 — 한글 · 결합 문자 · 이모지', () => {
    expect(countGraphemes('가나다')).toBe(3);
    // 자모가 풀려 있어도(NFD) 한 글자다
    expect(countGraphemes('가'.normalize('NFD'))).toBe(1);
    // 가족 이모지는 코드포인트 다섯 개, 글자 하나다
    expect(countGraphemes('👨‍👩‍👧')).toBe(1);
    expect('👨‍👩‍👧'.length).toBe(8);
    expect(countGraphemes('é')).toBe(1);
  });

  it('AC-CM-64 자를 때도 같은 단위로 잘라 글자가 깨지지 않는다', () => {
    expect(clipGraphemes('가나👨‍👩‍👧다라', 3)).toBe('가나👨‍👩‍👧');
    expect(clipGraphemes('가나다', 5)).toBe('가나다');
    expect(clipGraphemes('가나다', 0)).toBe('');
    expect(countGraphemes(clipGraphemes('👍🏽'.repeat(10), 4))).toBe(4);
  });
});

describe('정규화', () => {
  it('AC-CM-63 이메일 · 비밀번호 · 글 · 닉네임의 정규화는 이 패키지 한 곳에 있고 화면과 서버가 같은 것을 쓴다', () => {
    expect(normalizeEmail('  Kim@Example.COM ')).toBe('kim@example.com');
    // 비밀번호는 가운데 공백과 대소문자를 건드리지 않는다
    expect(normalizePassword('  Correct Horse  ')).toBe('  Correct Horse  ');
    expect(normalizePassword('  Correct Horse  ', { trim: true })).toBe('Correct Horse');
    expect(normalizeText('  원목​ 의자  ')).toBe('원목 의자');
    expect(normalizeNickname('  김   당근 ')).toBe('김 당근');
  });

  it('AC-CM-52 여러 줄 글은 줄바꿈을 남기고 줄 끝 공백과 제로폭 문자만 지운다', () => {
    expect(normalizeText(' 첫 줄 \n둘째 줄​ ', { multiline: true })).toBe('첫 줄\n둘째 줄');
  });
});
