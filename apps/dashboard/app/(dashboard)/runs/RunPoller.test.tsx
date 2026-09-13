import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { RunPoller } from './RunPoller';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

// 라우터 컨텍스트 대신 refresh만 본다. 폴링 결과는 서버 재렌더 요청으로만 나타난다.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const POLL_MS = 2000;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RunPoller', () => {
  it('running이면 2초마다 refresh', () => {
    render(<RunPoller active />);

    expect(refresh).not.toHaveBeenCalled();
    tick(POLL_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('running이 아니면 부르지 않는다', () => {
    render(<RunPoller active={false} />);

    tick(POLL_MS * 3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('running → 아님으로 바뀌면 한 번 더 부르고 멈춘다', () => {
    const { rerender } = render(<RunPoller active />);
    tick(POLL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender(<RunPoller active={false} />);
    expect(refresh).toHaveBeenCalledTimes(2);

    tick(POLL_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('처음부터 running이 아니면 마운트 시 부르지 않는다', () => {
    const { rerender } = render(<RunPoller active={false} />);
    rerender(<RunPoller active={false} />);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('hidden이면 멈춘다', () => {
    render(<RunPoller active />);
    tick(POLL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    tick(POLL_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('visible로 돌아오면 즉시 한 번 부르고 재개', () => {
    render(<RunPoller active />);
    setVisibility('hidden');
    expect(refresh).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(refresh).toHaveBeenCalledTimes(1);

    tick(POLL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('hidden 상태로 마운트되면 타이머를 걸지 않는다', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    render(<RunPoller active />);

    tick(POLL_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('언마운트하면 타이머와 리스너를 정리한다', () => {
    const { unmount } = render(<RunPoller active />);
    unmount();

    tick(POLL_MS * 2);
    setVisibility('hidden');
    setVisibility('visible');
    expect(refresh).not.toHaveBeenCalled();
  });
});
