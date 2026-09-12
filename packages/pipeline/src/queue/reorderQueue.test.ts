import { describe, test, expect } from 'vitest';
import { reorderTopic } from './reorderQueue.ts';
import { parseQueue, serializeQueue } from './queueFile.ts';

const SAMPLE = `# 큐

## 대기

- 대기 A
- 대기 B
- 대기 C

## 후보

- 무카테고리 후보

### 프론트
- 프론트 후보

## 보류

## 완료

- 2026-09-06 완료 A
`;

const queue = () => parseQueue(SAMPLE);
const titles = (q: ReturnType<typeof queue>, status: '대기' | '후보') =>
  q.sections[status].map((t) => t.title);

describe('reorderTopic', () => {
  test('아래로 옮기면 그 자리에 놓인다', () => {
    const result = reorderTopic(queue(), { status: '대기', from: 0, to: 2, title: '대기 A' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(titles(result.queue, '대기')).toEqual(['대기 B', '대기 C', '대기 A']);
  });

  test('위로 옮기면 그 자리에 놓인다', () => {
    const result = reorderTopic(queue(), { status: '대기', from: 2, to: 0, title: '대기 C' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(titles(result.queue, '대기')).toEqual(['대기 C', '대기 A', '대기 B']);
  });

  // 후보에서 줄 순서를 바꾸면 무카테고리 항목이 직전 ### 아래로 들어가 카테고리가 생긴다
  // (serializeQueue는 category가 undefined로 바뀔 때 헤딩을 쓰지 않는다). 그래서 막는다.
  test('후보 섹션은 지원하지 않는다(### 소제목 때문에 카테고리가 바뀐다)', () => {
    const result = reorderTopic(queue(), { status: '후보', from: 1, to: 0, title: '프론트 후보' });

    expect(result).toEqual({ ok: false, code: 'UNSUPPORTED_SECTION' });
  });

  test('대기 순서를 바꾼 뒤 다시 읽어도 그대로다(라운드트립)', () => {
    const result = reorderTopic(queue(), { status: '대기', from: 0, to: 2, title: '대기 A' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roundTrip = parseQueue(serializeQueue(result.queue));
    expect(roundTrip.sections.대기.map((t) => t.title)).toEqual(['대기 B', '대기 C', '대기 A']);
    expect(roundTrip.sections.후보).toEqual([
      { title: '무카테고리 후보' },
      { title: '프론트 후보', category: '프론트' },
    ]);
  });

  test('입력 큐를 바꾸지 않는다', () => {
    const original = queue();
    reorderTopic(original, { status: '대기', from: 0, to: 2, title: '대기 A' });

    expect(titles(original, '대기')).toEqual(['대기 A', '대기 B', '대기 C']);
  });

  test('다른 섹션·완료일은 그대로 둔다', () => {
    const result = reorderTopic(queue(), { status: '대기', from: 0, to: 1, title: '대기 A' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queue.sections.완료).toEqual([{ title: '완료 A', completedOn: '2026-09-06' }]);
    expect(result.queue.preamble).toBe('# 큐');
  });

  test('그 위치의 제목이 다르면 TOPIC_MISMATCH', () => {
    const result = reorderTopic(queue(), { status: '대기', from: 0, to: 1, title: '다른 제목' });

    expect(result).toEqual({ ok: false, code: 'TOPIC_MISMATCH' });
  });

  test('같은 자리면 INVALID_POSITION', () => {
    const result = reorderTopic(queue(), { status: '대기', from: 1, to: 1, title: '대기 B' });

    expect(result).toEqual({ ok: false, code: 'INVALID_POSITION' });
  });

  test('범위 밖이면 INVALID_POSITION', () => {
    expect(reorderTopic(queue(), { status: '대기', from: 0, to: 9, title: '대기 A' })).toEqual({
      ok: false,
      code: 'INVALID_POSITION',
    });
    expect(reorderTopic(queue(), { status: '대기', from: 9, to: 0, title: '대기 A' })).toEqual({
      ok: false,
      code: 'INVALID_POSITION',
    });
  });
});
