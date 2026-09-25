import { describe, test, expect } from 'vitest';
import { completeTopic, completedTitle, type CompleteTopicInput } from './completeQueue.ts';
import { parseQueue, serializeQueue } from './queueFile.ts';

const QUEUE = `## 대기

- [A-2] 둘째 편 (pono-web)
- 일반 주제

## 후보

### 시리즈

시리즈 A. 앱 만들기
- [A-3] 셋째 편

시리즈 B. 다른 앱
- [B-1] 다른 첫 편

## 보류

## 완료

- 2026-09-20 [A-1] 첫 편 (posts/first)
`;

const input = (over: Partial<CompleteTopicInput> = {}): CompleteTopicInput => ({
  from: '대기',
  index: 0,
  title: '둘째 편 (pono-web)',
  completedOn: '2026-09-25',
  articleTitle: 'Clerk 붙이기 — 웹훅이 늦게 올 때',
  slug: 'clerk-webhook-late',
  ...over,
});

describe('completeTopic', () => {
  test('완료 맨 끝에 날짜 → 태그 → 글 제목 (posts/슬러그)로, 나머지 줄은 바이트 그대로', () => {
    const result = completeTopic(parseQueue(QUEUE), input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(serializeQueue(result.queue)).toBe(
      QUEUE.replace('- [A-2] 둘째 편 (pono-web)\n', '') +
        '- 2026-09-25 [A-2] Clerk 붙이기 — 웹훅이 늦게 올 때 (posts/clerk-webhook-late)\n',
    );
  });

  test('다시 읽으면 태그·날짜·제목이 그대로(라운드트립)', () => {
    const result = completeTopic(parseQueue(QUEUE), input({ note: '2023 글 리라이트' }));
    if (!result.ok) throw new Error(result.code);
    expect(parseQueue(serializeQueue(result.queue)).sections.완료.at(-1)).toEqual({
      title: 'Clerk 붙이기 — 웹훅이 늦게 올 때 (2023 글 리라이트, posts/clerk-webhook-late)',
      completedOn: '2026-09-25',
      series: { key: 'A', episode: 2 },
    });
  });

  test('시리즈 아닌 주제는 태그 없이, 후보에서 빠지면 뒤쪽 정의 줄이 제 편 앞에 남는다', () => {
    const plain = completeTopic(parseQueue(QUEUE), input({ index: 1, title: '일반 주제' }));
    if (!plain.ok) throw new Error(plain.code);
    expect(serializeQueue(plain.queue)).toContain(
      '- 2026-09-25 Clerk 붙이기 — 웹훅이 늦게 올 때 (posts/clerk-webhook-late)\n',
    );

    const fromCandidate = completeTopic(
      parseQueue(QUEUE),
      input({ from: '후보', index: 0, title: '셋째 편' }),
    );
    if (!fromCandidate.ok) throw new Error(fromCandidate.code);
    const md = serializeQueue(fromCandidate.queue);
    expect(md).toContain(
      '### 시리즈\n\n시리즈 A. 앱 만들기\n\n시리즈 B. 다른 앱\n- [B-1] 다른 첫 편',
    );
    expect(parseQueue(md).seriesDefs).toEqual(fromCandidate.queue.seriesDefs);
  });

  test('파일이 그새 바뀌었거나 형식이 틀리면 옮기지 않는다', () => {
    const q = parseQueue(QUEUE);
    expect(completeTopic(q, input({ title: '다른 제목' }))).toEqual({
      ok: false,
      code: 'TOPIC_MISMATCH',
    });
    for (const bad of [
      { completedOn: '2026-9-25' },
      { slug: 'has space' },
      { slug: 'paren)' },
      { articleTitle: '  ' },
    ])
      expect(completeTopic(q, input(bad))).toEqual({ ok: false, code: 'INVALID_COMPLETION' });
  });

  test('입력 큐를 바꾸지 않는다', () => {
    const q = parseQueue(QUEUE);
    completeTopic(q, input());
    expect(serializeQueue(q)).toBe(QUEUE);
  });
});

test('completedTitle은 메모가 있으면 posts 항 앞에 쉼표로', () => {
  expect(completedTitle({ articleTitle: ' 제목 ', slug: 's' })).toBe('제목 (posts/s)');
  expect(completedTitle({ articleTitle: '제목', slug: 's', note: '후속' })).toBe(
    '제목 (후속, posts/s)',
  );
});
