import { describe, test, expect } from 'vitest';
import { planExecution } from './batchControl.ts';

const KEYS = ['a', 'b', 'c', 'd', 'e'];

describe('planExecution', () => {
  test('옵션이 없으면 전부 순서대로', () => {
    expect(planExecution(KEYS, {})).toEqual({
      toRun: KEYS,
      resumedPast: 0,
      unchanged: 0,
      remaining: 0,
    });
  });

  test('resumeAfterKey는 그 키까지(포함) 건너뛰고, 목록에 없으면 처음부터', () => {
    expect(planExecution(KEYS, { resumeAfterKey: 'b' })).toMatchObject({
      toRun: ['c', 'd', 'e'],
      resumedPast: 2,
    });
    expect(planExecution(KEYS, { resumeAfterKey: 'zzz' })).toMatchObject({
      toRun: KEYS,
      resumedPast: 0,
    });
  });

  test('skipKeys·unchangedKeys는 각각 따로 세고, maxBatches를 넘는 것은 remaining', () => {
    expect(
      planExecution(KEYS, {
        skipKeys: ['a'],
        unchangedKeys: new Set(['c']),
        maxBatches: 1,
      }),
    ).toEqual({ toRun: ['b'], resumedPast: 1, unchanged: 1, remaining: 2 });
  });

  test('resumeAfterKey 뒤의 skipKeys도 센다', () => {
    expect(planExecution(KEYS, { resumeAfterKey: 'a', skipKeys: ['c'] })).toEqual({
      toRun: ['b', 'd', 'e'],
      resumedPast: 2,
      unchanged: 0,
      remaining: 0,
    });
  });
});
