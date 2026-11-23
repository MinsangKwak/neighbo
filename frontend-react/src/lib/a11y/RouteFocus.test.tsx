import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteFocus } from './RouteFocus';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const screenOf = (title: string) => (
  <>
    <RouteFocus />
    <a href="/somewhere">링크</a>
    <h1>{title}</h1>
  </>
);

describe('경로 이동 포커스', () => {
  it('[AC-CM-41] 경로가 바뀌면 새 화면의 h1로 포커스를 옮긴다. 처음 열 때와 같은 경로에서는 옮기지 않는다', () => {
    pathname = '/';
    const view = render(screenOf('홈'));
    // 처음 열 때는 브라우저의 기본 위치를 둔다
    expect(document.activeElement).toBe(document.body);

    view.rerender(screenOf('홈'));
    expect(document.activeElement).toBe(document.body);

    pathname = '/products/p1';
    view.rerender(screenOf('원목 의자'));
    const heading = document.querySelector('h1');
    expect(document.activeElement).toBe(heading);
    // Tab 순서에는 넣지 않는다
    expect(heading?.getAttribute('tabindex')).toBe('-1');
  });

  it('[AC-CM-41] 새 화면이 스스로 포커스를 둔 곳이 있으면 빼앗지 않는다', () => {
    pathname = '/a';
    const withInput = (title: string) => (
      <>
        <RouteFocus />
        <h1>{title}</h1>
        <main>
          <input aria-label="메시지" />
        </main>
      </>
    );
    const view = render(withInput('가'));
    pathname = '/b';
    const input = document.querySelector('input');
    input?.focus();
    view.rerender(withInput('나'));
    expect(document.activeElement).toBe(input);
  });

  it('[AC-CM-41] 경로가 먼저 바뀌고 새 화면이 늦게 그려져도, 제목이 나타나면 옮긴다', async () => {
    pathname = '/';
    const loading = (
      <>
        <RouteFocus />
        <p>불러오는 중</p>
      </>
    );
    const view = render(screenOf('홈'));
    pathname = '/me';
    // 뼈대 화면 — 아직 제목이 없다
    view.rerender(loading);
    expect(document.activeElement).toBe(document.body);
    view.rerender(screenOf('마이'));
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('h1')));
  });
});
