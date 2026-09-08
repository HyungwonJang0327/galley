import { describe, test, expect } from 'vitest';
import { parseQueue, serializeQueue } from './queueFile';

const SAMPLE = `# 블로그 주제 큐

안내 문장.

## 대기

- 첫 주제

## 후보

- 카테고리 없는 후보

### 회사 실무
- 회사 주제 1
- 회사 주제 2

### 개인
- 개인 주제

## 보류

## 완료

- 2026-09-06 완료된 주제
`;

describe('parseQueue', () => {
  test('대기 섹션 항목을 읽는다', () => {
    const q = parseQueue(SAMPLE);
    expect(q.sections.대기).toEqual([{ title: '첫 주제' }]);
  });

  test('완료 항목은 날짜 접두를 completedOn으로 분리한다', () => {
    const q = parseQueue(SAMPLE);
    expect(q.sections.완료).toEqual([{ title: '완료된 주제', completedOn: '2026-09-06' }]);
  });

  test('후보의 ### 소제목을 항목 category로 붙이고, 소제목 이전 항목은 category가 없다', () => {
    const q = parseQueue(SAMPLE);
    expect(q.sections.후보).toEqual([
      { title: '카테고리 없는 후보' },
      { title: '회사 주제 1', category: '회사 실무' },
      { title: '회사 주제 2', category: '회사 실무' },
      { title: '개인 주제', category: '개인' },
    ]);
  });

  test('서문(첫 ## 이전)을 보존한다', () => {
    const q = parseQueue(SAMPLE);
    expect(q.preamble).toBe('# 블로그 주제 큐\n\n안내 문장.');
  });

  test('빈 섹션(보류)은 빈 배열', () => {
    const q = parseQueue(SAMPLE);
    expect(q.sections.보류).toEqual([]);
  });
});

describe('serializeQueue', () => {
  test('parse→serialize→parse가 구조상 동일하다(라운드트립)', () => {
    const once = parseQueue(SAMPLE);
    const twice = parseQueue(serializeQueue(once));
    expect(twice).toEqual(once);
  });

  test('완료 날짜·후보 카테고리·섹션 순서를 재작성한다', () => {
    const md = serializeQueue(parseQueue(SAMPLE));
    expect(md).toContain('- 2026-09-06 완료된 주제');
    expect(md).toContain('### 회사 실무');
    expect(md).toMatch(/## 대기[\s\S]*## 후보[\s\S]*## 보류[\s\S]*## 완료/);
  });
});
