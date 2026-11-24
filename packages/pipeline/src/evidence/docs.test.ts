// 픽스처 폴더·git 리포(tmpdir)로만 — 실제 리포는 열지 않는다.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDocs, docTerms, readRepoDocs, splitDocSections } from './docs.ts';
import { EVIDENCE_LIMITS } from './limits.ts';
import type { RedactConfig } from './redact.ts';

let dir: string;
/** 문서가 리포 **위** 폴더에 있다(커밋 없음). */
let api: string;
let web: string;
/** 문서가 리포 **안**에 커밋돼 있다. */
let mono: string;
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t.test',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t.test',
};
const g = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: ENV }).trim();
const init = async (cwd: string) => {
  await mkdir(cwd, { recursive: true });
  g(cwd, 'init', '-q', '-b', 'main');
  await writeFile(join(cwd, 'a.ts'), 'export const a = 1;\n');
  g(cwd, 'add', '.');
  g(cwd, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
};
const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};

const WORKLOG_0620 = `# 2026-06-20 작업일지

## 참여
- 혼자

## 논의 내용

### 피드 커서 중복
같은 시각에 만든 포스트 두 개가 커서 경계에서 중복으로 내려왔다. Example Corp 데모 직전에 발견했다.
커서를 (createdAt, id) 쌍으로 바꿔서 고쳤다.

### 배포 설정
Railway 자동 배포를 붙였다.
환경변수 세 개를 옮겼다.

## 결론
- 커서는 쌍으로 간다.
`;
const WORKLOG_0622 = `# 2026-06-22 작업일지

## 논의 내용

### 스냅 작성 API
스냅과 아티클을 한 테이블에 두기로 한 뒤 첫 구현. 피드에서 타입을 섞어 내려준다.
이미지 필수 검증을 DTO에 넣었다.
`;
const DECISION = `# 콘텐츠 타입

## 검토한 방향
테이블을 둘로 나누면 피드에서 머지해야 한다.
그래서 스냅과 아티클을 한 테이블로 합쳤다.

\`\`\`md
## 이건 코드 안의 머리글
\`\`\`

## 디자인
색은 블루 하나.
폰트는 하나.
`;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-docs-'));
  const project = join(dir, 'project');
  api = join(project, 'api');
  web = join(project, 'web');
  mono = join(dir, 'mono');
  await init(api);
  await init(web);
  await mkdir(join(project, 'worklog'), { recursive: true });
  await mkdir(join(project, 'decisions'), { recursive: true });
  await writeFile(join(project, 'worklog', '2026-06-20.md'), WORKLOG_0620);
  await writeFile(join(project, 'worklog', '2026-06-22.md'), WORKLOG_0622);
  await writeFile(join(project, 'worklog', 'notes.txt'), '피드 커서 스냅 아티클\n');
  await writeFile(join(project, 'decisions', 'content-types.md'), DECISION);
  await writeFile(
    join(project, 'secret.md'),
    '# 피드 커서\n\n## 스냅\n아티클 피드 커서\n둘째 줄\n',
  );
  await symlink(join(project, 'secret.md'), join(project, 'decisions', 'link.md'));

  await mkdir(join(mono, 'worklog'), { recursive: true });
  g(mono, 'init', '-q', '-b', 'main');
  await writeFile(join(mono, 'worklog', '2026-07-01.md'), WORKLOG_0622);
  await mkdir(join(mono, 'worklog', 'deep'), { recursive: true });
  await writeFile(join(mono, 'worklog', 'deep', 'x.md'), WORKLOG_0620);
  g(mono, 'add', '.');
  g(mono, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'docs');
  // 커밋되지 않은 작업 트리 파일은 git 쪽에서 읽지 않는다
  await writeFile(join(mono, 'worklog', '2026-07-02.md'), WORKLOG_0620);
  // 리포 위 폴더에도 문서가 있지만 리포 안에 있으므로 보지 않는다
  await mkdir(join(dir, 'decisions'), { recursive: true });
  await writeFile(join(dir, 'decisions', 'outer.md'), DECISION);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('splitDocSections', () => {
  test('##·###에서 끊고 머리글 경로를 붙인다 — 내용 없는 절·코드 펜스 안의 #은 절이 아니다', () => {
    const sections = splitDocSections(WORKLOG_0620);
    expect(sections.map((s) => [s.title, s.lineRange.start, s.lineRange.end])).toEqual([
      ['2026-06-20 작업일지 › 참여', 3, 5],
      ['2026-06-20 작업일지 › 논의 내용 › 피드 커서 중복', 8, 11],
      ['2026-06-20 작업일지 › 논의 내용 › 배포 설정', 12, 15],
      ['2026-06-20 작업일지 › 결론', 16, 17],
    ]);
    expect(sections[1]!.text).toContain('커서를 (createdAt, id) 쌍으로');
    const decision = splitDocSections(DECISION);
    expect(decision.map((s) => s.title)).toEqual([
      '콘텐츠 타입 › 검토한 방향',
      '콘텐츠 타입 › 디자인',
    ]);
    expect(decision[0]!.text).toContain('## 이건 코드 안의 머리글');
  });
});

