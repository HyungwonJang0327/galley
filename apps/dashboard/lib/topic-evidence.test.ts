import { describe, it, expect, vi, afterEach } from 'vitest';

const { listTopicLinks, searchAnalyses, addTopicLink, removeTopicLink } = vi.hoisted(() => ({
  listTopicLinks: vi.fn(),
  searchAnalyses: vi.fn(),
  addTopicLink: vi.fn(),
  removeTopicLink: vi.fn(),
}));

// pipeline 경계만 가짜 — 연결 규칙 자체는 pipeline 테스트가 본다.
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  listTopicLinks,
  searchAnalyses,
  addTopicLink,
  removeTopicLink,
}));

import {
  addTopicEvidence,
  getTopicEvidence,
  linkView,
  removeTopicEvidence,
  searchHitView,
  searchTopicEvidence,
} from './topic-evidence';

const analysis = {
  analysisId: 'a1',
  kind: 'change' as const,
  title: '3월 변경',
  summary: '요약',
  repoName: 'spacehome',
  key: 'change:2024-03',
  period: '2024-03',
};

afterEach(() => {
  listTopicLinks.mockReset();
  searchAnalyses.mockReset();
  addTopicLink.mockReset();
  removeTopicLink.mockReset();
});

describe('linkView · searchHitView', () => {
  it('kind·리포·기간을 보조 한 줄로, 소스 배지 글자, 이유 문구(규칙 밖이면 없음)', () => {
    expect(
      linkView({
        ...analysis,
        source: 'auto',
        match: { reasons: ['keyword', 'period'], matchedKeywords: ['react-router', 'scroll'] },
      }),
    ).toEqual({
      analysisId: 'a1',
      title: '3월 변경',
      summary: '요약',
      meta: '변경 · spacehome · 2024-03',
      source: 'auto',
      sourceLabel: '자동',
      reason: '키워드 react-router, scroll · 기간 일치',
    });
    expect(
      linkView({
        ...analysis,
        kind: 'overview',
        period: null,
        source: 'manual',
        match: { reasons: ['repo'], matchedKeywords: [] },
      }),
    ).toMatchObject({ meta: '리포 전체 · spacehome', sourceLabel: '수동', reason: '리포 일치' });
    expect(
      linkView({ ...analysis, kind: 'area', period: null, source: 'manual', match: null }),
    ).toMatchObject({ meta: '영역 · spacehome', reason: undefined });
  });

  it('검색 결과의 linked는 manual·auto만 true(dismissed·없음은 추가 가능)', () => {
    expect(searchHitView({ ...analysis, linkSource: 'auto' }).linked).toBe(true);
    expect(searchHitView({ ...analysis, linkSource: 'manual' }).linked).toBe(true);
    expect(searchHitView({ ...analysis, linkSource: 'dismissed' }).linked).toBe(false);
    expect(searchHitView({ ...analysis, linkSource: null }).linked).toBe(false);
  });
});

describe('getTopicEvidence', () => {
  it('목록을 표시 모델로, 없는 주제는 코드+문구, 던지면 TOPIC_EVIDENCE_FAILED', async () => {
    listTopicLinks.mockResolvedValue({
      ok: true,
      links: [{ ...analysis, source: 'manual', match: null }],
    });
    const r = await getTopicEvidence('t1');
    expect(r.ok && r.data.links.map((l) => [l.analysisId, l.sourceLabel])).toEqual([
      ['a1', '수동'],
    ]);
    expect(listTopicLinks).toHaveBeenCalledWith({}, 't1');

    listTopicLinks.mockResolvedValue({ ok: false, code: 'TOPIC_NOT_FOUND' });
    expect(await getTopicEvidence('t1')).toMatchObject({
      ok: false,
      error: { code: 'TOPIC_NOT_FOUND', message: expect.stringContaining('큐에 없는 주제') },
    });

    listTopicLinks.mockRejectedValue(new Error('SQLITE_BUSY'));
    expect(await getTopicEvidence('t1')).toMatchObject({
      ok: false,
      error: { code: 'TOPIC_EVIDENCE_FAILED', message: expect.stringContaining('SQLITE_BUSY') },
    });
  });
});

describe('searchTopicEvidence · addTopicEvidence · removeTopicEvidence', () => {
  it('검색은 주제·질의를 넘기고 결과를 표시 모델로', async () => {
    searchAnalyses.mockResolvedValue([{ ...analysis, linkSource: null }]);
    const r = await searchTopicEvidence('t1', 'react');
    expect(searchAnalyses).toHaveBeenCalledWith({}, { topicId: 't1', query: 'react' });
    expect(r.ok && r.data.hits.map((h) => [h.analysisId, h.linked])).toEqual([['a1', false]]);
  });

  it('추가·제거 성공은 { ok:true }, 코드 실패는 문구를 붙인다', async () => {
    addTopicLink.mockResolvedValue({ ok: true, previous: null });
    expect(await addTopicEvidence('t1', 'a1')).toEqual({ ok: true });
    expect(addTopicLink).toHaveBeenCalledWith({}, { topicId: 't1', analysisId: 'a1' });
    addTopicLink.mockResolvedValue({ ok: false, code: 'ANALYSIS_NOT_FOUND' });
    expect(await addTopicEvidence('t1', 'a1')).toMatchObject({
      ok: false,
      error: { code: 'ANALYSIS_NOT_FOUND', message: expect.stringContaining('재인덱싱') },
    });

    removeTopicLink.mockResolvedValue({ ok: true, previous: 'auto' });
    expect(await removeTopicEvidence('t1', 'a1')).toEqual({ ok: true });
    removeTopicLink.mockResolvedValue({ ok: false, code: 'LINK_NOT_FOUND' });
    expect(await removeTopicEvidence('t1', 'a1')).toMatchObject({
      ok: false,
      error: { code: 'LINK_NOT_FOUND', message: '이미 뗀 근거입니다.' },
    });
    removeTopicLink.mockRejectedValue(new Error('boom'));
    expect(await removeTopicEvidence('t1', 'a1')).toMatchObject({
      ok: false,
      error: { code: 'TOPIC_EVIDENCE_FAILED' },
    });
  });
});
