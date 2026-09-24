import { describe, test, expect } from 'vitest';
import { moveTopic } from './moveQueue.ts';
import { parseQueue, serializeQueue } from './queueFile.ts';

const SAMPLE = `# 큐

## 대기

- 대기 A
- 대기 B

## 후보

- 무카테고리 후보

### 프론트
- 프론트 후보

## 보류

- 보류 A

## 완료

- 2026-09-06 완료 A
`;

const queue = () => parseQueue(SAMPLE);

describe('moveTopic', () => {
  test('대기로 옮기면 대기 맨 아래에 붙는다(기존 순서 유지)', () => {
    const result = moveTopic(queue(), { from: '보류', to: '대기', index: 0, title: '보류 A' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queue.sections.대기.map((t) => t.title)).toEqual(['대기 A', '대기 B', '보류 A']);
    expect(result.queue.sections.보류).toEqual([]);
  });

  test('보류로 옮기면 보류 맨 아래에 붙는다', () => {
    const result = moveTopic(queue(), { from: '대기', to: '보류', index: 0, title: '대기 A' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queue.sections.보류.map((t) => t.title)).toEqual(['보류 A', '대기 A']);
  });

  test('후보로 옮기면 카테고리 없는 구간(첫 ### 앞) 끝에 넣어 카테고리가 붙지 않는다', () => {
    const result = moveTopic(queue(), { from: '대기', to: '후보', index: 1, title: '대기 B' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queue.sections.후보).toEqual([
      { title: '무카테고리 후보' },
      { title: '대기 B' },
      { title: '프론트 후보', category: '프론트' },
    ]);
    // 다시 쓰고 읽어도 카테고리가 생기지 않는다.
    const roundTrip = parseQueue(serializeQueue(result.queue));
    expect(roundTrip.sections.후보[1]).toEqual({ title: '대기 B' });
  });

  test('후보에서 나가면 카테고리를 잃는다(파일 형식상 후보 ### 소제목)', () => {
    const result = moveTopic(queue(), { from: '후보', to: '대기', index: 1, title: '프론트 후보' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queue.sections.대기.at(-1)).toEqual({ title: '프론트 후보' });
  });

  test('입력 큐를 바꾸지 않는다', () => {
    const original = queue();
    moveTopic(original, { from: '대기', to: '보류', index: 0, title: '대기 A' });

    expect(original.sections.대기.map((t) => t.title)).toEqual(['대기 A', '대기 B']);
  });

  test('그 위치의 제목이 다르면 TOPIC_MISMATCH', () => {
    const result = moveTopic(queue(), { from: '대기', to: '보류', index: 0, title: '다른 제목' });

    expect(result).toEqual({ ok: false, code: 'TOPIC_MISMATCH' });
  });

  test('없는 위치면 TOPIC_MISMATCH', () => {
    const result = moveTopic(queue(), { from: '보류', to: '대기', index: 9, title: '보류 A' });

    expect(result).toEqual({ ok: false, code: 'TOPIC_MISMATCH' });
  });

  test('같은 섹션이면 INVALID_SECTION', () => {
    const result = moveTopic(queue(), { from: '대기', to: '대기', index: 0, title: '대기 A' });

    expect(result).toEqual({ ok: false, code: 'INVALID_SECTION' });
  });

  test('완료에서 옮기지 않는다(완료일이 사라진다)', () => {
    const result = moveTopic(queue(), { from: '완료', to: '대기', index: 0, title: '완료 A' });

    expect(result).toEqual({ ok: false, code: 'INVALID_SECTION' });
  });

  test('완료 섹션과 preamble은 그대로 둔다', () => {
    const result = moveTopic(queue(), { from: '대기', to: '후보', index: 0, title: '대기 A' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queue.sections.완료).toEqual([{ title: '완료 A', completedOn: '2026-09-06' }]);
    expect(result.queue.preamble).toBe('# 큐');
  });
});

const SERIES_SAMPLE = `## 대기

- 대기 A

## 후보

- 무카테고리 후보

### 시리즈

시리즈 A. 앱 만들기
- [A-1] 첫 편
- [A-2] 둘째 편

시리즈 B. 다른 앱
- [B-1] 다른 첫 편

## 보류

## 완료
`;

describe('moveTopic — 시리즈', () => {
  test('태그를 들고 가고, 정의 줄은 후보 제자리에 남는다', () => {
    const q = parseQueue(SERIES_SAMPLE);
    const result = moveTopic(q, { from: '후보', to: '대기', index: 1, title: '첫 편' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queue.sections.대기.at(-1)).toEqual({
      title: '첫 편',
      series: { key: 'A', episode: 1 },
    });
    expect(serializeQueue(result.queue)).toBe(
      SERIES_SAMPLE.replace('- [A-1] 첫 편\n', '').replace(
        '- 대기 A\n',
        '- 대기 A\n- [A-1] 첫 편\n',
      ),
    );
  });

  test('후보로 되돌려도 뒤쪽 정의 줄이 제 편 앞에 남는다', () => {
    const q = parseQueue(SERIES_SAMPLE.replace('- 대기 A', '- [B-2] 둘째 다른 편'));
    const result = moveTopic(q, { from: '대기', to: '후보', index: 0, title: '둘째 다른 편' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reread = parseQueue(serializeQueue(result.queue));
    expect(reread.sections.후보[1]).toEqual({
      title: '둘째 다른 편',
      series: { key: 'B', episode: 2 },
    });
    expect(reread.seriesDefs).toEqual(result.queue.seriesDefs);
    expect(reread.seriesDefs.map((d) => [d.key, d.position])).toEqual([
      ['A', 2],
      ['B', 4],
    ]);
  });
});
