import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import { EVIDENCE_ARTIFACT } from './evidenceStep.ts';
import { createMockStepRunner, MOCK_ARTIFACT_NAME } from './MockStepRunner.ts';
import { parsePublishTitle } from './publishInfo.ts';
import { StepFailure, toStepFailure } from './StepRunner.ts';
import { STEP_ORDER } from '../run/stateMachine.ts';

const ctx = (step: (typeof STEP_ORDER)[number], extra: Partial<{ instruction: string }> = {}) => ({
  runId: 'run_1',
  step,
  topic: { id: 't1', title: '무한 스크롤', slug: '무한-스크롤' },
  modelId: 'mock',
  sources: {},
  signal: new AbortController().signal,
  ...extra,
});

describe('createMockStepRunner', () => {
  it('단계마다 산출물을 하나씩 만든다', async () => {
    const runner = createMockStepRunner();

    for (const step of STEP_ORDER) {
      const result = await runner.run(ctx(step));
      expect(Object.keys(result.artifacts)).toHaveLength(1);
    }
  });

  it('같은 입력이면 같은 산출물(결정적)', async () => {
    const runner = createMockStepRunner();

    const a = await runner.run(ctx('velog'));
    const b = await runner.run(ctx('velog'));

    expect(a.artifacts).toEqual(b.artifacts);
  });

  it('수정 지시가 산출물에 반영된다(재실행 diff가 보이게)', async () => {
    const runner = createMockStepRunner();

    const first = await runner.run(ctx('velog'));
    const revised = await runner.run(ctx('velog', { instruction: '더 짧게' }));

    expect(revised.artifacts).not.toEqual(first.artifacts);
    expect(Object.values(revised.artifacts)[0]).toContain('더 짧게');
  });

  it('모델 없는 단계는 토큰·비용·모델을 비운다(워커가 추정하지 않는다)', async () => {
    const runner = createMockStepRunner();

    const withModel = await runner.run(ctx('velog'));
    const withoutModel = await runner.run(ctx('publishInfo'));

    expect(withModel.model).toBe('mock');
    expect(withoutModel.model).toBeUndefined();
    expect(withoutModel.tokens).toBeUndefined();
    expect(withoutModel.costUsd).toBeUndefined();
  });

  it('검증 플래그는 결과에 실려 오지만 실패가 아니다', async () => {
    const runner = createMockStepRunner({ verifyFlags: { unsupported: 2, uncertain: 1 } });

    const result = await runner.run(ctx('verify'));

    expect(result.flags).toEqual({ unsupported: 2, uncertain: 1 });
  });

  it('지정한 단계에서 실패하고 재시도 가능 여부를 알린다', async () => {
    const runner = createMockStepRunner({
      failAt: { step: 'zenn', code: 'RATE_LIMITED', retryable: true },
    });

    await expect(runner.run(ctx('velog'))).resolves.toBeTruthy();
    await expect(runner.run(ctx('zenn'))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('failTimes만큼만 실패하고 그 뒤엔 성공한다(재시도 성공 경로)', async () => {
    const runner = createMockStepRunner({
      failAt: { step: 'velog', code: 'TIMEOUT', retryable: true },
      failTimes: 2,
    });

    await expect(runner.run(ctx('velog'))).rejects.toBeInstanceOf(StepFailure);
    await expect(runner.run(ctx('velog'))).rejects.toBeInstanceOf(StepFailure);
    await expect(runner.run(ctx('velog'))).resolves.toBeTruthy();
  });

  it('이미 끊긴 signal이면 아무것도 하지 않는다', async () => {
    const runner = createMockStepRunner();
    const controller = new AbortController();
    controller.abort();

    await expect(runner.run({ ...ctx('velog'), signal: controller.signal })).rejects.toBeTruthy();
  });
});

describe('createMockStepRunner — stores(DATA_DIR 쓰기, B3a M4)', () => {
  const clock = { now: () => new Date('2026-09-27T00:00:00.000Z') };

  async function withStores(
    fn: (deps: {
      dir: string;
      artifacts: LocalFsArtifactStore;
      evidence: LocalFsEvidenceStore;
    }) => Promise<void>,
  ) {
    const dir = await mkdtemp(join(tmpdir(), 'galley-mock-'));
    try {
      await fn({
        dir,
        artifacts: new LocalFsArtifactStore(dir),
        evidence: new LocalFsEvidenceStore(dir),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it('근거 수집 파일 이름은 실제 상수(EVIDENCE_ARTIFACT)와 같다(리터럴 고정)', () => {
    expect(MOCK_ARTIFACT_NAME.evidence).toBe(EVIDENCE_ARTIFACT);
  });

  it('실패하는 단계는 파일을 쓰지 않는다', async () => {
    await withStores(async ({ artifacts, evidence }) => {
      const runner = createMockStepRunner({
        stores: { artifacts, evidence },
        clock,
        failAt: { step: 'velog', code: 'BOOM' },
      });
      await expect(runner.run(ctx('velog'))).rejects.toMatchObject({ code: 'BOOM' });
      expect((await artifacts.read('무한-스크롤', 'run_1', 'velog.md')).ok).toBe(false);
    });
  });

  it('제목의 괄호 힌트(리포 별칭)는 실제 단계처럼 뗀다 — 본문 H1·Zenn title·발행정보·썸네일 파일명', async () => {
    await withStores(async ({ artifacts, evidence }) => {
      const runner = createMockStepRunner({ stores: { artifacts, evidence }, clock });
      const hinted = {
        ...ctx('velog'),
        topic: { id: 't1', title: '무한 스크롤 (spacehome)', slug: '무한-스크롤' },
      };
      for (const step of STEP_ORDER) await runner.run({ ...hinted, step });

      const read = async (name: string) => {
        const r = await artifacts.read('무한-스크롤', 'run_1', name);
        return r.ok ? r.text : r.code;
      };
      expect((await read('velog.md')).split('\n')[0]).toBe('# 무한 스크롤');
      const zenn = await read('zenn.md');
      expect(zenn).toContain('title: "무한 스크롤"');
      // H1은 frontmatter로 옮기고 본문에서 뗀다(실제 Zenn 단계와 같음).
      expect(zenn.split('---')[2]).not.toContain('# 무한 스크롤');
      expect(parsePublishTitle(await read('publish.md'))).toBe('무한 스크롤');
      expect(await read('publish.md')).toContain('무한_스크롤_썸네일.png');
      expect(await read('publish.md')).not.toContain('spacehome');
    });
  });

  it('(기존 글) 편은 본문·발행정보를 만들지 않는다(SERIES_EPISODE_ALREADY_PUBLISHED), 근거 수집·검증은 돈다', async () => {
    const runner = createMockStepRunner();
    const series = {
      key: 'A',
      name: '시리즈',
      episodeNo: 1,
      total: 3,
      alreadyPublished: true,
      previous: undefined,
      next: undefined,
    };
    await expect(runner.run({ ...ctx('velog'), series })).rejects.toMatchObject({
      code: 'SERIES_EPISODE_ALREADY_PUBLISHED',
      retryable: false,
    });
    await expect(runner.run({ ...ctx('publishInfo'), series })).rejects.toMatchObject({
      code: 'SERIES_EPISODE_ALREADY_PUBLISHED',
    });
    await expect(runner.run({ ...ctx('evidence'), series })).resolves.toBeTruthy();
  });

  it('저장이 실패하면 fs 메시지 대신 코드와 한 줄 문구(원인은 cause에)', async () => {
    const missing = { ok: false as const, code: 'ARTIFACT_MISSING' as const };
    const failing = {
      write: async () => {
        throw new Error('EACCES: /secret/data/artifacts');
      },
      writeBytes: async () => {},
      read: async () => missing,
      readBytes: async () => missing,
      remove: async () => {},
    };
    const evidence = {
      write: async () => {},
      read: async () => ({ ok: false as const, code: 'EVIDENCE_BUNDLE_MISSING' as const }),
      remove: async () => {},
    };
    const runner = createMockStepRunner({ stores: { artifacts: failing, evidence } });
    const error = await runner.run(ctx('velog')).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'MOCK_STORE_WRITE_FAILED', retryable: false });
    expect((error as Error).message).not.toContain('/secret');
    expect(((error as Error).cause as Error).message).toContain('EACCES');
  });

  it('6단계가 승인·미리보기가 읽는 파일을 실제 형식으로 쓴다', async () => {
    await withStores(async ({ dir, artifacts, evidence }) => {
      const runner = createMockStepRunner({
        stores: { artifacts, evidence },
        clock,
        verifyFlags: { unsupported: 2, uncertain: 1 },
      });
      for (const step of STEP_ORDER) await runner.run(ctx(step));

      const bundle = await evidence.read('무한-스크롤', 'run_1');
      expect(bundle.ok).toBe(true);
      if (!bundle.ok) return;
      expect(bundle.bundle.items.map((i) => i.source)).toEqual(['linked', 'discovered']);
      expect(bundle.bundle.filtered).toBe(true);
      expect(bundle.bundle.collectedAt).toBe('2026-09-27T00:00:00.000Z');
      expect(bundle.bundle.items[0]!.snippet).toContain('mock');

      const read = async (name: string) => {
        const r = await artifacts.read('무한-스크롤', 'run_1', name);
        if (!r.ok) throw new Error(`${name} ${r.code}`);
        return r.text;
      };
      expect((await read('velog.md')).split('\n')[0]).toBe('# 무한 스크롤');
      expect((await read('linkedin.md')).split('\n')[0]).toBe('# 무한 스크롤');
      const zenn = await read('zenn.md');
      expect(zenn.startsWith('---\n')).toBe(true);
      expect(zenn).toContain('published: false');
      expect(zenn).toContain('title: "무한 스크롤"');

      const report = JSON.parse(await read('verification.json'));
      expect(report.version).toBe(1);
      expect(report.counts).toEqual({ supported: 1, unsupported: 2, uncertain: 1 });
      expect(report.claims).toHaveLength(4);
      expect(report.sources).toEqual({ velog: 'run_1', evidence: 'run_1' });
      // 조각 히트 주장은 ref만(reason 없음), 줄 번호는 본문에 실제로 '20'이 있는 줄.
      expect(report.claims[0].reason).toBeUndefined();
      const velogLines = (await read('velog.md')).split('\n');
      expect(velogLines[report.claims[0].line - 1]).toContain('20');

      const publish = await read('publish.md');
      expect(parsePublishTitle(publish)).toBe('무한 스크롤');
      expect(publish).toContain('## 근거');
      expect(publish).toContain('무한_스크롤_썸네일.png');

      const png = await readFile(join(dir, 'artifacts', '무한-스크롤', 'run_1', 'thumbnail.png'));
      expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    });
  });

  it('carried 출처가 있으면 리포트 sources에 그 Run을 적는다', async () => {
    await withStores(async ({ artifacts, evidence }) => {
      const runner = createMockStepRunner({ stores: { artifacts, evidence }, clock });
      await runner.run({ ...ctx('verify'), sources: { evidence: 'run_0', velog: 'run_0' } });

      const r = await artifacts.read('무한-스크롤', 'run_1', 'verification.json');
      if (!r.ok) throw new Error(r.code);
      expect(JSON.parse(r.text).sources).toEqual({ velog: 'run_0', evidence: 'run_0' });
    });
  });

  it('같은 입력·같은 시각이면 파일 내용이 같다(결정적) — 번들 포함', async () => {
    await withStores(async ({ artifacts, evidence }) => {
      const runner = createMockStepRunner({ stores: { artifacts, evidence }, clock });
      const texts = async () => {
        const out: string[] = [];
        for (const step of STEP_ORDER) {
          await runner.run(ctx(step));
          if (step === 'evidence') {
            out.push(JSON.stringify(await evidence.read('무한-스크롤', 'run_1')));
            continue;
          }
          const r = await artifacts.read('무한-스크롤', 'run_1', MOCK_ARTIFACT_NAME[step]);
          out.push(r.ok ? r.text : r.code);
        }
        return out;
      };
      expect(await texts()).toEqual(await texts());
    });
  });

  it('discard는 그 단계 파일을 지운다(발행정보는 썸네일까지, 근거 수집은 번들)', async () => {
    await withStores(async ({ artifacts, evidence }) => {
      const runner = createMockStepRunner({ stores: { artifacts, evidence }, clock });
      for (const step of STEP_ORDER) await runner.run(ctx(step));

      await runner.discard!(ctx('publishInfo'));
      await runner.discard!(ctx('evidence'));

      expect((await artifacts.read('무한-스크롤', 'run_1', 'publish.md')).ok).toBe(false);
      expect((await artifacts.readBytes('무한-스크롤', 'run_1', 'thumbnail.png')).ok).toBe(false);
      expect((await evidence.read('무한-스크롤', 'run_1')).ok).toBe(false);
      expect((await artifacts.read('무한-스크롤', 'run_1', 'velog.md')).ok).toBe(true);
    });
  });
});

describe('toStepFailure', () => {
  it('StepFailure는 그대로 둔다', () => {
    const failure = new StepFailure('RATE_LIMITED', '잠시 뒤 다시', true);

    expect(toStepFailure(failure)).toBe(failure);
  });

  it('중단은 재시도 가능으로 본다', () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });

    expect(toStepFailure(aborted)).toMatchObject({ code: 'ABORTED', retryable: true });
  });

  it('그 밖의 예외는 영구 실패로 좁힌다', () => {
    expect(toStepFailure(new Error('boom'))).toMatchObject({
      code: 'STEP_FAILED',
      message: 'boom',
      retryable: false,
    });
  });
});
