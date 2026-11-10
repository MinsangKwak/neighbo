import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('[AC-PL-10] 제목을 문단으로 보여주고 제목 구조에 끼어들지 않는다', () => {
    render(<EmptyState title="아직 올라온 물건이 없어요" />);
    expect(screen.getByText('아직 올라온 물건이 없어요').tagName).toBe('P');
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('설명과 행동은 줄 때만 그린다', () => {
    const { rerender } = render(<EmptyState title="비어 있어요" />);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<EmptyState title="비어 있어요" description="설명" action={<a href="/products/new">첫 물건 올리기</a>} />);
    expect(screen.getByText('설명')).toBeDefined();
    expect(screen.getByRole('link', { name: '첫 물건 올리기' })).toBeDefined();
  });
});
