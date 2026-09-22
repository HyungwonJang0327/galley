import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEvidenceBundle, stripSnippets, type EvidenceBundle } from './bundle.ts';
import { LocalFsEvidenceStore } from './EvidenceStore.ts';

const BUNDLE: EvidenceBundle = {
  version: 1,
  runId: 'run_1',
  topicId: 't1',
  topicSlug: '무한-스크롤',
  collectedAt: '2026-09-22T00:00:00.000Z',
  items: [
    {
      analysisId: 'a1',
      commit: 'abc1234',
      path: 'src/a.ts',
      lineRange: { start: 1, end: 2 },
      date: '2024-03-05T10:00:00+09:00',
      note: 'entry',
      source: 'linked',
      redacted: false,
      truncated: false,
      snippet: 'const secret = 1;\n',
    },
  ],
  analyses: [{ id: 'a1', kind: 'area', title: 'src 영역', summary: '요약.' }],
  unreadable: 0,
  filtered: true,
};

describe('stripSnippets · parseEvidenceBundle', () => {
  test('posts 쪽 사본에는 snippet 키가 없다', () => {
    const pointers = stripSnippets(BUNDLE);
    expect(JSON.stringify(pointers)).not.toContain('snippet');
    expect(JSON.stringify(pointers)).not.toContain('secret');
    expect(pointers.items[0]).toMatchObject({ commit: 'abc1234', lineRange: { start: 1, end: 2 } });
    expect(BUNDLE.items[0]!.snippet).toBe('const secret = 1;\n'); // 원본 불변
  });

  test('라운드트립·형식 검증', () => {
    expect(parseEvidenceBundle(JSON.parse(JSON.stringify(BUNDLE)))).toEqual({
      ok: true,
      bundle: BUNDLE,
    });
    expect(parseEvidenceBundle(stripSnippets(BUNDLE))).toEqual({
      ok: false,
      code: 'EVIDENCE_BUNDLE_INVALID',
    }); // snippet 없음
    expect(parseEvidenceBundle({ ...BUNDLE, version: 2 })).toMatchObject({ ok: false });
    // analyses는 옵션 — 없으면 빈 배열, 형식이 틀리면 거부
    const { analyses: _a, ...withoutAnalyses } = BUNDLE;
    void _a;
    const parsed = parseEvidenceBundle(withoutAnalyses);
    expect(parsed.ok && parsed.bundle.analyses).toEqual([]);
    expect(parseEvidenceBundle({ ...BUNDLE, analyses: [{ id: 'x' }] })).toMatchObject({
      ok: false,
    });
    expect(
      parseEvidenceBundle({
        ...BUNDLE,
        items: [{ ...BUNDLE.items[0], lineRange: { start: 3, end: 2 } }],
      }),
    ).toMatchObject({ ok: false });
    expect(parseEvidenceBundle('x')).toMatchObject({ ok: false });
  });
});

describe('LocalFsEvidenceStore', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'galley-evidence-store-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('DATA_DIR/evidence/<슬러그>/<runId>.json에 쓰고 읽고 지운다, 없으면 MISSING·깨지면 INVALID', async () => {
    const store = new LocalFsEvidenceStore(dir);
    await store.write(BUNDLE);
    expect(store.pathFor(BUNDLE.topicSlug, BUNDLE.runId)).toBe(
      join(dir, 'evidence', '무한-스크롤', 'run_1.json'),
    );
    expect(await store.read(BUNDLE.topicSlug, BUNDLE.runId)).toEqual({ ok: true, bundle: BUNDLE });
    expect(await store.read('없음', 'run_1')).toEqual({
      ok: false,
      code: 'EVIDENCE_BUNDLE_MISSING',
    });
    const raw = await readFile(store.pathFor(BUNDLE.topicSlug, BUNDLE.runId), 'utf8');
    expect(raw).toContain('"snippet"');
    await store.write({ ...BUNDLE, runId: 'run_2', items: [] });
    await store.remove(BUNDLE.topicSlug, 'run_2');
    await store.remove(BUNDLE.topicSlug, 'run_2'); // 없어도 조용히
    expect(await store.read(BUNDLE.topicSlug, 'run_2')).toEqual({
      ok: false,
      code: 'EVIDENCE_BUNDLE_MISSING',
    });
  });

  test('슬러그·runId의 경로 구분자·..는 파일 이름으로만 쓴다(dataDir 밖으로 못 나간다)', () => {
    const store = new LocalFsEvidenceStore(dir);
    expect(store.pathFor('../x/y', '../../z')).toBe(join(dir, 'evidence', '__x_y', '____z.json'));
  });
});
