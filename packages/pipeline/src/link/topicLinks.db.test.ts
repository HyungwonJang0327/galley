// 통합: 임시 SQLite. 연결 목록(순서·이유)·검색(연결 상태 표시)·추가(승격)·제거(dismissed)를 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { addTopicLink, listTopicLinks, removeTopicLink, searchAnalyses } from './topicLinks.ts';
import { linkTopicAuto, loadAnalysisCandidates } from './autoLink.ts';
import { LINK_SOURCE, serializeStringArray } from '../index/schema.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
let dir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-topiclinks-'));
  const url = `file:${join(dir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});
beforeEach(async () => {
  await prisma.topicAnalysisLink.deleteMany();
  await prisma.repoAnalysis.deleteMany();
  await prisma.repo.deleteMany();
  await prisma.queueItem.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

async function seed() {
  const sh = await prisma.repo.create({ data: { name: 'spacehome', path: join(dir, 'sh') } });
  const vm = await prisma.repo.create({ data: { name: 'vendor-manager', path: join(dir, 'vm') } });
  const analysis = (
    repoId: string,
    key: string,
    kind: string,
    title: string,
    keywords: string[],
    period: string | null = null,
  ) =>
    prisma.repoAnalysis.create({
      data: {
        repoId,
        kind,
        key,
        title,
        summary: `${title} 요약`,
        keywords: serializeStringArray(keywords),
        pointers: JSON.stringify([{ commit: 'abc1234', path: 'x' }]),
        period,
        modelId: 'mock',
      },
    });
  const area = await analysis(sh.id, 'area:src/list', 'area', '목록 화면', [
    'react-router',
    'scroll',
  ]);
  const chg = await analysis(
    sh.id,
    'change:2024-03',
    'change',
    '3월 변경',
    ['react-router'],
    '2024-03',
  );
  const other = await analysis(sh.id, 'area:src/cart', 'area', '장바구니', ['cart']);
  const vmOv = await analysis(vm.id, 'overview', 'overview', 'Vendor Manager 전체', ['vendor']);
  const topic = await prisma.queueItem.create({
    data: {
      title: '무한 스크롤',
      status: 'waiting',
      order: 0,
      repoNames: serializeStringArray(['spacehome']),
      keywords: serializeStringArray(['react-router']),
      period: '2024-03',
    },
  });
  return { sh, vm, area, chg, other, vmOv, topic };
}
const sourcesOf = async (topicId: string) =>
  Object.fromEntries(
    (await prisma.topicAnalysisLink.findMany({ where: { topicId } })).map((l) => [
      l.analysisId,
      l.source,
    ]),
  );

describe('listTopicLinks', () => {
  test('manual → auto 순, dismissed는 빼고, 이유는 규칙으로 다시 계산(수동만 붙인 글은 null)', async () => {
    const { area, chg, other, vmOv, topic } = await seed();
    await prisma.topicAnalysisLink.createMany({
      data: [
        { topicId: topic.id, analysisId: area.id, source: LINK_SOURCE.auto },
        { topicId: topic.id, analysisId: chg.id, source: LINK_SOURCE.auto },
        { topicId: topic.id, analysisId: vmOv.id, source: LINK_SOURCE.manual }, // 다른 리포 — 규칙 밖
        { topicId: topic.id, analysisId: other.id, source: LINK_SOURCE.dismissed },
      ],
    });
    const r = await listTopicLinks(prisma, topic.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.links.map((l) => [l.analysisId, l.source, l.match])).toEqual([
      [vmOv.id, 'manual', null],
      [area.id, 'auto', { reasons: ['keyword'], matchedKeywords: ['react-router'] }],
      [chg.id, 'auto', { reasons: ['keyword', 'period'], matchedKeywords: ['react-router'] }],
    ]);
    expect(r.links[0]).toMatchObject({
      kind: 'overview',
      title: 'Vendor Manager 전체',
      summary: 'Vendor Manager 전체 요약',
      repoName: 'vendor-manager',
      key: 'overview',
      period: null,
    });
    expect(await listTopicLinks(prisma, 'nope')).toEqual({ ok: false, code: 'TOPIC_NOT_FOUND' });
  });
});

describe('searchAnalyses', () => {
  test('제목·키·키워드 부분 일치(대소문자 무시), 이 주제와의 연결 상태를 붙인다, 빈 질의는 빈 결과', async () => {
    const { area, chg, other, topic } = await seed();
    await prisma.topicAnalysisLink.createMany({
      data: [
        { topicId: topic.id, analysisId: area.id, source: LINK_SOURCE.auto },
        { topicId: topic.id, analysisId: other.id, source: LINK_SOURCE.dismissed },
      ],
    });
    // 키워드 'react-router'(area·chg) — 대문자 질의도 소문자로 맞춰 찾는다
    expect(
      (await searchAnalyses(prisma, { topicId: topic.id, query: 'React-Router' })).map((h) => [
        h.analysisId,
        h.linkSource,
      ]),
    ).toEqual([
      [area.id, 'auto'],
      [chg.id, null],
    ]);
    // 제목 부분 일치
    expect(
      (await searchAnalyses(prisma, { topicId: topic.id, query: '장바구니' })).map((h) => [
        h.analysisId,
        h.linkSource,
      ]),
    ).toEqual([[other.id, 'dismissed']]);
    // 키 일치 + 상한
    expect(
      (await searchAnalyses(prisma, { topicId: topic.id, query: 'area:', limit: 1 })).map(
        (h) => h.analysisId,
      ),
    ).toEqual([other.id]); // spacehome → area → 'area:src/cart' < 'area:src/list'
    expect(
      (await searchAnalyses(prisma, { topicId: topic.id, query: 'vendor' })).map((h) => h.title),
    ).toEqual(['Vendor Manager 전체']);
    expect(await searchAnalyses(prisma, { topicId: topic.id, query: '   ' })).toEqual([]);
  });
});

describe('addTopicLink · removeTopicLink', () => {
  test('추가는 manual 생성, auto·dismissed면 승격, 이미 manual이면 그대로; 없는 주제·글은 코드', async () => {
    const { area, chg, other, topic } = await seed();
    await prisma.topicAnalysisLink.createMany({
      data: [
        { topicId: topic.id, analysisId: area.id, source: LINK_SOURCE.auto },
        { topicId: topic.id, analysisId: other.id, source: LINK_SOURCE.dismissed },
      ],
    });
    expect(await addTopicLink(prisma, { topicId: topic.id, analysisId: chg.id })).toEqual({
      ok: true,
      previous: null,
    });
    expect(await addTopicLink(prisma, { topicId: topic.id, analysisId: area.id })).toEqual({
      ok: true,
      previous: 'auto',
    });
    expect(await addTopicLink(prisma, { topicId: topic.id, analysisId: other.id })).toEqual({
      ok: true,
      previous: 'dismissed',
    });
    expect(await addTopicLink(prisma, { topicId: topic.id, analysisId: other.id })).toEqual({
      ok: true,
      previous: 'manual',
    });
    expect(await sourcesOf(topic.id)).toEqual({
      [chg.id]: 'manual',
      [area.id]: 'manual',
      [other.id]: 'manual',
    });
    expect(await addTopicLink(prisma, { topicId: 'nope', analysisId: chg.id })).toEqual({
      ok: false,
      code: 'TOPIC_NOT_FOUND',
    });
    expect(await addTopicLink(prisma, { topicId: topic.id, analysisId: 'nope' })).toEqual({
      ok: false,
      code: 'ANALYSIS_NOT_FOUND',
    });
  });

  test('제거는 지우지 않고 dismissed로 — 자동 연결 재계산이 되살리지 않고, 다시 추가하면 manual', async () => {
    const { area, chg, topic } = await seed();
    const candidates = await loadAnalysisCandidates(prisma);
    await linkTopicAuto(prisma, topic.id, candidates, new Date());
    expect(await sourcesOf(topic.id)).toEqual({ [area.id]: 'auto', [chg.id]: 'auto' });

    expect(await removeTopicLink(prisma, { topicId: topic.id, analysisId: area.id })).toEqual({
      ok: true,
      previous: 'auto',
    });
    expect(await removeTopicLink(prisma, { topicId: topic.id, analysisId: area.id })).toEqual({
      ok: false,
      code: 'LINK_NOT_FOUND',
    });
    expect(await removeTopicLink(prisma, { topicId: topic.id, analysisId: 'nope' })).toEqual({
      ok: false,
      code: 'LINK_NOT_FOUND',
    });
    // 재계산: area는 규칙에 맞지만 dismissed라 돌아오지 않는다
    await prisma.queueItem.update({ where: { id: topic.id }, data: { autoLinkedAt: null } });
    await linkTopicAuto(prisma, topic.id, candidates, new Date());
    expect(await sourcesOf(topic.id)).toEqual({ [area.id]: 'dismissed', [chg.id]: 'auto' });
    const listed = await listTopicLinks(prisma, topic.id);
    expect(listed.ok && listed.links.map((l) => l.analysisId)).toEqual([chg.id]);

    // manual 제거도 dismissed
    await addTopicLink(prisma, { topicId: topic.id, analysisId: area.id });
    expect(await removeTopicLink(prisma, { topicId: topic.id, analysisId: area.id })).toEqual({
      ok: true,
      previous: 'manual',
    });
    expect((await sourcesOf(topic.id))[area.id]).toBe('dismissed');
  });
});
