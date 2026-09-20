import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { useToast } from './useToast';
import type { UseToastReturn } from './useToast';
import { ToastProvider } from '../../primitives/Toast';

describe('useToast', () => {
  it('돌려주는 객체는 리렌더 사이에 참조가 같다(의존성 배열에 넣어도 안전)', () => {
    const seen: UseToastReturn[] = [];
    function Probe({ tick }: { tick: number }) {
      seen.push(useToast());
      return <span>{tick}</span>;
    }
    const { rerender } = render(
      <ToastProvider>
        <Probe tick={0} />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <Probe tick={1} />
      </ToastProvider>,
    );
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toBe(seen[seen.length - 1]);
    expect(typeof seen[0]!.toast).toBe('function');
    expect(typeof seen[0]!.close).toBe('function');
  });

  it('Provider 밖에서 부르면 던진다(프로그래머 오류)', () => {
    function Bare() {
      useToast();
      return null;
    }
    expect(() => render(<Bare />)).toThrow();
  });
});
