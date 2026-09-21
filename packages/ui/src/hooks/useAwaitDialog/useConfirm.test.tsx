import { describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useConfirm } from './useConfirm';
import type { ConfirmOptions } from './useConfirm';
import { Button } from '../../components/Button';

function Consumer({ options, results }: { options: ConfirmOptions; results: boolean[] }) {
  const { confirm, element } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void confirm(options).then((ok) => results.push(ok));
        }}
      >
        묻기
      </button>
      {element}
    </>
  );
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('useConfirm', () => {
  it('title을 이름으로 하는 dialog와 description, 기본 라벨 취소·확인을 렌더한다', async () => {
    render(
      <Consumer options={{ title: '지울까요?', description: '되돌릴 수 없어요.' }} results={[]} />,
    );
    await click('묻기');
    await screen.findByRole('dialog', { name: '지울까요?' });
    expect(screen.getByText('되돌릴 수 없어요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy();
  });

  it('확인이면 true, 취소면 false', async () => {
    const results: boolean[] = [];
    render(<Consumer options={{ title: '지울까요?' }} results={results} />);
    await click('묻기');
    await screen.findByRole('dialog');
    await click('확인');
    await waitFor(() => expect(results).toEqual([true]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await click('묻기');
    await screen.findByRole('dialog');
    await click('취소');
    await waitFor(() => expect(results).toEqual([true, false]));
  });

  it('Esc·닫기 버튼은 false', async () => {
    const results: boolean[] = [];
    render(<Consumer options={{ title: '지울까요?' }} results={results} />);
    await click('묻기');
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    await waitFor(() => expect(results).toEqual([false]));
    await click('묻기');
    await screen.findByRole('dialog');
    await click('닫기');
    await waitFor(() => expect(results).toEqual([false, false]));
  });

  it('confirmLabel·cancelLabel을 바꾸고, tone=danger면 확인 버튼이 danger variant다', async () => {
    render(
      <>
        <Consumer
          options={{
            title: '지울까요?',
            confirmLabel: '삭제',
            cancelLabel: '두기',
            tone: 'danger',
          }}
          results={[]}
        />
        <Button variant="danger">기준</Button>
      </>,
    );
    await click('묻기');
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: '두기' })).toBeTruthy();
    const confirmButton = screen.getByRole('button', { name: '삭제' });
    const reference = screen.getByRole('button', { name: '기준', hidden: true });
    expect(confirmButton.className).toBe(reference.className);
  });

  it('tone 기본은 확인 버튼이 primary다', async () => {
    render(
      <>
        <Consumer options={{ title: '진행할까요?' }} results={[]} />
        <Button>기준</Button>
      </>,
    );
    await click('묻기');
    await screen.findByRole('dialog');
    const confirmButton = screen.getByRole('button', { name: '확인' });
    const reference = screen.getByRole('button', { name: '기준', hidden: true });
    expect(confirmButton.className).toBe(reference.className);
  });

  it('초기 포커스: tone=danger면 취소 버튼, 기본이면 확인 버튼', async () => {
    const { unmount } = render(
      <Consumer options={{ title: '지울까요?', tone: 'danger' }} results={[]} />,
    );
    await click('묻기');
    await screen.findByRole('dialog');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' })),
    );
    unmount();
    render(<Consumer options={{ title: '진행할까요?' }} results={[]} />);
    await click('묻기');
    await screen.findByRole('dialog');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '확인' })),
    );
  });

  it('children을 본문(description 아래)에 렌더한다', async () => {
    render(
      <Consumer
        options={{
          title: '다시 실행할까요?',
          description: '비용이 듭니다.',
          children: (
            <dl>
              <dt>다시 도는 단계</dt>
              <dd>본문 → 검증</dd>
            </dl>
          ),
        }}
        results={[]}
      />,
    );
    await click('묻기');
    const dialog = await screen.findByRole('dialog', { name: '다시 실행할까요?' });
    const description = screen.getByText('비용이 듭니다.');
    const body = screen.getByText('다시 도는 단계');
    expect(dialog.contains(body)).toBe(true);
    // description 다음에 본문
    expect(
      description.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
