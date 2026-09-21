import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAwaitDialog } from './useAwaitDialog';
import type { AwaitDialogRender } from './useAwaitDialog';
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

  it('한 번도 열지 않았으면 element는 null이다', () => {
    const results: Pick[] = [];
    render(<Consumer results={results} />);
    expect(screen.queryByRole('dialog')).toBeNull();
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
    await click('닫기');
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
});
