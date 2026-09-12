import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardError from './error';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardError', () => {
  it('되돌아갈 길(다시 시도)을 준다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    render(<DashboardError error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('내부 사정을 화면에 드러내지 않는다(콘솔로만)', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('SQLITE_BUSY /Users/someone/blog/주제_큐.md'), {
      digest: 'abc123',
    });

    render(<DashboardError error={error} reset={() => {}} />);

    expect(document.body.textContent).not.toContain('SQLITE_BUSY');
    expect(document.body.textContent).not.toContain('/Users/');
    expect(document.body.textContent).not.toContain('abc123');
    expect(logged).toHaveBeenCalledWith(error);
  });
});
