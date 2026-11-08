import { describe, it, expect } from 'vitest';
import {
  ALREADY_PUBLISHED_REASON,
  MISSING_FROM_FILE_REASON,
  queueRowMenuEntries,
  parseMoveTarget,
  topicRunDisabledReason,
  RUN_NOW_ID,
  EDIT_EVIDENCE_ID,
} from './queue-row-menu';

const labels = (status: 'waiting' | 'candidate' | 'hold') =>
  queueRowMenuEntries(status).map((entry) => ('type' in entry ? '—' : entry.label));

describe('queueRowMenuEntries', () => {
  it('현재 섹션으로 가는 항목은 빼고 나머지 이동 2개를 준다', () => {
    expect(labels('waiting')).toEqual(['후보로', '보류로', '—', '근거 편집', '지금 실행']);
    expect(labels('candidate')).toEqual(['대기로', '보류로', '—', '근거 편집', '지금 실행']);
    expect(labels('hold')).toEqual(['대기로', '후보로', '—', '근거 편집', '지금 실행']);
  });

  it('"지금 실행"은 활성(실행 시작 Dialog를 연다)', () => {
    const runNow = queueRowMenuEntries('waiting').find(
      (entry) => !('type' in entry) && entry.id === RUN_NOW_ID,
    );

    expect(runNow).toEqual({ id: RUN_NOW_ID, label: '지금 실행' });
  });

  it('사유가 있으면 "지금 실행"만 비활성 + 사유(title)', () => {
    const entries = queueRowMenuEntries('candidate', {
      runDisabledReason: ALREADY_PUBLISHED_REASON,
    });
    expect(entries.map((entry) => ('type' in entry ? '—' : entry.label))).toEqual([
      '대기로',
      '보류로',
      '—',
      '근거 편집',
      '지금 실행',
    ]);
    // "근거 편집"은 사유와 무관하게 활성 — 실행 못 하는 주제도 근거는 손볼 수 있다
    expect(entries.at(-2)).toEqual({ id: EDIT_EVIDENCE_ID, label: '근거 편집' });
    expect(entries.at(-1)).toMatchObject({
      id: RUN_NOW_ID,
      disabled: true,
      disabledReason: ALREADY_PUBLISHED_REASON,
    });
  });
});

describe('topicRunDisabledReason', () => {
  it('파일에 있고 (기존 글)도 아니면 사유 없음', () => {
    expect(topicRunDisabledReason({ series: null, missing: null })).toBeUndefined();
    expect(
      topicRunDisabledReason({ series: { alreadyPublished: false }, missing: null }),
    ).toBeUndefined();
  });

  it('(기존 글) 편은 이미 발행된 글', () => {
    expect(topicRunDisabledReason({ series: { alreadyPublished: true }, missing: null })).toBe(
      ALREADY_PUBLISHED_REASON,
    );
  });

  it('파일에서 사라진 주제는 자동 보류·확인 대기 둘 다 같은 사유(서버 가드와 같은 판정)', () => {
    expect(topicRunDisabledReason({ series: null, missing: 'auto-held' })).toBe(
      MISSING_FROM_FILE_REASON,
    );
    expect(topicRunDisabledReason({ series: null, missing: 'pending' })).toBe(
      MISSING_FROM_FILE_REASON,
    );
  });

  it('사라짐이 (기존 글)보다 먼저다 — 그 줄은 지금 파일에 없다', () => {
    expect(topicRunDisabledReason({ series: { alreadyPublished: true }, missing: 'pending' })).toBe(
      MISSING_FROM_FILE_REASON,
    );
  });
});

describe('parseMoveTarget', () => {
  it('이동 항목 id에서 섹션을 뽑는다', () => {
    expect(parseMoveTarget('move:waiting')).toBe('waiting');
    expect(parseMoveTarget('move:hold')).toBe('hold');
  });

  it('이동 항목이 아니거나 모르는 섹션이면 null', () => {
    expect(parseMoveTarget(RUN_NOW_ID)).toBeNull();
    expect(parseMoveTarget('move:done')).toBeNull();
    expect(parseMoveTarget('move:대기')).toBeNull(); // 파일 어휘(한국어)는 메뉴 id가 아니다
    expect(parseMoveTarget('move:없는섹션')).toBeNull();
  });
});
