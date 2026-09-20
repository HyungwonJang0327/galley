import { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useToast } from './useToast';
import type { UseToastReturn } from './useToast';
import { ToastProvider } from '../../primitives/Toast';

describe('useToast', () => {
  it('돌려주는 객체는 리렌더·토스트 추가·닫힘 뒤에도 참조가 같다(의존성 배열에 넣어도 안전)', async () => {
    const seen: UseToastReturn[] = [];
    function Probe({ tick }: { tick: number }) {
      const api = useToast();
      seen.push(api);
      return (
        <>
          <span>{tick}</span>
          <button type="button" onClick={() => api.toast({ title: '하나' })}>
            띄우기
          </button>
          <button type="button" onClick={() => api.close()}>
            닫기
          </button>
        </>
      );
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
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '띄우기' }));
    });
    await screen.findByRole('dialog', { name: '하나' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(
      <ToastProvider>
        <Probe tick={2} />
      </ToastProvider>,
    );
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(1);
  });

  it('토스트가 뜨고 닫혀도 useToast를 쓰는 컴포넌트는 리렌더되지 않는다', async () => {
    const renders = vi.fn();
    function Consumer() {
      renders();
      const { toast, close } = useToast();
      return (
        <>
          <button type="button" onClick={() => toast({ title: '하나' })}>
            띄우기
          </button>
          <button type="button" onClick={() => close()}>
            닫기
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );
    const before = renders.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '띄우기' }));
    });
    await screen.findByRole('dialog', { name: '하나' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(renders.mock.calls.length).toBe(before);
  });

  it('자식의 마운트 effect에서 띄운 토스트도 뜬다(Provider 구독 전 명령을 모아 둠)', async () => {
    function OnMount() {
      const { toast } = useToast();
      useEffect(() => {
        toast({ title: '마운트 알림' });
      }, [toast]);
      return null;
    }
    render(
      <ToastProvider>
        <OnMount />
      </ToastProvider>,
    );
    expect(await screen.findByRole('dialog', { name: '마운트 알림' })).toBeTruthy();
  });

  it('마운트 effect에서 띄우고 바로 닫아도 id가 맞아 닫힌다', async () => {
    function OnMount() {
      const { toast, close } = useToast();
      useEffect(() => {
        const id = toast({ title: '잠깐' });
        close(id);
      }, [toast, close]);
      return <span>준비</span>;
    }
    render(
      <ToastProvider>
        <OnMount />
      </ToastProvider>,
    );
    await screen.findByText('준비');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Provider 밖에서 부르면 던진다(프로그래머 오류)', () => {
    function Bare() {
      useToast();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/ToastProvider/);
  });
});
