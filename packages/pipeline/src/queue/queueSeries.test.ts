import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { summarizeQueueSeries, loadQueueSeries } from './queueSeries.ts';
import { parseQueue } from './queueFile.ts';

const QUEUE = `## 대기

- [A-2] 둘째 편
- [D-1] 편이 옮겨진 시리즈
- 일반 주제

## 후보

### 프론트

- 일반 후보

### 시리즈

시리즈 A. 앱 만들기 (ja: アプリ)
- [A-3] 셋째 편

시리즈 D. 정의만 남은 시리즈

시리즈 E. 편 없는 시리즈

## 보류

- [A-4] 직접 보류한 편

## 완료

- 2026-09-20 [A-1] 첫 편 (posts/first)
`;

describe('summarizeQueueSeries', () => {
  test('정의 줄 순서대로, 편 수는 네 섹션 전부(M)와 상태별로', () => {
    expect(summarizeQueueSeries(parseQueue(QUEUE))).toEqual([
      {
        key: 'A',
        name: '앱 만들기',
        category: '시리즈',
        position: 1,
        episodeCount: 4,
        byStatus: { 대기: 1, 후보: 1, 보류: 1, 완료: 1 },
      },
      {
        key: 'D',
        name: '정의만 남은 시리즈',
        category: '시리즈',
        position: 2,
        episodeCount: 1,
        byStatus: { 대기: 1, 후보: 0, 보류: 0, 완료: 0 },
      },
      {
        key: 'E',
        name: '편 없는 시리즈',
        category: '시리즈',
        position: 2,
        episodeCount: 0,
        byStatus: { 대기: 0, 후보: 0, 보류: 0, 완료: 0 },
      },
    ]);
  });

  test('같은 키 정의 줄이 둘이면 첫 것만(사람 실수 — 툴팁 이름과 헤더가 어긋나지 않게)', () => {
    const q = parseQueue(QUEUE.replace('시리즈 E. 편 없는 시리즈', '시리즈 A. 중복 정의'));
    const summary = summarizeQueueSeries(q);
    expect(summary.map((s) => [s.key, s.name])).toEqual([
      ['A', '앱 만들기'],
      ['D', '정의만 남은 시리즈'],
    ]);
  });

  test('정의 줄 없는 태그 편은 요약에 나오지 않는다(이름을 지어내지 않음)', () => {
    const q = parseQueue('## 대기\n\n- [Z-1] 정의 없는 편\n\n## 후보\n\n## 보류\n\n## 완료\n');
    expect(summarizeQueueSeries(q)).toEqual([]);
  });

  test('실제 모양 픽스처: 정의 7개, 편 없는 시리즈는 후보 위치가 다음 정의와 같다', () => {
    const raw = readFileSync(new URL('./__fixtures__/series.md', import.meta.url), 'utf8');
    const summary = summarizeQueueSeries(parseQueue(raw));
    expect(summary.map((s) => s.key)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const d = summary.find((s) => s.key === 'D');
    const e = summary.find((s) => s.key === 'E');
    expect(d?.byStatus.후보).toBe(0);
    expect(d?.byStatus.대기).toBe(3);
    expect(d?.position).toBe(e?.position);
    expect(summary.reduce((n, s) => n + s.episodeCount, 0)).toBe(18);
  });
});

test('loadQueueSeries는 파일을 한 번 읽는다', async () => {
  let reads = 0;
  const storage = {
    readQueueFile: async () => {
      reads += 1;
      return QUEUE;
    },
    writeQueueFile: async () => {},
  };
  const summary = await loadQueueSeries({ storage });
  expect(summary.map((s) => s.key)).toEqual(['A', 'D', 'E']);
  expect(reads).toBe(1);
});
