import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TopicNoteProvider, useTopicNoteEdit } from './TopicNoteEdit';

const actions = { load: vi.fn(), save: vi.fn() };
const loaded = (note: string, maxChars = 2000) => ({ ok: true, data: { note, maxChars } });

function Opener() {
  const open = useTopicNoteEdit();
  return <button onClick={() => open({ id: 't1', title: '무한 스크롤' })}>메모 열기</button>;
}

async function openDialog() {
  render(
    <TopicNoteProvider actions={actions}>
      <Opener />
    </TopicNoteProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '메모 열기' }));
  return waitFor(() => screen.getByRole('dialog', { name: '무한 스크롤 — 배경 메모' }));
}

const field = () => screen.getByRole('textbox', { name: '배경 메모' }) as HTMLTextAreaElement;
const saveButton = () => screen.getByRole('button', { name: '저장' }) as HTMLButtonElement;

beforeEach(() => {
  actions.load.mockReset();
  actions.save.mockReset();
});

describe('배경 메모 Dialog', () => {
  it('열리면 저장된 메모를 읽어 보이고, 바뀌기 전에는 저장이 꺼져 있다', async () => {
    actions.load.mockResolvedValue(loaded('사용자는 나 혼자'));
    await openDialog();
    await waitFor(() => expect(field().value).toBe('사용자는 나 혼자'));
    expect(actions.load).toHaveBeenCalledWith('t1');
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText('9 / 2,000자')).toBeTruthy();
  });

  it('읽는 동안에는 입력 칸이 잠겨 있다', async () => {
    actions.load.mockReturnValue(new Promise(() => {}));
    await openDialog();
    expect(field().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('불러오는 중…');
  });

  it('고쳐서 저장하면 그 글을 보내고 닫는다', async () => {
    actions.load.mockResolvedValue(loaded(''));
    actions.save.mockResolvedValue(loaded('2년 넘게 만든 제품'));
    await openDialog();
    await waitFor(() => expect(field().disabled).toBe(false));
    fireEvent.change(field(), { target: { value: '2년 넘게 만든 제품' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(actions.save).toHaveBeenCalledWith('t1', '2년 넘게 만든 제품');
  });

  it('메모를 비워 저장할 수 있다(지우기)', async () => {
    actions.load.mockResolvedValue(loaded('메모'));
    actions.save.mockResolvedValue(loaded(''));
    await openDialog();
    await waitFor(() => expect(field().value).toBe('메모'));
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith('t1', ''));
  });

  it('상한을 넘으면 저장을 끄고 알린다', async () => {
    actions.load.mockResolvedValue(loaded('', 5));
    await openDialog();
    await waitFor(() => expect(field().disabled).toBe(false));
    fireEvent.change(field(), { target: { value: '여섯 글자 넘음' } });
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText('5자까지 적을 수 있습니다.')).toBeTruthy();
  });

  it('저장이 실패하면 문구를 보이고 닫지 않는다(적은 글 유지)', async () => {
    actions.load.mockResolvedValue(loaded(''));
    actions.save.mockResolvedValue({
      ok: false,
      error: { code: 'TOPIC_NOT_FOUND', message: '큐에 없는 주제입니다.' },
    });
    await openDialog();
    await waitFor(() => expect(field().disabled).toBe(false));
    fireEvent.change(field(), { target: { value: '메모' } });
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('큐에 없는 주제입니다.'),
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(field().value).toBe('메모');
  });

  it('읽기가 실패하면 문구를 보이고 입력을 열지 않는다', async () => {
    actions.load.mockRejectedValue(new Error('network'));
    await openDialog();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('요청이 실패했습니다'),
    );
    expect(field().disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
  });
});
