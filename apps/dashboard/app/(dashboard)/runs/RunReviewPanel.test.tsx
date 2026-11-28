import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RunReviewPanel } from './RunReviewPanel';
import type { ReviewQuestionView, RunReviewView } from '../../../lib/run-review';

const { push, answerRun } = vi.hoisted(() => ({ push: vi.fn(), answerRun: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../../../lib/run-api-client', () => ({ answerRun }));

const q = (
  id: string,
  source: ReviewQuestionView['source'],
  text: string,
  extra: Partial<ReviewQuestionView> = {},
): ReviewQuestionView => ({ id, source, text, line: 12, ...extra });

const review = (extra: Partial<RunReviewView> = {}): RunReviewView => ({
  answerable: true,
  questions: [
    q('c1', 'comment', '몇 건이었나요?', { reason: '로그 없음' }),
    q('u1', 'unsupported', '응답이 2배 빨라졌다.'),
  ],
  more: [q('u2', 'unsupported', '접힌 문장')],
  unapplied: [],
  kept: [],
  maxLength: 2000,
  ...extra,
});

const renderPanel = (view = review()) => render(<RunReviewPanel runId="r1" review={view} />);

/** 질문의 라디오 그룹에서 답 종류를 고른다. */
const choose = (question: string, label: string) =>
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: `답: ${question}` })).getByRole('radio', {
      name: label,
    }),
  );

async function clickDialogButton(name: string): Promise<void> {
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name }));
}

beforeEach(() => {
  push.mockReset();
  answerRun.mockReset();
});

