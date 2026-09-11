import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QueueReloadResult } from '../../../lib/queue-reload';
import { ReloadQueueButton } from './ReloadQueueButton';

const LABEL = '파일에서 다시 불러오기';

describe('ReloadQueueButton', () => {
  it('누르기 전에는 결과 문구가 없다', () => {
    render(<ReloadQueueButton reload={vi.fn()} />);
    expect(screen.getByRole('button', { name: LABEL })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('누르면 reload를 부르고 요약을 알린다', async () => {
    const reload = vi.fn().mockResolvedValue({ ok: true, data: { summary: '요약 문장' } });
    render(<ReloadQueueButton reload={reload} />);

    fireEvent.click(screen.getByRole('button', { name: LABEL }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('요약 문장'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('적재가 실패하면 실패 사유를 알린다', async () => {
    const reload = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '루트 .env에 BLOG_DIR이 없습니다.' },
    });
    render(<ReloadQueueButton reload={reload} />);

    fireEvent.click(screen.getByRole('button', { name: LABEL }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('루트 .env에 BLOG_DIR이 없습니다.'),
    );
  });

  it('요청 자체가 던지면 다시 누르라고 알린다', async () => {
    const reload = vi.fn().mockRejectedValue(new Error('network'));
    render(<ReloadQueueButton reload={reload} />);

    fireEvent.click(screen.getByRole('button', { name: LABEL }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('갱신 요청이 실패했습니다'),
    );
  });

  it('진행 중에는 버튼이 비활성이고 라벨이 바뀐다', async () => {
    let finish: (result: QueueReloadResult) => void = () => {};
    const reload = vi.fn(
      () =>
        new Promise<QueueReloadResult>((resolve) => {
          finish = resolve;
        }),
    );
    render(<ReloadQueueButton reload={reload} />);

    fireEvent.click(screen.getByRole('button', { name: LABEL }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '불러오는 중…' }).hasAttribute('disabled')).toBe(
        true,
      ),
    );
    finish({ ok: true, data: { summary: '끝' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: LABEL }).hasAttribute('disabled')).toBe(false),
    );
  });
});
