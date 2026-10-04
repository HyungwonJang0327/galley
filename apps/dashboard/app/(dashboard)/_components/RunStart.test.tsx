import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RunModelChoices } from '../../../lib/run-model-options';
import { RunStartButton, RunStartProvider, useRunStart } from './RunStart';

const { push, startRun } = vi.hoisted(() => ({ push: vi.fn(), startRun: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../../../lib/run-api-client', () => ({ startRun }));

const option = (value: string, disabled = false) => ({
  value,
  label: `${value} 이름`,
  description: 'Anthropic',
  meta: '$5 / $25',
  disabled,
  disabledReason: disabled ? 'API 키 없음 (.env ANTHROPIC_API_KEY)' : undefined,
});

const choices: RunModelChoices = {
  options: [option('anthropic:a'), option('anthropic:b'), option('openai:c', true)],
  initialId: 'anthropic:b',
};

/** 진입점 대역: 버튼을 누르면 주제를 넘겨 Dialog를 연다. */
function Opener({ id = 't1', title = '무한 스크롤' }: { id?: string; title?: string }) {
  const open = useRunStart();
  return <button onClick={() => open({ id, title })}>{`${title} 실행`}</button>;
}

function renderWith(value: RunModelChoices = choices) {
  render(
    <RunStartProvider choices={value}>
      <Opener />
      <Opener id="t2" title="다른 주제" />
    </RunStartProvider>,
  );
}

function press(element: HTMLElement) {
  fireEvent.pointerDown(element, { pointerType: 'mouse', button: 0 });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.click(element);
}

async function openDialog(name = '무한 스크롤 실행') {
  fireEvent.click(screen.getByRole('button', { name }));
  return waitFor(() => screen.getByRole('dialog'));
}

beforeEach(() => {
  push.mockReset();
  startRun.mockReset();
});

describe('RunStartProvider / 실행 시작 Dialog', () => {
  it('제목 = 주제명, 모델 초기값 = 서버가 준 initialId', async () => {
    renderWith();
    const dialog = await openDialog();

    expect(screen.getByRole('heading', { name: '무한 스크롤' })).toBeTruthy();
    expect(dialog.textContent).toContain('anthropic:b 이름');
  });

  it('실행하면 주제 id·고른 모델로 시작하고 실행 상세로 간다', async () => {
    startRun.mockResolvedValue({ ok: true, data: { id: 'run-1' } });
    renderWith();
    await openDialog();

    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/runs?tab=active&id=run-1'));
    expect(startRun).toHaveBeenCalledWith({ topicId: 't1', modelId: 'anthropic:b' });
  });

  it('다른 모델을 고르면 그 모델로 시작한다', async () => {
    startRun.mockResolvedValue({ ok: true, data: { id: 'run-2' } });
    renderWith();
    await openDialog();

    press(screen.getByRole('combobox', { name: '모델' }));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    press(screen.getByRole('option', { name: /anthropic:a 이름/ }));
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() =>
      expect(startRun).toHaveBeenCalledWith({ topicId: 't1', modelId: 'anthropic:a' }),
    );
  });

  it('키 없는 모델은 비활성 + 사유(title)', async () => {
    renderWith();
    await openDialog();

    press(screen.getByRole('combobox', { name: '모델' }));
    const noKey = await waitFor(() => screen.getByRole('option', { name: /openai:c 이름/ }));

    expect(noKey.getAttribute('aria-disabled')).toBe('true');
    expect(noKey.getAttribute('title')).toBe('API 키 없음 (.env ANTHROPIC_API_KEY)');
  });

  it('실패하면 Dialog를 닫지 않고 사유를 알린다', async () => {
    startRun.mockResolvedValue({
      ok: false,
      error: { code: 'RUN_ALREADY_ACTIVE', message: '이 주제는 아직 끝나지 않은 실행이 있습니다.' },
    });
    renderWith();
    await openDialog();

    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      '이 주제는 아직 끝나지 않은 실행이 있습니다.',
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('실행 가능한 모델이 없으면 실행 버튼 비활성 + 안내', async () => {
    renderWith({
      options: [option('anthropic:a', true)],
      initialId: undefined,
    });
    const dialog = await openDialog();

    expect((screen.getByRole('button', { name: '실행' }) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog.textContent).toContain('API 키가 있는 모델이 없습니다');
  });

  it('다시 열면 이전 선택·오류를 지우고 그 주제로 연다', async () => {
    startRun.mockResolvedValue({ ok: false, error: { code: 'X', message: '실패' } });
    renderWith();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: '실행' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openDialog('다른 주제 실행');

    expect(screen.getByRole('heading', { name: '다른 주제' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('RunStartButton', () => {
  it('누르면 그 주제로 Dialog를 연다', async () => {
    render(
      <RunStartProvider choices={choices}>
        <RunStartButton topic={{ id: 't9', title: '맨 위 주제' }} disabledReason={undefined}>
          맨 위 실행
        </RunStartButton>
      </RunStartProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '맨 위 실행' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: '맨 위 주제' })).toBeTruthy());
  });

  it('사유가 있으면 비활성 + title', () => {
    render(
      <RunStartProvider choices={choices}>
        <RunStartButton topic={{ id: 't9', title: '기존' }} disabledReason="이미 발행된 글입니다.">
          맨 위 실행
        </RunStartButton>
      </RunStartProvider>,
    );

    const button = screen.getByRole('button', { name: '맨 위 실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('이미 발행된 글입니다.');
  });

  it('주제가 없으면 비활성', () => {
    render(
      <RunStartProvider choices={choices}>
        <RunStartButton topic={undefined} disabledReason="대기 중인 주제가 없습니다.">
          맨 위 실행
        </RunStartButton>
      </RunStartProvider>,
    );

    expect((screen.getByRole('button', { name: '맨 위 실행' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
