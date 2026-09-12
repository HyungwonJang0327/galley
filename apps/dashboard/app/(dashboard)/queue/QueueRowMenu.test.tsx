import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueueRowMenu } from './QueueRowMenu';

function openMenu(name = '첫 주제 메뉴') {
  const trigger = screen.getByRole('button', { name });
  fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger);
  return trigger;
}

function press(element: HTMLElement) {
  fireEvent.pointerDown(element, { pointerType: 'mouse', button: 0 });
  fireEvent.click(element);
}

const props = { title: '첫 주제', status: '대기' as const, index: 2 };

describe('QueueRowMenu', () => {
  it('현재 섹션을 뺀 이동 항목과 비활성 "지금 실행"을 보여 준다', async () => {
    render(<QueueRowMenu {...props} move={vi.fn()} />);
    openMenu();

    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '후보로',
      '보류로',
      '지금 실행',
    ]);
    expect(screen.getByRole('menuitem', { name: '지금 실행' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('이동 항목을 고르면 지금 섹션·위치·제목과 함께 move를 부른다', async () => {
    const move = vi.fn().mockResolvedValue({ ok: true });
    render(<QueueRowMenu {...props} move={move} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    press(screen.getByRole('menuitem', { name: '보류로' }));

    await waitFor(() =>
      expect(move).toHaveBeenCalledWith({ from: '대기', to: '보류', index: 2, title: '첫 주제' }),
    );
  });

  it('이동이 실패하면 사유를 알린다', async () => {
    const move = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'TOPIC_MISMATCH', message: '주제_큐.md가 그새 바뀌었습니다.' },
    });
    render(<QueueRowMenu {...props} move={move} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    press(screen.getByRole('menuitem', { name: '후보로' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('주제_큐.md가 그새 바뀌었습니다.'),
    );
  });

  it('요청 자체가 던지면 다시 시도하라고 알린다', async () => {
    const move = vi.fn().mockRejectedValue(new Error('network'));
    render(<QueueRowMenu {...props} move={move} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    press(screen.getByRole('menuitem', { name: '후보로' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('이동 요청이 실패했습니다'),
    );
  });

  it('비활성 "지금 실행"을 눌러도 move를 부르지 않는다', async () => {
    const move = vi.fn();
    render(<QueueRowMenu {...props} move={move} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    press(screen.getByRole('menuitem', { name: '지금 실행' }));

    expect(move).not.toHaveBeenCalled();
  });
});
