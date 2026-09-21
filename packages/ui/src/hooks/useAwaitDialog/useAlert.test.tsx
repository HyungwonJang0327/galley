import { describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAlert } from './useAlert';
import type { AlertOptions } from './useAlert';
import { Button } from '../../components/Button';

function Consumer({ options, done }: { options: AlertOptions; done: () => void }) {
  const { alert, element } = useAlert();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void alert(options).then(done);
        }}
      >
        알리기
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

describe('useAlert', () => {
  it('title을 이름으로 하는 dialog, description, 확인 버튼 하나(취소 없음)를 렌더하고 확인에 포커스', async () => {
    render(
      <Consumer
        options={{ title: '저장했습니다', description: '큐로 돌아갑니다.' }}
        done={() => {}}
      />,
    );
    await click('알리기');
    await screen.findByRole('dialog', { name: '저장했습니다' });
    expect(screen.getByText('큐로 돌아갑니다.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    const confirm = screen.getByRole('button', { name: 'OK' });
    await waitFor(() => expect(document.activeElement).toBe(confirm));
  });

  it('확인·Esc·닫기 버튼 어느 쪽이든 Promise가 끝나고 닫힌다', async () => {
    let count = 0;
    render(<Consumer options={{ title: '안내' }} done={() => void count++} />);
    await click('알리기');
    await screen.findByRole('dialog');
    await click('OK');
    await waitFor(() => expect(count).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await click('알리기');
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    await waitFor(() => expect(count).toBe(2));

    await click('알리기');
    await screen.findByRole('dialog');
    await click('Close');
    await waitFor(() => expect(count).toBe(3));
  });

  it('confirmLabel·tone=danger·children을 반영한다', async () => {
    render(
      <>
        <Consumer
          options={{
            title: '실패했습니다',
            confirmLabel: '알겠어요',
            tone: 'danger',
            children: (
              <ul>
                <li>원인 하나</li>
              </ul>
            ),
          }}
          done={() => {}}
        />
        <Button variant="danger">기준</Button>
      </>,
    );
    await click('알리기');
    await screen.findByRole('dialog');
    const button = screen.getByRole('button', { name: '알겠어요' });
    const reference = screen.getByRole('button', { name: '기준', hidden: true });
    expect(button.className).toBe(reference.className);
    expect(screen.getByText('원인 하나')).toBeTruthy();
  });
});
