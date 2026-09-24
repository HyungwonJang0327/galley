import { describe, test, expect } from 'vitest';
import { parseQueue, serializeQueue } from './queueFile.ts';

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

const SERIES = `## 대기

- [A-2] 둘째 편 (메모)

## 후보

- 일반 후보

### 회사 실무

- 회사 주제

### 시리즈 — 사이드프로젝트

시리즈 A. 앱 만들기 (커밋 175, ja: アプリをつくる)
- [A-1] 첫 편

시리즈 D. 편 없는 시리즈 (npm 패키지)

시리즈 E. 괄호 없는 시리즈
- [E-1] 다른 첫 편
- [E-12] 두 자리 편

## 보류

## 완료

- 2026-09-23 [B-6] 끝난 편 (posts/done-slug) https://velog.io/@someone/done-slug
`;

describe('시리즈 표기', () => {
  test('편 줄 태그를 떼어 series에 넣는다(완료 줄은 날짜 다음 태그)', () => {
    const q = parseQueue(SERIES);
    expect(q.sections.대기).toEqual([
      { title: '둘째 편 (메모)', series: { key: 'A', episode: 2 } },
    ]);
    expect(q.sections.후보.at(-1)).toEqual({
      title: '두 자리 편',
      category: '시리즈 — 사이드프로젝트',
      series: { key: 'E', episode: 12 },
    });
    expect(q.sections.완료).toEqual([
      {
        title: '끝난 편 (posts/done-slug) https://velog.io/@someone/done-slug',
        completedOn: '2026-09-23',
        series: { key: 'B', episode: 6 },
      },
    ]);
  });

  test('정의 줄을 이름·메모·소제목·위치로 읽는다(편 없는 시리즈 포함)', () => {
    const q = parseQueue(SERIES);
    const category = '시리즈 — 사이드프로젝트';
    expect(q.seriesDefs).toEqual([
      { key: 'A', name: '앱 만들기', note: '커밋 175, ja: アプリをつくる', category, position: 2 },
      { key: 'D', name: '편 없는 시리즈', note: 'npm 패키지', category, position: 3 },
      { key: 'E', name: '괄호 없는 시리즈', category, position: 3 },
    ]);
  });

  test('되쓰면 정의 줄·태그가 같은 자리로 돌아온다(바이트 동일)', () => {
    expect(serializeQueue(parseQueue(SERIES))).toBe(SERIES);
  });

  test('맨 앞이 아닌 태그 모양은 제목의 일부다', () => {
    const q = parseQueue('## 대기\n\n- 정리 [A-1] 메모\n- [a-1] 소문자\n');
    expect(q.sections.대기).toEqual([{ title: '정리 [A-1] 메모' }, { title: '[a-1] 소문자' }]);
  });

  test('시리즈 소제목이 아닌 곳의 정의 줄 모양은 무시한다(현행 동작)', () => {
    const q = parseQueue(
      '## 대기\n\n시리즈 A. 대기에 쓴 줄\n\n## 후보\n\n### 개인\n\n시리즈 B. 다른 소제목\n- 주제\n',
    );
    expect(q.seriesDefs).toEqual([]);
  });

  test('편이 모두 빠져도 정의 줄은 소제목 아래 남는다', () => {
    const q = parseQueue(SERIES);
    const onlyDefs = { ...q, sections: { ...q.sections, 후보: q.sections.후보.slice(0, 2) } };
    const md = serializeQueue(onlyDefs);
    expect(md).toContain(
      '### 시리즈 — 사이드프로젝트\n\n시리즈 A. 앱 만들기 (커밋 175, ja: アプリをつくる)\n\n시리즈 D.',
    );
    expect(parseQueue(md).seriesDefs.map((d) => d.key)).toEqual(['A', 'D', 'E']);
  });
});
