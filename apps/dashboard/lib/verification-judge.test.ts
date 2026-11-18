import { describe, it, expect } from 'vitest';
import type { VerificationView } from './run-artifacts';
import {
  judgeFailureCounts,
  judgeNote,
  verifyBadgeText,
  verifyBadgeTone,
} from './verification-judge';

const claim = (reason: string): VerificationView['claims'][number] => ({
  text: 't',
  kind: 'statement',
  status: 'uncertain',
  line: 1,
  reason: reason as 'judged',
});
const view = (over: Partial<VerificationView>): VerificationView => ({
  counts: { supported: 5, unsupported: 0, uncertain: 2 },
  claims: [],
  verbatimMatches: 0,
  judge: 'judged',
  ...over,
});

describe('verification-judge — 배지', () => {
  it('판정이 정상이면 "근거 없음 n · 불확실 n"뿐, 근거 없음이 있을 때만 주황', () => {
    expect(verifyBadgeText(view({}))).toBe('근거 없음 0 · 불확실 2');
    expect(verifyBadgeTone(view({}))).toBe('neutral');
    expect(verifyBadgeTone(view({ counts: { supported: 1, unsupported: 1, uncertain: 0 } }))).toBe(
      'warning',
    );
    expect(verifyBadgeText(view({ judge: 'skipped' }))).toBe('근거 없음 0 · 불확실 2');
  });

  it('잘림·깨짐은 주황 + 묶음 비율, 묶음 수가 없는 옛 파일은 비율 없이', () => {
    const t = view({
      judge: 'truncated',
      judgeBatches: { total: 5, judged: 4, truncated: 1, unparsed: 0 },
    });
    expect(verifyBadgeText(t)).toBe('근거 없음 0 · 불확실 2 · 판정 잘림 1/5');
    expect(verifyBadgeTone(t)).toBe('warning');
    expect(verifyBadgeText(view({ judge: 'truncated' }))).toBe(
      '근거 없음 0 · 불확실 2 · 판정 잘림',
    );
    const u = view({
      judge: 'unparsed',
      judgeBatches: { total: 4, judged: 2, truncated: 1, unparsed: 1 },
    });
    expect(verifyBadgeText(u)).toBe('근거 없음 0 · 불확실 2 · 판정 깨짐 2/4');
  });
});

describe('verification-judge — 안내문', () => {
  it('정상이고 상한 밖도 없으면 안내문 없음', () => {
    expect(judgeNote(view({}))).toBeUndefined();
    expect(judgeNote(view({ judge: 'skipped' }))).toBeUndefined();
  });

  it('잘림: 묶음 수와 그 묶음의 서술 수, 재실행 안내', () => {
    const v = view({
      judge: 'truncated',
      judgeBatches: { total: 5, judged: 4, truncated: 1, unparsed: 0 },
      claims: [claim('judge-truncated'), claim('judge-truncated'), claim('judged')],
    });
    expect(judgeFailureCounts(v)).toEqual({ truncated: 2, unparsed: 0, notJudged: 0 });
    expect(judgeNote(v)).toBe(
      '모델 판정 출력이 잘려 묶음 5개 중 1개(서술 2문장)가 불확실로 남았습니다. 근거 검증부터 재실행하면 다시 판정합니다.',
    );
  });

  it('옛 파일(묶음 수 없음)은 서술 수만, 깨짐+잘림 섞이면 "깨지거나 잘려"', () => {
    expect(judgeNote(view({ judge: 'unparsed', claims: [claim('judge-unparsed')] }))).toBe(
      '모델 판정 출력이 깨져 서술 1문장이 불확실로 남았습니다. 근거 검증부터 재실행하면 다시 판정합니다.',
    );
    expect(
      judgeNote(
        view({
          judge: 'unparsed',
          judgeBatches: { total: 3, judged: 1, truncated: 1, unparsed: 1 },
          claims: [claim('judge-unparsed'), claim('judge-truncated')],
        }),
      ),
    ).toBe(
      '모델 판정 출력이 깨지거나 잘려 묶음 3개 중 2개(서술 2문장)가 불확실로 남았습니다. 근거 검증부터 재실행하면 다시 판정합니다.',
    );
  });

  it('상한 밖(not-judged)은 정상 판정이어도 한 문장 덧붙인다', () => {
    expect(judgeNote(view({ claims: [claim('not-judged'), claim('not-judged')] }))).toBe(
      '판정 상한을 넘어 서술 2문장은 판정하지 않았습니다(불확실).',
    );
  });
});
