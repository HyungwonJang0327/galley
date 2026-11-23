import { describe, test, expect } from 'vitest';
import {
  derivedPatchArtifact,
  parseDerivedPatchResult,
  parsePublishPatchResult,
  parseReviewResult,
  renderDerivedPatchResult,
  renderPublishPatchResult,
  type PublishPatchResult,
  renderReviewResult,
  type DerivedPatchResult,
  type ReviewResult,
} from './answerResult.ts';

describe('답 반영 결과 파일', () => {
  test('쓴 것을 그대로 읽는다', () => {
    const result: ReviewResult = {
      version: 1,
      baseRunId: 'run_1',
      applied: ['c1'],
      unapplied: [{ id: 'u1', code: 'PATCH_OUT_OF_SCOPE' }],
    };
    expect(parseReviewResult(renderReviewResult(result))).toEqual(result);
  });

  test('형식이 아니면 없는 것으로 다룬다', () => {
    for (const text of [
      '',
      '{',
      '[]',
      '{"version":2,"baseRunId":"r","applied":[],"unapplied":[]}',
      '{"version":1,"applied":[],"unapplied":[]}',
      '{"version":1,"baseRunId":"r","applied":[1],"unapplied":[]}',
      '{"version":1,"baseRunId":"r","applied":[],"unapplied":[{"id":"u1"}]}',
    ])
      expect(parseReviewResult(text)).toBeUndefined();
  });
});

describe('뒤 단계 고침 결과 파일', () => {
  test('단계마다 파일 이름이 다르다', () => {
    expect(derivedPatchArtifact('linkedin')).toBe('linkedin-patch.json');
    expect(derivedPatchArtifact('zenn')).toBe('zenn-patch.json');
  });

  test('쓴 것을 그대로 읽는다 — 사유는 이전 결과를 그대로 뒀을 때만', () => {
    const kept: DerivedPatchResult = {
      version: 1,
      baseRunId: 'run_1',
      status: 'kept',
      code: 'PATCH_OUT_OF_SCOPE',
    };
    expect(parseDerivedPatchResult(renderDerivedPatchResult(kept))).toEqual(kept);
    const patched: DerivedPatchResult = { version: 1, baseRunId: 'run_1', status: 'patched' };
    expect(parseDerivedPatchResult(renderDerivedPatchResult(patched))).toEqual(patched);
  });

  test('모르는 상태·형식은 없는 것으로, 모르는 사유는 버린다', () => {
    expect(parseDerivedPatchResult('{"version":1,"baseRunId":"r","status":"redone"}')).toBe(
      undefined,
    );
    expect(parseDerivedPatchResult('nope')).toBeUndefined();
    expect(
      parseDerivedPatchResult('{"version":1,"baseRunId":"r","status":"kept","code":"X"}'),
    ).toEqual({ version: 1, baseRunId: 'r', status: 'kept' });
  });
});

describe('발행정보 고침 결과 파일', () => {
  test('쓴 것을 그대로 읽는다', () => {
    const result: PublishPatchResult = {
      version: 1,
      baseRunId: 'run_1',
      status: 'patched',
      illustrations: [{ name: 'illust1_feed', paragraph: 2, line: 5 }],
    };
    expect(parsePublishPatchResult(renderPublishPatchResult(result))).toEqual(result);
  });

  test('형식이 아니면 undefined', () => {
    const base = { version: 1, baseRunId: 'run_1', status: 'unchanged', illustrations: [] };
    expect(parsePublishPatchResult(JSON.stringify(base))).toBeDefined();
    for (const broken of [
      '{ nope',
      JSON.stringify({ ...base, version: 2 }),
      JSON.stringify({ ...base, status: 'kept' }),
      JSON.stringify({ ...base, illustrations: [{ name: '', paragraph: 0, line: 1 }] }),
      JSON.stringify({ ...base, illustrations: [{ name: 'a', paragraph: 0.5, line: 1 }] }),
    ])
      expect(parsePublishPatchResult(broken)).toBeUndefined();
  });
});
