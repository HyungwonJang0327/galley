import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MissingTopicsNotice } from './MissingTopicsNotice';

const TOPIC = {
  id: 't1',
  title: '무한 스크롤 (spacehome)',
  missingSince: '2026-09-12T01:02:03.000Z',
  runCount: 2,
};

const ok = () => vi.fn().mockResolvedValue({ ok: true });

describe('MissingTopicsNotice', () => {
  it('확인 대기가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<MissingTopicsNotice topics={[]} moveToHold={ok()} keep={ok()} />);

    // jest-dom 매처를 쓰지 않는 리포라 DOM으로 직접 본다.
    expect(container.innerHTML).toBe('');
  });

  it('주제와 실행 수를 보여준다', () => {
    render(<MissingTopicsNotice topics={[TOPIC]} moveToHold={ok()} keep={ok()} />);

    expect(screen.getByText('무한 스크롤 (spacehome)')).toBeTruthy();
    expect(screen.getByText('실행 2건')).toBeTruthy();
  });

  it('보류로 옮기기는 그 주제 id로 부른다', async () => {
    const moveToHold = ok();
    render(<MissingTopicsNotice topics={[TOPIC]} moveToHold={moveToHold} keep={ok()} />);

    fireEvent.click(screen.getByRole('button', { name: '보류로 옮기기' }));

    await waitFor(() => expect(moveToHold).toHaveBeenCalledWith('t1'));
  });

  it('그대로 두기는 다른 액션을 부른다', async () => {
    const keep = ok();
    const moveToHold = ok();
    render(<MissingTopicsNotice topics={[TOPIC]} moveToHold={moveToHold} keep={keep} />);

    fireEvent.click(screen.getByRole('button', { name: '그대로 두기' }));

    await waitFor(() => expect(keep).toHaveBeenCalledWith('t1'));
    expect(moveToHold).not.toHaveBeenCalled();
  });

  it('실패하면 문구를 alert으로 남긴다', async () => {
    const moveToHold = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'TOPIC_DONE', message: '발행까지 끝난 주제입니다.' },
    });
    render(<MissingTopicsNotice topics={[TOPIC]} moveToHold={moveToHold} keep={ok()} />);

    fireEvent.click(screen.getByRole('button', { name: '보류로 옮기기' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('발행까지 끝난 주제입니다.'),
    );
  });
});
