import { describe, test, expect } from 'vitest';
import { completeTopic, completedTitle, type CompleteTopicInput } from './completeQueue.ts';
import { readFileSync } from 'node:fs';
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

  test('보류에서도 옮기고, 후보 마지막 편을 빼면 뒤 정의 줄 위치가 그만큼 당겨진다', () => {
    const held = parseQueue(QUEUE.replace('## 보류\n', '## 보류\n\n- 보류 주제\n'));
    const fromHold = completeTopic(held, input({ from: '보류', index: 0, title: '보류 주제' }));
    if (!fromHold.ok) throw new Error(fromHold.code);
    expect(fromHold.queue.sections.보류).toEqual([]);
    expect(serializeQueue(fromHold.queue)).toContain('## 보류\n\n## 완료\n');

    const last = completeTopic(
      parseQueue(QUEUE),
      input({ from: '후보', index: 1, title: '다른 첫 편' }),
    );
    if (!last.ok) throw new Error(last.code);
    expect(last.queue.sections.후보).toHaveLength(1);
    expect(last.queue.seriesDefs.map((d) => d.position)).toEqual([0, 1]);
    expect(parseQueue(serializeQueue(last.queue)).seriesDefs).toEqual(last.queue.seriesDefs);
  });

  test('완료 섹션이 비어 있어도 첫 줄로 들어간다', () => {
    const empty = parseQueue(QUEUE.replace('- 2026-09-20 [A-1] 첫 편 (posts/first)\n', ''));
    const result = completeTopic(empty, input());
    if (!result.ok) throw new Error(result.code);
    expect(serializeQueue(result.queue)).toMatch(
      /## 완료\n\n- 2026-09-25 \[A-2\] Clerk 붙이기 — 웹훅이 늦게 올 때 \(posts\/clerk-webhook-late\)\n$/,
    );
  });

  test('파일이 그새 바뀌었거나 형식이 틀리면 옮기지 않는다', () => {
    const q = parseQueue(QUEUE);
    expect(completeTopic(q, input({ title: '다른 제목' }))).toEqual({
      ok: false,
      code: 'TOPIC_MISMATCH',
    });
    expect(completeTopic(q, input({ index: 9 }))).toEqual({ ok: false, code: 'TOPIC_MISMATCH' });
    for (const bad of [
      { completedOn: '2026-9-25' },
      { slug: 'has space' },
      { slug: 'paren)' },
      { articleTitle: '  ' },
    ])
      expect(completeTopic(q, input(bad))).toEqual({ ok: false, code: 'INVALID_COMPLETION' });
  });

  test('개행이 든 제목·메모는 섹션 구조를 깨므로 거부한다', () => {
    const q = parseQueue(QUEUE);
    for (const bad of [
      { articleTitle: '제목\n## 대기\n- 끼어든 줄' },
      { articleTitle: '제목\r\n다음 줄' },
      { note: '메모\n- 가짜 완료' },
    ])
      expect(completeTopic(q, input(bad))).toEqual({ ok: false, code: 'INVALID_COMPLETION' });
  });

  test('메모의 괄호는 완료 줄 괄호를 깨므로 거부한다(슬러그와 같은 규칙)', () => {
    const q = parseQueue(QUEUE);
    for (const note of ['a) b', 'x (y', '전각（메모）'])
      expect(completeTopic(q, input({ note }))).toEqual({ ok: false, code: 'INVALID_COMPLETION' });
    expect(completeTopic(q, input({ note: '2023 글 리라이트, 후속' })).ok).toBe(true);
  });

  test('제목 맨 앞이 시리즈 태그나 (기존 글)이면 다시 읽을 때 뜻이 바뀌므로 거부한다', () => {
    const q = parseQueue(QUEUE);
    for (const articleTitle of ['[B-3] 제목', '(기존 글) 제목', '(기존 글, 2025) 제목'])
      expect(completeTopic(q, input({ articleTitle }))).toEqual({
        ok: false,
        code: 'INVALID_COMPLETION',
      });
    expect(completeTopic(q, input({ articleTitle: 'Clerk 붙이기 (v2)' })).ok).toBe(true);
  });

  test('입력 큐를 바꾸지 않는다', () => {
    const q = parseQueue(QUEUE);
    completeTopic(q, input());
    expect(serializeQueue(q)).toBe(QUEUE);
  });
});

test('실제 모양 픽스처에서 완료로 옮겨도 나머지 줄은 바이트 그대로', () => {
  const raw = readFileSync(new URL('./__fixtures__/series.md', import.meta.url), 'utf8');
  const q = parseQueue(raw);
  const lines = raw.split('\n');
  const start = lines.indexOf('## 대기');
  const lineNo = lines.findIndex((line, i) => i > start && line.startsWith('- '));
  const topic = q.sections.대기[0];
  if (topic === undefined) throw new Error('픽스처 대기 절이 비어 있다');

  const result = completeTopic(q, input({ title: topic.title, slug: 'fixture-done' }));
  if (!result.ok) throw new Error(result.code);
  const tag = topic.series === undefined ? '' : `[${topic.series.key}-${topic.series.episode}] `;
  const expected = [...lines.slice(0, lineNo), ...lines.slice(lineNo + 1)].join('\n');
  expect(serializeQueue(result.queue)).toBe(
    `${expected}- 2026-09-25 ${tag}Clerk 붙이기 — 웹훅이 늦게 올 때 (posts/fixture-done)\n`,
  );
});

test('completedTitle은 메모가 있으면 posts 항 앞에 쉼표로', () => {
  expect(completedTitle({ articleTitle: ' 제목 ', slug: 's' })).toBe('제목 (posts/s)');
  expect(completedTitle({ articleTitle: '제목', slug: 's', note: '후속' })).toBe(
    '제목 (후속, posts/s)',
  );
});
