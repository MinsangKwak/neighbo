import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Carousel } from '@/features/products/Carousel';
import { Dialog } from './Dialog';
import { ToastProvider, useToast } from './Toast';

afterEach(() => vi.useRealTimers());

describe('토스트', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <>
        <button type="button" onClick={() => toast('저장했어요')}>
          알림
        </button>
        <button type="button" onClick={() => toast('실패했어요', 'error')}>
          오류
        </button>
      </>
    );
  }

  it('[AC-CM-43] 정보는 role="status", 오류는 role="alert"로 알리고 포커스를 옮기지 않는다', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const info = screen.getByRole('button', { name: '알림' });
    info.focus();
    fireEvent.click(info);
    expect(screen.getByRole('status').textContent).toBe('저장했어요');
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(document.activeElement).toBe(info);

    fireEvent.click(screen.getByRole('button', { name: '오류' }));
    expect(screen.getByRole('alert').textContent).toBe('실패했어요');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('[AC-CM-43] 4초 뒤 사라지지만, 마우스를 올려 둔 동안에는 사라지지 않는다', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '알림' }));
    fireEvent.mouseEnter(screen.getByText('저장했어요'));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByText('저장했어요')).toBeTruthy();

    fireEvent.mouseLeave(screen.getByText('저장했어요'));
    act(() => void vi.advanceTimersByTime(4_000));
    expect(screen.queryByText('저장했어요')).toBeNull();
  });
});

describe('대화 상자', () => {
  it('[AC-CM-42, AC-PX-02] 네이티브 dialog를 모달로 열고, 사용자가 닫으면 알린다. 확인 창은 alertdialog다', () => {
    const onClose = vi.fn();
    const view = render(
      <Dialog open={false} onClose={onClose} title="삭제할까요?" alert>
        <button type="button">취소</button>
      </Dialog>,
    );
    const dialog = view.container.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(false);

    view.rerender(
      <Dialog open onClose={onClose} title="삭제할까요?" alert>
        <button type="button">취소</button>
      </Dialog>,
    );
    // showModal()로 열어야 브라우저가 포커스를 가두고 Esc로 닫고 연 요소로 돌려보낸다
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('삭제할까요?');

    // Esc는 dialog의 close 이벤트로 온다
    dialog.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('[AC-CM-42] 코드가 닫은 경우(작업 성공)는 사용자의 취소로 알리지 않는다', () => {
    const onClose = vi.fn();
    const view = render(
      <Dialog open onClose={onClose} title="제목">
        내용
      </Dialog>,
    );
    view.rerender(
      <Dialog open={false} onClose={onClose} title="제목">
        내용
      </Dialog>,
    );
    expect(view.container.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('사진 캐러셀', () => {
  const images = [
    { id: 'i1', url: '/a.webp', thumbnailUrl: '/a.thumb.webp', width: 1200, height: 900 },
    { id: 'i2', url: '/b.webp', thumbnailUrl: '/b.thumb.webp', width: 900, height: 1200 },
  ];

  it('[AC-PD-17, AC-CM-45] 캐러셀 역할과 "N장 중 M번째" 이름이 있고, 대표 사진의 alt는 상품 제목, 기호 버튼에는 이름이 있다', () => {
    render(<Carousel images={images} title="원목 의자" />);
    const region = screen.getByRole('region', { name: '물건 사진' });
    expect(region.getAttribute('aria-roledescription')).toBe('carousel');
    expect(screen.getByLabelText('2장 중 1번째').getAttribute('aria-roledescription')).toBe('slide');
    expect(screen.getByLabelText('2장 중 2번째')).toBeTruthy();
    expect(screen.getByAltText('원목 의자')).toBeTruthy();
    expect(screen.getByAltText('원목 의자 사진 2')).toBeTruthy();
    // ‹ › 만 보이는 버튼
    expect(screen.getByRole('button', { name: '이전 사진' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: '다음 사진' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('[AC-PD-24] 사진마다 서버가 준 크기를 적어 불러오는 동안 자리가 밀리지 않는다', () => {
    render(<Carousel images={images} title="원목 의자" />);
    const second = screen.getByAltText('원목 의자 사진 2');
    expect([second.getAttribute('width'), second.getAttribute('height')]).toEqual(['900', '1200']);
  });

  it('[AC-PD-17] 사진을 누르면 전체 화면 뷰어가 열리고, 넘기고, 닫을 수 있다', () => {
    const view = render(<Carousel images={images} title="원목 의자" />);
    const viewer = view.container.querySelector('dialog')!;
    expect(viewer.hasAttribute('open')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '사진 1 크게 보기' }));
    expect(viewer.hasAttribute('open')).toBe(true);
    expect(viewer.textContent).toContain('1 / 2');

    fireEvent.click(screen.getByRole('button', { name: '다음 사진 크게 보기' }));
    expect(viewer.textContent).toContain('2 / 2');
    expect(viewer.querySelector('img')?.getAttribute('alt')).toBe('원목 의자 사진 2');

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(viewer.hasAttribute('open')).toBe(false);
  });

  it('사진이 없으면 자리만 둔다', () => {
    render(<Carousel images={[]} title="원목 의자" />);
    expect(screen.getByText('사진 없음')).toBeTruthy();
  });
});
