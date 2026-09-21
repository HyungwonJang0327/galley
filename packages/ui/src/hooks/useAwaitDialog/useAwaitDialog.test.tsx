import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useAwaitDialog } from './useAwaitDialog';
import type { AwaitDialogRender, AwaitDialogRenderProps } from './useAwaitDialog';
import { Dialog } from '../../primitives/Dialog';

type Pick = 'a' | 'b' | 'cancel';

// 렌더 함수: Dialog에 open·onOpenChange를 그대로 넘기고 버튼 둘로 값을 돌려준다.
const pickRender: AwaitDialogRender<Pick> = ({ open, onOpenChange, resolve, cancel }) => (
  <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="고르세요"
    footer={
      <>
        <button type="button" onClick={cancel}>
          취소
        </button>
        <button type="button" onClick={() => resolve('a')}>
          A
        </button>
        <button type="button" onClick={() => resolve('b')}>
          B
        </button>
      </>
    }
  />
);

// 소비자: 버튼을 누르면 open()의 결과를 화면에 쓴다. results에 Promise 결과를 순서대로 모은다.
function Consumer({
  results,
  render = pickRender,
}: {
  results: Pick[];
  render?: AwaitDialogRender<Pick>;
}) {
  const { open, element } = useAwaitDialog<Pick>('cancel');
  return (
    <>
      <span data-testid="has-element">{String(element !== null)}</span>
      <button
        type="button"
        onClick={() => {
          void open(render).then((r) => results.push(r));
        }}
      >
        열기
      </button>
      <button type="button">바깥 버튼</button>
      {element}
    </>
  );
}

async function click(name: string, options: { hidden?: boolean } = {}) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name, ...options }));
  });
}

async function openDialog() {
  await click('열기');
  return screen.findByRole('dialog', { name: '고르세요' });
}

describe('useAwaitDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('한 번도 열지 않았으면 element는 null이고, 한 번 열면 닫힌 뒤에도 남는다', async () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    expect(screen.getByTestId('has-element').textContent).toBe('false');
    await openDialog();
    await click('A');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('has-element').textContent).toBe('true');
  });

  it('버튼으로 resolve한 값이 Promise로 전달되고 다이얼로그가 닫힌다', async () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    await openDialog();
    await click('B');
    await waitFor(() => expect(results).toEqual(['b']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Esc는 cancel 값으로 resolve한다(reject 아님)', async () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    const dialog = await openDialog();
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    await waitFor(() => expect(results).toEqual(['cancel']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('닫기 버튼(onOpenChange(false))과 cancel()도 cancel 값이다', async () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    await openDialog();
    await click('Close');
    await waitFor(() => expect(results).toEqual(['cancel']));
    await openDialog();
    await click('취소');
    await waitFor(() => expect(results).toEqual(['cancel', 'cancel']));
  });

  it('열린 채 다시 open하면 이전 Promise는 cancel로 끝나고 다이얼로그는 하나뿐이다', async () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    await openDialog();
    // 모달이 열린 동안 바깥 버튼은 aria-hidden — 조회만 hidden으로, 클릭은 그대로 된다.
    await click('열기', { hidden: true });
    await waitFor(() => expect(results).toEqual(['cancel']));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await click('A');
    await waitFor(() => expect(results).toEqual(['cancel', 'a']));
  });

  it('언마운트되면 대기 중인 Promise를 cancel로 끝내고 콘솔 경고가 없다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const results: Pick[] = [];
    const { unmount } = render(<Consumer results={results} />);
    await openDialog();
    unmount();
    await waitFor(() => expect(results).toEqual(['cancel']));
    expect(error).not.toHaveBeenCalled();
  });

  it('열려 있는 동안 포커스는 다이얼로그 안에 있고 바깥은 보조 기술에서 숨겨진다(포커스 트랩)', async () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    const dialog = await openDialog();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const outside = screen.getByText('바깥 버튼');
    await waitFor(() =>
      expect(
        outside.closest('[aria-hidden="true"]') !== null || outside.closest('[inert]') !== null,
      ).toBe(true),
    );
  });

  it('결과가 정해진 뒤에도 렌더 함수는 open=false로 다시 불린다(닫힘 애니메이션 동안 element 유지)', async () => {
    const results: Pick[] = [];
    const seen: boolean[] = [];
    const spyRender: AwaitDialogRender<Pick> = (props) => {
      seen.push(props.open);
      return pickRender(props);
    };
    render(<Consumer results={results} render={spyRender} />);
    await openDialog();
    expect(seen).toContain(true);
    await click('A');
    await waitFor(() => expect(seen.at(-1)).toBe(false));
  });

  it('바깥(backdrop) 클릭은 cancel 값이다', async () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    const dialog = await openDialog();
    const backdrop = dialog.parentElement?.querySelector('[role="presentation"]') ?? document.body;
    await act(async () => {
      fireEvent.pointerDown(backdrop, { pointerType: 'mouse', button: 0 });
      fireEvent.mouseDown(backdrop, { button: 0 });
      fireEvent.pointerUp(backdrop, { pointerType: 'mouse', button: 0 });
      fireEvent.mouseUp(backdrop, { button: 0 });
      fireEvent.click(backdrop, { button: 0 });
    });
    await waitFor(() => expect(results).toEqual(['cancel']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('닫힌 뒤 포커스는 열었던 버튼으로 돌아온다', async () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    const trigger = screen.getByRole('button', { name: '열기' });
    trigger.focus();
    await openDialog();
    await click('A');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('새로 열면 렌더 함수가 돌려준 컴포넌트의 상태가 초기화된다(이전 세션 입력이 남지 않는다)', async () => {
    function NameDialog({ open, onOpenChange, resolve, cancel }: AwaitDialogRenderProps<Pick>) {
      const [value, setValue] = useState('');
      return (
        <Dialog
          open={open}
          onOpenChange={onOpenChange}
          title="고르세요"
          footer={
            <>
              <button type="button" onClick={cancel}>
                취소
              </button>
              <button type="button" onClick={() => resolve('a')}>
                A
              </button>
            </>
          }
        >
          <input aria-label="이름" value={value} onChange={(e) => setValue(e.target.value)} />
        </Dialog>
      );
    }
    const results: Pick[] = [];
    render(<Consumer results={results} render={(props) => <NameDialog {...props} />} />);
    await openDialog();
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '버린 초안' } });
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('버린 초안');
    await click('취소');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await openDialog();
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('');
  });

  it('언마운트된 뒤 stale 클로저로 open하면 바로 cancel로 끝난다(영원히 pending 아님)', async () => {
    let openFn: ((render: AwaitDialogRender<Pick>) => Promise<Pick>) | null = null;
    function Leak() {
      const { open, element } = useAwaitDialog<Pick>('cancel');
      openFn = open;
      return <>{element}</>;
    }
    const { unmount } = render(<Leak />);
    unmount();
    expect(openFn).not.toBeNull();
    await expect(openFn!(pickRender)).resolves.toBe('cancel');
  });
});
