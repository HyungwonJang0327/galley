import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from './ToastProvider';
import type { ToastProviderProps } from './ToastProvider';
import { useToast } from '../../hooks/useToast';
import type { ToastOptions } from '../../hooks/useToast';

// 띄우기 버튼 — 옵션은 data로 받아 클릭 때 toast()에 넘긴다.
function Fire({ label = '띄우기', ...options }: ToastOptions & { label?: string }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast(options)}>
      {label}
    </button>
  );
}

function CloseAll() {
  const { close } = useToast();
  return (
    <button type="button" onClick={() => close()}>
      모두 닫기
    </button>
  );
}

function setup(ui: ReactNode, props: Partial<ToastProviderProps> = {}) {
  return render(<ToastProvider {...props}>{ui}</ToastProvider>);
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider + useToast', () => {
  it('뷰포트는 role="region"이고 label이 접근성 이름이다(기본 "알림")', () => {
    setup(null);
    expect(screen.getByRole('region', { name: '알림' })).toBeTruthy();
  });

  it('aria-label로 뷰포트 이름을 바꿀 수 있다', () => {
    setup(null, { 'aria-label': 'Notifications' });
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeTruthy();
  });

  it('toast()를 부르면 title을 이름으로 하는 토스트가 뷰포트 안에 생긴다', async () => {
    setup(<Fire title="저장했습니다" description="방금 전" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await click(screen.getByRole('button', { name: '띄우기' }));
    const toast = await screen.findByRole('dialog', { name: '저장했습니다' });
    expect(screen.getByRole('region', { name: '알림' }).contains(toast)).toBe(true);
    expect(toast.textContent).toContain('방금 전');
  });

  it('제목은 heading이 아니다(문서 개요 오염 방지)', async () => {
    setup(<Fire title="제목" />);
    await click(screen.getByRole('button', { name: '띄우기' }));
    await screen.findByRole('dialog', { name: '제목' });
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('tone이 danger·warning이면 alertdialog(끼어들어 읽힘), info·success면 dialog', async () => {
    setup(
      <>
        <Fire label="danger" title="실패" tone="danger" />
        <Fire label="warning" title="주의" tone="warning" />
        <Fire label="success" title="성공" tone="success" />
        <Fire label="info" title="안내" />
      </>,
      { limit: 10 },
    );
    await click(screen.getByRole('button', { name: 'danger' }));
    await click(screen.getByRole('button', { name: 'warning' }));
    await click(screen.getByRole('button', { name: 'success' }));
    await click(screen.getByRole('button', { name: 'info' }));
    await waitFor(() => {
      expect(screen.getAllByRole('alertdialog', { hidden: true })).toHaveLength(2);
      expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);
    });
  });

  it('tone마다 루트 클래스가 다르고 type 속성으로 남는다', async () => {
    setup(
      <>
        <Fire label="a" title="A" tone="success" />
        <Fire label="b" title="B" tone="danger" />
      </>,
    );
    await click(screen.getByRole('button', { name: 'a' }));
    await click(screen.getByRole('button', { name: 'b' }));
    const a = await screen.findByRole('dialog', { name: 'A' });
    // high priority 토스트는 포커스 전까지 aria-hidden이라 이름으로 못 찾는다 — 역할로 찾아 본문으로 고른다.
    const b = (await screen.findAllByRole('alertdialog', { hidden: true })).find((el) =>
      el.textContent?.includes('B'),
    )!;
    expect(a.className).not.toBe(b.className);
    expect(a.getAttribute('data-type')).toBe('success');
    expect(b.getAttribute('data-type')).toBe('danger');
  });

  // Base UI는 닫기 버튼을 뷰포트가 펼쳐지기(hover·포커스) 전까지 aria-hidden으로 둔다 —
  // 보조 기술 사용자는 Esc·F6으로 다룬다. aria-hidden 요소는 role+name으로 못 찾으니 aria-label로 찾는다.
  it('닫기 버튼(closeLabel, 기본 "닫기")을 누르면 사라진다', async () => {
    setup(<Fire title="제목" />);
    await click(screen.getByRole('button', { name: '띄우기' }));
    const toast = await screen.findByRole('dialog', { name: '제목' });
    await click(screen.getByLabelText('닫기'));
    await waitFor(() => expect(toast.isConnected).toBe(false));
  });

  it('closeLabel로 닫기 버튼 이름을 바꿀 수 있다', async () => {
    setup(<Fire title="제목" />, { closeLabel: 'Dismiss' });
    await click(screen.getByRole('button', { name: '띄우기' }));
    await screen.findByRole('dialog', { name: '제목' });
    expect(screen.getByLabelText('Dismiss').tagName).toBe('BUTTON');
  });

  it('닫기 버튼은 뷰포트에 마우스를 올리면(펼침) 보조 기술에 드러난다', async () => {
    setup(<Fire title="제목" />);
    await click(screen.getByRole('button', { name: '띄우기' }));
    await screen.findByRole('dialog', { name: '제목' });
    const close = screen.getByLabelText('닫기');
    expect(close.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      fireEvent.mouseEnter(screen.getByRole('region', { name: '알림' }));
    });
    await waitFor(() => expect(close.getAttribute('aria-hidden')).not.toBe('true'));
  });

  it('Esc를 누르면 포커스된 토스트가 닫힌다', async () => {
    setup(<Fire title="제목" />);
    await click(screen.getByRole('button', { name: '띄우기' }));
    const toast = await screen.findByRole('dialog', { name: '제목' });
    await act(async () => {
      toast.focus();
      fireEvent.keyDown(toast, { key: 'Escape' });
    });
    await waitFor(() => expect(toast.isConnected).toBe(false));
  });

  it('close()를 인자 없이 부르면 전부 닫힌다, id를 주면 그것만', async () => {
    let ids: string[] = [];
    function Pair() {
      const { toast, close } = useToast();
      return (
        <>
          <button
            type="button"
            onClick={() => (ids = [toast({ title: '하나' }), toast({ title: '둘' })])}
          >
            둘 띄우기
          </button>
          <button type="button" onClick={() => close(ids[0])}>
            첫째 닫기
          </button>
        </>
      );
    }
    setup(
      <>
        <Pair />
        <CloseAll />
      </>,
    );
    await click(screen.getByRole('button', { name: '둘 띄우기' }));
    await screen.findByRole('dialog', { name: '하나' });
    await screen.findByRole('dialog', { name: '둘' });

    await click(screen.getByRole('button', { name: '첫째 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '하나' })).toBeNull());
    expect(screen.getByRole('dialog', { name: '둘' })).toBeTruthy();

    await click(screen.getByRole('button', { name: '모두 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('duration이 지나면 자동으로 닫힌다, 0이면 남아 있다', async () => {
    vi.useFakeTimers();
    setup(
      <>
        <Fire label="짧게" title="잠깐" duration={1000} />
        <Fire label="영구" title="계속" duration={0} />
      </>,
    );
    await click(screen.getByRole('button', { name: '짧게' }));
    await click(screen.getByRole('button', { name: '영구' }));
    expect(screen.getByRole('dialog', { name: '잠깐' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '계속' })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.queryByRole('dialog', { name: '잠깐' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '계속' })).toBeTruthy();
  });

  it('Provider timeout이 기본이고 toast의 duration이 우선한다', async () => {
    vi.useFakeTimers();
    setup(
      <>
        <Fire label="기본" title="기본" />
        <Fire label="길게" title="길게" duration={5000} />
      </>,
      { timeout: 1000 },
    );
    await click(screen.getByRole('button', { name: '기본' }));
    await click(screen.getByRole('button', { name: '길게' }));
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.queryByRole('dialog', { name: '기본' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '길게' })).toBeTruthy();
  });

  it('limit을 넘으면 오래된 토스트에 data-limited가 붙는다(지우지 않고 숨김)', async () => {
    setup(<Fire title="n" />, { limit: 2 });
    const button = screen.getByRole('button', { name: '띄우기' });
    await click(button);
    await click(button);
    await click(button);
    await waitFor(() => {
      const all = screen.getAllByRole('dialog', { hidden: true });
      expect(all).toHaveLength(3);
      expect(all.filter((el) => el.hasAttribute('data-limited'))).toHaveLength(1);
    });
  });

  it('F6을 누르면 뷰포트로 포커스가 간다(Base UI 전역 리스너)', async () => {
    setup(<Fire title="제목" />);
    await click(screen.getByRole('button', { name: '띄우기' }));
    await screen.findByRole('dialog', { name: '제목' });
    const region = screen.getByRole('region', { name: '알림' });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'F6' });
    });
    expect(document.activeElement).toBe(region);
  });

  it('description이 없으면 설명 요소도 aria-describedby도 없다', async () => {
    setup(<Fire title="제목만" />);
    await click(screen.getByRole('button', { name: '띄우기' }));
    const toast = await screen.findByRole('dialog', { name: '제목만' });
    expect(toast.querySelector('p')).toBeNull();
    expect(toast.getAttribute('aria-describedby')).toBeNull();
  });

  it('뷰포트에 마우스를 올리면 자동 닫힘 타이머가 멈추고, 떼면 다시 간다', async () => {
    vi.useFakeTimers();
    setup(<Fire title="잠깐" duration={1000} />);
    await click(screen.getByRole('button', { name: '띄우기' }));
    const region = screen.getByRole('region', { name: '알림' });
    await act(async () => {
      fireEvent.mouseEnter(region);
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('dialog', { name: '잠깐' })).toBeTruthy();

    await act(async () => {
      fireEvent.mouseLeave(region);
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.queryByRole('dialog', { name: '잠깐' })).toBeNull();
  });

  it('position에 따라 뷰포트 클래스가 달라진다', () => {
    const { unmount } = setup(null);
    const top = screen.getByRole('region', { name: '알림' }).className;
    unmount();
    setup(null, { position: 'bottom-right' });
    expect(screen.getByRole('region', { name: '알림' }).className).not.toBe(top);
  });
});