describe('docTerms', () => {
  test('제목 낱말(조사 뗀 꼴 포함, 괄호 안 제외)과 키워드 낱말을 나눈다 — 짧은 낱말은 버린다', () => {
    const terms = docTerms({
      title: '스냅과 아티클을 한 피드에 섞는 모델 (후보의 "아키텍처" 항목)',
      keywords: ['커서 페이지네이션', 'S3', 'Nest.js', '피드'],
    });
    expect(terms.title).toEqual([
      '스냅과',
      '스냅',
      '아티클을',
      '아티클',
      '피드에',
      '피드',
      '섞는',
      '모델',
    ]);
    expect(terms.keywords).toEqual(['커서', '페이지네이션', 'nest.js']);
  });
});

describe('readRepoDocs', () => {
  test('리포 안에 없으면 바로 위 폴더에서 — 두 폴더의 .md 일반 파일만(링크·다른 확장자·폴더 밖 제외)', async () => {
    const r = await readRepoDocs(api);
    expect(r.ok && [r.value.source, r.value.commit]).toEqual(['disk', undefined]);
    expect(r.ok && r.value.files.map((f) => [f.kind, f.path])).toEqual([
      ['worklog', 'worklog/2026-06-20.md'],
      ['worklog', 'worklog/2026-06-22.md'],
      ['decisions', 'decisions/content-types.md'],
    ]);
  });

  test('리포의 HEAD 커밋에 있으면 git으로 — 커밋된 것만, 폴더 바로 아래만, 위 폴더는 보지 않는다', async () => {
    const r = await readRepoDocs(mono);
    expect(r.ok && r.value.source).toBe('git');
    expect(r.ok && r.value.commit).toBe(g(mono, 'rev-parse', 'HEAD'));
    expect(r.ok && r.value.files.map((f) => f.path)).toEqual(['worklog/2026-07-01.md']);
  });

  test('git 리포가 아니면 값으로 실패', async () => {
    expect(await readRepoDocs(join(dir, 'project'))).toEqual({ ok: false, code: 'NOT_A_GIT_REPO' });
  });
});

describe('collectDocs', () => {
  const terms = docTerms({ title: '스냅과 아티클을 한 피드에 섞는 모델', keywords: ['커서'] });

  test('주제 낱말이 든 절만, worklog(날짜순) → decisions — 한 폴더 아래 두 리포는 한 번만 읽는다', async () => {
    const r = await collectDocs(
      [
        { name: 'api', path: api },
        { name: 'web', path: web },
      ],
      terms,
      null,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.omitted).toBe(0);
    expect(r.docs.map((d) => [d.path, d.title, d.date])).toEqual([
      ['worklog/2026-06-20.md', '2026-06-20 작업일지 › 논의 내용 › 피드 커서 중복', '2026-06-20'],
      ['worklog/2026-06-22.md', '2026-06-22 작업일지 › 논의 내용 › 스냅 작성 API', '2026-06-22'],
      ['decisions/content-types.md', '콘텐츠 타입 › 검토한 방향', undefined],
    ]);
    expect(r.docs[0]).toMatchObject({
      kind: 'worklog',
      source: 'disk',
      repo: 'api',
      lineRange: { start: 8, end: 11 },
      redacted: false,
      truncated: false,
    });
    expect(r.docs[0]).not.toHaveProperty('commit');
    // 절대경로가 번들에 남지 않는다
    expect(JSON.stringify(r.docs)).not.toContain(dir);
  });

  test('식별 정보 필터·글자 상한·종류별 상한(밀린 절 수)', async () => {
    const r = await collectDocs([{ name: 'Example Corp api', path: api }], terms, REDACT, {
      ...EVIDENCE_LIMITS,
      docSectionChars: 30,
      maxWorklogSections: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.docs.map((d) => d.kind)).toEqual(['worklog', 'decisions']);
    expect(r.omitted).toBe(1);
    expect(r.docs.every((d) => d.truncated && [...d.text].length === 30)).toBe(true);
    expect(r.docs[0]!.repo).toBe('[COMPANY] api');
    const full = await collectDocs([{ name: 'a', path: api }], terms, REDACT);
    expect(full.ok && JSON.stringify(full.docs)).not.toContain('Example Corp');
    expect(full.ok && full.docs[0]).toMatchObject({ redacted: true });
  });

  test('git 쪽은 커밋을 남긴다 · 낱말이 없으면 0건 · 리포 실패는 값으로', async () => {
    const r = await collectDocs([{ name: 'mono', path: mono }], terms, null);
    expect(r.ok && r.docs.map((d) => [d.source, d.commit, d.path, d.date])).toEqual([
      ['git', g(mono, 'rev-parse', 'HEAD'), 'worklog/2026-07-01.md', '2026-07-01'],
    ]);
    expect(
      await collectDocs([{ name: 'api', path: api }], { title: [], keywords: [] }, null),
    ).toEqual({ ok: true, docs: [], omitted: 0 });
    expect(await collectDocs([{ name: 'x', path: join(dir, 'project') }], terms, null)).toEqual({
      ok: false,
      code: 'NOT_A_GIT_REPO',
    });
  });
});
