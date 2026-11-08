import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TopicEvidenceProvider, useTopicEvidenceEdit } from './TopicEvidenceEdit';

const actions = {
  load: vi.fn(),
  search: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
};

const link = (analysisId: string, title: string, source: 'auto' | 'manual', reason?: string) => ({
  analysisId,
  title,
  summary: `${title} 요약`,
  meta: '영역 · spacehome',
  source,
  sourceLabel: source === 'manual' ? '수동' : '자동',
  reason,
});
const hit = (analysisId: string, title: string, linked: boolean) => ({
  analysisId,
  title,
  summary: `${title} 요약`,
  meta: '변경 · spacehome · 2024-03',
  linked,
});

function Opener() {
  const open = useTopicEvidenceEdit();
  return <button onClick={() => open({ id: 't1', title: '무한 스크롤' })}>근거 편집 열기</button>;
}

async function openDialog() {
  render(
    <TopicEvidenceProvider actions={actions}>
      <Opener />
    </TopicEvidenceProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '근거 편집 열기' }));
  return waitFor(() => screen.getByRole('dialog'));
}

beforeEach(() => {
  actions.load.mockReset();
  actions.search.mockReset();
  actions.add.mockReset();
  actions.remove.mockReset();
});

describe('근거 편집 Dialog', () => {
  it('열리면 목록을 읽어 소스 배지·보조·이유와 함께 보인다, 빈 목록은 안내', async () => {
    actions.load.mockResolvedValue({
      ok: true,
      data: {
        links: [
          link('a1', '목록 화면', 'manual'),
          link('a2', '3월 변경', 'auto', '키워드 react-router · 기간 일치'),
        ],
      },
    });
    await openDialog();

    expect(screen.getByRole('heading', { name: '무한 스크롤 — 근거 편집' })).toBeTruthy();
    const list = await screen.findByRole('list', { name: '연결된 근거' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('목록 화면');
    expect(items[0]!.textContent).toContain('수동');
    expect(items[0]!.textContent).toContain('영역 · spacehome');
    expect(items[1]!.textContent).toContain('자동');
    expect(items[1]!.textContent).toContain('영역 · spacehome · 키워드 react-router · 기간 일치');
    expect(screen.getByRole('heading', { name: '연결된 근거 2건' })).toBeTruthy();
    expect(actions.load).toHaveBeenCalledWith('t1');
  });

  it('목록이 비면 안내 문구, 읽기 실패는 alert', async () => {
    actions.load.mockResolvedValue({ ok: true, data: { links: [] } });
    await openDialog();
    expect(
      await screen.findByText('연결된 근거가 없습니다. 아래에서 검색해 추가하세요.'),
    ).toBeTruthy();
  });

  it('읽기 실패는 alert로 알린다', async () => {
    actions.load.mockResolvedValue({
      ok: false,
      error: { code: 'TOPIC_NOT_FOUND', message: '큐에 없는 주제입니다.' },
    });
    await openDialog();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('큐에 없는 주제입니다.'),
    );
  });

  it('검색하면 결과를 보이고, "추가"는 add를 부른 뒤 목록과 결과를 다시 읽는다; 이미 연결된 글은 "연결됨"', async () => {
    actions.load
      .mockResolvedValueOnce({ ok: true, data: { links: [] } })
      .mockResolvedValue({ ok: true, data: { links: [link('a1', '3월 변경', 'manual')] } });
    actions.search
      .mockResolvedValueOnce({
        ok: true,
        data: { hits: [hit('a1', '3월 변경', false), hit('a2', '목록 화면', true)] },
      })
      .mockResolvedValue({
        ok: true,
        data: { hits: [hit('a1', '3월 변경', true), hit('a2', '목록 화면', true)] },
      });
    actions.add.mockResolvedValue({ ok: true });
    await openDialog();

    fireEvent.change(screen.getByRole('textbox', { name: '검색어' }), {
      target: { value: ' react ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));

    const results = await screen.findByRole('list', { name: '검색 결과' });
    expect(actions.search).toHaveBeenCalledWith('t1', 'react');
    expect(within(results).getAllByRole('listitem')).toHaveLength(2);
    expect(within(results).getByText('연결됨')).toBeTruthy();
    expect(within(results).queryByRole('button', { name: '목록 화면 추가' })).toBeNull();

    fireEvent.click(within(results).getByRole('button', { name: '3월 변경 추가' }));

    await waitFor(() => expect(actions.add).toHaveBeenCalledWith('t1', 'a1'));
    await waitFor(() => expect(actions.load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(actions.search).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: '연결된 근거 1건' })).toBeTruthy();
    // 결과 쪽도 연결됨으로 바뀐다
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: '검색 결과' })).getAllByText('연결됨'),
      ).toHaveLength(2),
    );
  });

  it('빈 검색어는 요청하지 않고, 결과가 없으면 안내', async () => {
    actions.load.mockResolvedValue({ ok: true, data: { links: [] } });
    actions.search.mockResolvedValue({ ok: true, data: { hits: [] } });
    await openDialog();

    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    expect(actions.search).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: '검색어' }), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    expect(await screen.findByText('"zzz"에 맞는 분석 글이 없습니다.')).toBeTruthy();
  });

  it('"제거"는 remove를 부르고 목록을 다시 읽는다, 실패는 alert', async () => {
    actions.load
      .mockResolvedValueOnce({ ok: true, data: { links: [link('a1', '목록 화면', 'auto')] } })
      .mockResolvedValue({ ok: true, data: { links: [] } });
    actions.remove.mockResolvedValueOnce({ ok: true }).mockResolvedValue({
      ok: false,
      error: { code: 'LINK_NOT_FOUND', message: '이미 뗀 근거입니다.' },
    });
    await openDialog();

    fireEvent.click(await screen.findByRole('button', { name: '목록 화면 제거' }));
    await waitFor(() => expect(actions.remove).toHaveBeenCalledWith('t1', 'a1'));
    expect(
      await screen.findByText('연결된 근거가 없습니다. 아래에서 검색해 추가하세요.'),
    ).toBeTruthy();
  });

  it('편집 실패는 alert로, 요청이 던지면 다시 시도 안내', async () => {
    actions.load.mockResolvedValue({
      ok: true,
      data: { links: [link('a1', '목록 화면', 'auto'), link('a2', '장바구니', 'manual')] },
    });
    actions.remove
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'LINK_NOT_FOUND', message: '이미 뗀 근거입니다.' },
      })
      .mockRejectedValueOnce(new Error('network'));
    await openDialog();

    fireEvent.click(await screen.findByRole('button', { name: '목록 화면 제거' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('이미 뗀 근거입니다.'));

    fireEvent.click(screen.getByRole('button', { name: '장바구니 제거' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        '요청이 실패했습니다. 다시 시도해 주세요.',
      ),
    );
    // 실패해도 목록은 다시 읽지 않는다(처음 1번뿐)
    expect(actions.load).toHaveBeenCalledTimes(1);
  });
});
