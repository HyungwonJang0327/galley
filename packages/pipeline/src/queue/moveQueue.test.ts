import { describe, test, expect } from 'vitest';
import { moveTopic } from './moveQueue';
import { parseQueue, serializeQueue } from './queueFile';

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
