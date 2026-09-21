import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RunActionBar } from './RunActionBar';

const { refresh, push, approveRun, planRerun, reviseRun } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  approveRun: vi.fn(),
  planRerun: vi.fn(),
  reviseRun: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock('../../../lib/run-api-client', () => ({ approveRun, planRerun, reviseRun }));

const STEPS = [
  { name: 'evidence', label: '근거 수집' },
  { name: 'velog', label: '벨로그 본문' },
  { name: 'verify', label: '근거 검증' },
];

const PLAN = {
  startStep: 'velog',
  fresh: ['velog', 'verify'],
  carried: ['evidence'],
  sources: {},
};

function renderBar(enabled = true) {
  return render(<RunActionBar runId="r1" enabled={enabled} steps={STEPS} maxLength={2000} />);
}

/** Dialog 안 버튼을 이름으로 찾아 누른다. */
async function clickDialogButton(name: string): Promise<void> {
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name }));
}

const isDisabled = (name: string) =>
  (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;

const type = (text: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: '수정 지시 입력' }), {
    target: { value: text },
  });

beforeEach(() => {
  refresh.mockReset();
  push.mockReset();
  approveRun.mockReset();
  planRerun.mockReset();
  reviseRun.mockReset();
});

describe('RunActionBar', () => {
  it('승인 대기가 아니면 컨트롤 전부 비활성이고 안내 placeholder를 보여준다', () => {
    renderBar(false);

    const textarea = screen.getByRole('textbox', { name: '수정 지시 입력' }) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.getAttribute('placeholder')).toContain('승인 대기 상태에서만');
    expect((screen.getByRole('button', { name: '재실행' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: '승인' }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('combobox', { name: '시작 단계' }) as HTMLElement).getAttribute(
        'data-disabled',
      ),
    ).not.toBeNull();
  });

  it('빈 지시로 재실행을 누르면 API를 부르지 않고 안내만', () => {
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: '재실행' }));

    expect(planRerun).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('수정 지시를 입력해 주세요.');
  });

  it('재실행: 계획을 받아 Dialog에 다시 도는 단계·이전 결과 유지를 보여주고, 확인해야 revise를 보낸다', async () => {
    planRerun.mockResolvedValue({ ok: true, data: PLAN });
    reviseRun.mockResolvedValue({
      ok: true,
      data: { run: { id: 'r2' }, previous: { id: 'r1' }, plan: PLAN },
    });
    renderBar();

    type('  어투를 부드럽게  ');
    fireEvent.click(screen.getByRole('button', { name: '재실행' }));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: '다시 실행할까요?' })).toBeTruthy(),
    );
    expect(planRerun).toHaveBeenCalledWith('r1', { instruction: '어투를 부드럽게' });
    expect(reviseRun).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('벨로그 본문 → 근거 검증');
    expect(dialog.textContent).toContain('근거 수집');

    await clickDialogButton('재실행');

    await waitFor(() =>
      expect(reviseRun).toHaveBeenCalledWith('r1', { instruction: '어투를 부드럽게' }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/runs?tab=active&id=r2'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Dialog에서 취소하면 revise를 보내지 않는다', async () => {
    planRerun.mockResolvedValue({ ok: true, data: PLAN });
    renderBar();

    type('지시');
    fireEvent.click(screen.getByRole('button', { name: '재실행' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    await clickDialogButton('취소');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reviseRun).not.toHaveBeenCalled();
  });

  it('계획 API가 실패하면 메시지를 보여주고 Dialog는 열지 않는다', async () => {
    planRerun.mockResolvedValue({
      ok: false,
      error: { code: 'INSTRUCTION_TOO_LONG', message: '수정 지시가 너무 깁니다.' },
    });
    renderBar();

    type('지시');
    fireEvent.click(screen.getByRole('button', { name: '재실행' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('수정 지시가 너무 깁니다.'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(isDisabled('재실행')).toBe(false);
  });

  it('revise가 실패하면 Dialog를 닫고 메시지를 보여준다(이동하지 않는다)', async () => {
    planRerun.mockResolvedValue({ ok: true, data: PLAN });
    reviseRun.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_LATEST_ATTEMPT', message: '최신 시도에서만' },
    });
    renderBar();

    type('지시');
    fireEvent.click(screen.getByRole('button', { name: '재실행' }));
    await clickDialogButton('재실행');

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('최신 시도에서만'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(isDisabled('재실행')).toBe(false);
  });

  it('승인: 확인 Dialog를 거쳐야 API를 부르고, 성공이면 화면을 다시 그린다', async () => {
    approveRun.mockResolvedValue({ ok: true, data: { id: 'r1' } });
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: '승인' }));

    const dialog = await screen.findByRole('dialog', { name: '승인할까요?' });
    expect(dialog.textContent).toContain('공개 발행은 일어나지 않고');
    expect(approveRun).not.toHaveBeenCalled();

    await clickDialogButton('승인');

    await waitFor(() => expect(approveRun).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('승인 Dialog에서 취소하면 API를 부르지 않는다', async () => {
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    await screen.findByRole('dialog', { name: '승인할까요?' });
    await clickDialogButton('취소');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(approveRun).not.toHaveBeenCalled();
  });

  it('승인 실패는 Dialog를 닫고 메시지만', async () => {
    approveRun.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_PENDING_APPROVAL', message: '승인 대기만' },
    });
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    await screen.findByRole('dialog', { name: '승인할까요?' });
    await clickDialogButton('승인');

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('승인 대기만'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(isDisabled('승인')).toBe(false);
  });

  it('API가 도는 동안 컨트롤이 비활성이고 status에 진행 문구가 뜬다(Dialog는 확인 즉시 닫힘)', async () => {
    let finish: (value: unknown) => void = () => {};
    approveRun.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    await screen.findByRole('dialog', { name: '승인할까요?' });
    await clickDialogButton('승인');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('요청하는 중'));
    expect((screen.getByRole('button', { name: '승인' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '재실행' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    finish({ ok: true, data: { id: 'r1' } });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status').textContent).toBe('');
    expect((screen.getByRole('button', { name: '승인' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  // happy-dom은 disabled 버튼에도 focus()가 먹어 "Dialog 복귀가 disabled에 막혀 body로 떨어지는" 회귀 자체는
  // 재현되지 않는다(Chrome에서만). 이 테스트는 busy 해제 뒤 복귀 effect가 눌렀던 버튼을 잡는 경로를 고정한다.
  it('요청이 끝나면 포커스가 눌렀던 버튼으로 돌아온다(실패 경로)', async () => {
    approveRun.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_PENDING_APPROVAL', message: '승인 대기만' },
    });
    renderBar();

    const approve = screen.getByRole('button', { name: '승인' });
    approve.focus();
    fireEvent.click(approve);
    await screen.findByRole('dialog', { name: '승인할까요?' });
    await clickDialogButton('승인');

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('승인 대기만'));
    await waitFor(() => expect(document.activeElement).toBe(approve));
  });

  it('요청 중 언마운트되면(다른 실행 선택) 응답이 와도 이동·새로 그리기를 하지 않는다', async () => {
    let finishRevise: (value: unknown) => void = () => {};
    planRerun.mockResolvedValue({ ok: true, data: PLAN });
    reviseRun.mockReturnValue(new Promise((resolve) => (finishRevise = resolve)));
    const { unmount } = renderBar();

    type('지시');
    fireEvent.click(screen.getByRole('button', { name: '재실행' }));
    await clickDialogButton('재실행');
    await waitFor(() => expect(reviseRun).toHaveBeenCalled());

    unmount();
    finishRevise({ ok: true, data: { run: { id: 'r2' }, previous: { id: 'r1' }, plan: PLAN } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(push).not.toHaveBeenCalled();
  });

  it('재실행 경로: 계획 확인 중·요청 중 두 문구가 차례로 뜨고 그동안 컨트롤이 비활성이다', async () => {
    let finishPlan: (value: unknown) => void = () => {};
    let finishRevise: (value: unknown) => void = () => {};
    planRerun.mockReturnValue(new Promise((resolve) => (finishPlan = resolve)));
    reviseRun.mockReturnValue(new Promise((resolve) => (finishRevise = resolve)));
    renderBar();

    type('지시');
    fireEvent.click(screen.getByRole('button', { name: '재실행' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('계획을 확인하는 중'),
    );
    expect(isDisabled('재실행')).toBe(true);
    expect(isDisabled('승인')).toBe(true);

    finishPlan({ ok: true, data: PLAN });
    await screen.findByRole('dialog', { name: '다시 실행할까요?' });
    // 모달이 열린 동안 바깥 live 영역은 aria-hidden — 조회만 hidden으로
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('');
    await clickDialogButton('재실행');

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('요청하는 중'));
    expect(isDisabled('재실행')).toBe(true);

    finishRevise({ ok: true, data: { run: { id: 'r2' }, previous: { id: 'r1' }, plan: PLAN } });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/runs?tab=active&id=r2'));
  });
});