describe('RunReviewPanel', () => {
  it('질문을 종류·줄 번호·사유와 함께 보이고, "그 외"는 접어 둔다', () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: '확인 질문 2건' })).toBeTruthy();
    expect(screen.getByText('몇 건이었나요?')).toBeTruthy();
    expect(screen.getByText('로그 없음')).toBeTruthy();
    expect(screen.getByText('근거 없음')).toBeTruthy();
    expect(screen.queryByText('접힌 문장')).toBeNull();

    const toggle = screen.getByRole('button', { name: '그 외 1건 펼치기' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByText('접힌 문장')).toBeTruthy();
  });

  it('채움을 고르면 입력란이 생기고, 고른 답이 무엇을 하는지 한 줄로 알린다', () => {
    renderPanel();
    expect(screen.queryByRole('textbox')).toBeNull();

    choose('몇 건이었나요?', '채움');
    expect(screen.getByRole('textbox', { name: '채움 내용: 몇 건이었나요?' })).toBeTruthy();

    choose('응답이 2배 빨라졌다.', '삭제');
    expect(screen.getByText('이 문장을 본문에서 뺍니다.')).toBeTruthy();
  });

  it('답하지 않고 누르면 보내지 않고 안내한다', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '답 반영' }));

    expect(screen.getByRole('status').textContent).toContain('하나 이상');
    expect(answerRun).not.toHaveBeenCalled();
  });

  it('확인을 거쳐 답한 질문만 보내고, 새 실행으로 이동한다', async () => {
    answerRun.mockResolvedValue({ ok: true, data: { run: { id: 'r2' } } });
    renderPanel();
    choose('몇 건이었나요?', '채움');
    fireEvent.change(screen.getByRole('textbox', { name: '채움 내용: 몇 건이었나요?' }), {
      target: { value: '3만 건' },
    });

    fireEvent.click(screen.getByRole('button', { name: '답 반영' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('채움 1');
    expect(dialog.textContent).toContain('비용이 드는 작업');
    await clickDialogButton('답 반영');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/runs?tab=active&id=r2'));
    expect(answerRun).toHaveBeenCalledWith('r1', [{ id: 'c1', kind: 'fill', text: '3만 건' }]);
  });

  it('취소하면 보내지 않는다', async () => {
    renderPanel();
    choose('몇 건이었나요?', '모름(그대로 둠)');

    fireEvent.click(screen.getByRole('button', { name: '답 반영' }));
    expect((await screen.findByRole('dialog')).textContent).toContain('모델을 부르지 않고');
    await clickDialogButton('취소');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(answerRun).not.toHaveBeenCalled();
  });

  it('실패하면 문구를 보이고 입력을 유지한다', async () => {
    answerRun.mockResolvedValue({
      ok: false,
      error: { code: 'REVIEW_QUESTION_UNKNOWN', message: '질문 목록이 바뀌었습니다.' },
    });
    renderPanel();
    choose('몇 건이었나요?', '모름(그대로 둠)');

    fireEvent.click(screen.getByRole('button', { name: '답 반영' }));
    await clickDialogButton('답 반영');

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('질문 목록이 바뀌었습니다.'),
    );
    expect(push).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('radiogroup', { name: '답: 몇 건이었나요?' }))
        .getByRole('radio', { name: '모름(그대로 둠)' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('반영되지 못한 답을 알리고, 같은 질문에 그 답을 다시 채워 둔다 — 접힌 쪽이면 펼친다', async () => {
    answerRun.mockResolvedValue({ ok: true, data: { run: { id: 'r3' } } });
    renderPanel(
      review({
        questions: [q('c1', 'comment', '몇 건이었나요?')],
        more: [
          q('u2', 'unsupported', '접힌 문장', {
            previousAnswer: { id: 'u2', kind: 'fill', text: '실측 1.8배' },
          }),
        ],
        unapplied: [
          {
            id: 'u5',
            text: '접힌 문장',
            answer: '채움: 실측 1.8배',
            message: '이전 본문을 그대로 뒀습니다.',
            reused: true,
          },
        ],
      }),
    );

    expect(screen.getByText('반영하지 못한 답 1건')).toBeTruthy();
    expect(screen.getByText(/다시 채워 두었습니다/)).toBeTruthy();
    const box = screen.getByRole('textbox', {
      name: '채움 내용: 접힌 문장',
    }) as HTMLTextAreaElement;
    expect(box.value).toBe('실측 1.8배');

    fireEvent.click(screen.getByRole('button', { name: '답 반영' }));
    await clickDialogButton('답 반영');
    await waitFor(() =>
      expect(answerRun).toHaveBeenCalledWith('r1', [
        { id: 'u2', kind: 'fill', text: '실측 1.8배' },
      ]),
    );
  });

  it('접어 둔 "그 외"의 답은 보내지 않는다', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '그 외 1건 펼치기' }));
    choose('접힌 문장', '삭제');
    fireEvent.click(screen.getByRole('button', { name: '그 외 1건 접기' }));

    fireEvent.click(screen.getByRole('button', { name: '답 반영' }));

    expect(screen.getByRole('status').textContent).toContain('하나 이상');
  });

  it('답할 수 없는 실행(승인 대기 아님)은 안내만 보인다', () => {
    renderPanel(
      review({
        answerable: false,
        questions: [],
        more: [],
        kept: ['링크드인 글에 본문 수정이 반영되지 않았습니다.'],
      }),
    );

    expect(screen.getByText('링크드인 글에 본문 수정이 반영되지 않았습니다.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '답 반영' })).toBeNull();
  });

  it('삽화 질문은 "다시 만들기"만 고를 수 있고, 고르면 그 답을 보낸다', async () => {
    answerRun.mockResolvedValue({ ok: true, data: { run: { id: 'r2' } } });
    const text = '삽화를 다시 만들까요? (illust1_feed)';
    renderPanel(
      review({
        questions: [q('c1', 'comment', '몇 건이었나요?'), q('i1', 'illustration', text)],
        more: [],
      }),
    );

    const group = screen.getByRole('radiogroup', { name: `답: ${text}` });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(within(group).queryByRole('radio', { name: '채움' })).toBeNull();
    expect(screen.getByText('삽화')).toBeTruthy();

    choose(text, '다시 만들기');
    expect(screen.getByText(/삽화를 전부 새로 그립니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '답 반영' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('삽화 다시 만들기 1');
    expect(dialog.textContent).toContain('비용이 드는 작업');
    await clickDialogButton('답 반영');

    await waitFor(() => expect(answerRun).toHaveBeenCalledWith('r1', [{ id: 'i1', kind: 'redo' }]));
  });

  const stats = [
    { label: '본문 글자 수(코드 제외)', value: '4,084자', reference: '1,098~4,669자' },
    { label: '인라인 코드', value: '114개', reference: '1~53개' },
  ];

  it('본문이 기준을 벗어나면 알리고, 승인을 막지 않는다고 적는다 — 수치 표는 기존 글 범위와 나란히', () => {
    renderPanel(
      review({
        bodyShape: {
          off: ['코드 블록이 7개입니다(기준 2~4개).'],
          warn: ['가장 긴 코드 블록이 60줄입니다(기존 글에서 가장 긴 것 49줄).'],
          stats,
        },
        questions: [],
        more: [],
      }),
    );

    expect(screen.getByText('본문이 분량 기준을 벗어났습니다')).toBeTruthy();
    expect(screen.getByText('코드 블록이 7개입니다(기준 2~4개).')).toBeTruthy();
    expect(screen.getByText(/가장 긴 코드 블록이 60줄/)).toBeTruthy();
    expect(screen.getByText(/승인은 막지 않습니다/)).toBeTruthy();
    expect(screen.getByText('기존 글 대비 수치 2개')).toBeTruthy();
    const row = screen.getByRole('rowheader', { name: '인라인 코드' }).closest('tr');
    expect(row?.textContent).toBe('인라인 코드114개1~53개');
    expect(screen.queryByRole('button', { name: '답 반영' })).toBeNull();
  });

  it('경고만 있으면 제목이 다르고, 벗어난 것이 없으면 알림 없이 수치 표만 보인다', () => {
    const { unmount } = renderPanel(
      review({
        bodyShape: { off: [], warn: ['코드가 본문 글자의 55%입니다.'], stats },
        questions: [],
        more: [],
      }),
    );
    expect(screen.getByText('본문의 코드 분량을 확인하세요')).toBeTruthy();
    unmount();

    renderPanel(review({ bodyShape: { off: [], warn: [], stats }, questions: [], more: [] }));
    expect(screen.queryByText(/승인은 막지 않습니다/)).toBeNull();
    expect(screen.getByText('기존 글 대비 수치 2개')).toBeTruthy();
  });
});
