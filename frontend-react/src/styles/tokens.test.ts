// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 토큰 조합별 명암비 표 — 색 값을 바꾸면 이 검사가 조건을 다시 확인한다 [AC-CM-46, AC-CM-40]
const css = readFileSync(join(import.meta.dirname, 'globals.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (match?.[1] === undefined) throw new Error(`토큰이 없다: ${name}`);
  return match[1];
}

// WCAG 2.x 상대 휘도
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('디자인 토큰 명암비', () => {
  // 글자 / 배경
  const TEXT_PAIRS = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['text-muted', 'bg'],
    ['text-muted', 'surface'],
    ['primary', 'bg'],
    ['primary', 'surface'],
    ['danger', 'bg'],
    ['danger', 'surface'],
    ['on-primary', 'primary'],
    ['on-danger', 'danger'],
    ['on-badge', 'badge'],
  ] as const;

  it.each(TEXT_PAIRS)('[AC-CM-46] 본문 글자 %s / %s 는 4.5:1 이상이다', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  // 경계 · 포커스 링 / 배경
  const UI_PAIRS = [
    ['border', 'bg'],
    ['border', 'surface'],
    ['focus', 'bg'],
    ['focus', 'surface'],
    ['primary', 'bg'],
    ['badge', 'bg'],
  ] as const;

  it.each(UI_PAIRS)('[AC-CM-46, AC-CM-40] UI 경계 %s / %s 는 3:1 이상이다', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
