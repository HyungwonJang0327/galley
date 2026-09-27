// 다른 볼륨으로 옮기기(EXDEV) — blog 폴더의 파일을 없애는 유일한 경로라 따로 고정한다. 실제 다른 볼륨을 만들 수 없어
// node:fs/promises의 rename만 EXDEV로 실패하게 바꾼다(나머지는 실제 파일시스템).
import { describe, test, expect, vi, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const state = vi.hoisted(() => ({ exdev: false, rmFails: false }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const fail = (code: string) => Promise.reject(Object.assign(new Error(code), { code }));
  return {
    ...actual,
    rename: (from: string, to: string) =>
      state.exdev && to.includes('replaced') ? fail('EXDEV') : actual.rename(from, to),
    rm: (path: string, options?: Parameters<typeof actual.rm>[1]) =>
      state.rmFails && path.includes(join('posts', 's'))
        ? fail('EACCES')
        : actual.rm(path, options),
  };
});

const { mkdtemp, readdir, readFile, rm, symlink, writeFile } = await import('node:fs/promises');
const { LocalFsPostsWriter } = await import('./PostsWriter.ts');

const FILES = {
  velog: '# 본문\n',
  linkedin: '링크드인\n',
  zenn: '本文\n',
  publishInfo: '# 발행 정보 — 제목\n',
  thumbnail: new Uint8Array([137, 80, 78, 71]),
  evidence: '{}\n',
  verification: '{}\n',
};
const OLD = [
  '옛_제목.md',
  '옛_제목_링크드인.md',
  '옛_제목_zenn.md',
  '옛_제목_발행정보.md',
  '옛_제목_썸네일.png',
];

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'galley-posts-exdev-'));
  const writer = new LocalFsPostsWriter(join(root, 'blog'));
  await writer.write({ slug: 's', articleTitle: '옛 제목', files: FILES, overwrite: false });
  const written = await writer.write({
    slug: 's',
    articleTitle: '새 제목',
    files: FILES,
    overwrite: true,
  });
  if (!written.ok) throw new Error(written.code);
  return {
    root,
    writer,
    dir: join(root, 'blog', 'posts', 's'),
    into: join(root, 'data', 'replaced', 's', 'run_2'),
    keep: written.files,
  };
}

const roots: string[] = [];
afterEach(async () => {
  state.exdev = false;
  state.rmFails = false;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('LocalFsPostsWriter.retire — 다른 볼륨(EXDEV)', () => {
  test('복사한 뒤 원본을 치운다 — 내용이 같고 posts에는 새 7개만', async () => {
    const { root, writer, dir, into, keep } = await setup();
    roots.push(root);
    await writeFile(join(dir, '옛_제목.md'), '사람이 고친 옛 본문');
    state.exdev = true;

    const result = await writer.retire({ slug: 's', previousTitle: '옛 제목', keep, into });

    expect([...result.moved].sort()).toEqual([...OLD].sort());
    expect(result.leftover).toEqual([]);
    expect(await readFile(join(into, '옛_제목.md'), 'utf8')).toBe('사람이 고친 옛 본문');
    expect((await readdir(dir)).sort()).toEqual([...keep].sort());
  });

  test('복사는 됐는데 원본을 못 치우면 leftover — posts에도 보관 폴더에도 있다(잃지 않는다)', async () => {
    const { root, writer, dir, into, keep } = await setup();
    roots.push(root);
    state.exdev = true;
    state.rmFails = true;

    const result = await writer.retire({ slug: 's', previousTitle: '옛 제목', keep, into });

    expect(result.moved).toEqual([]);
    expect([...result.leftover].sort()).toEqual([...OLD].sort());
    expect(await readdir(dir)).toEqual(expect.arrayContaining(OLD));
    expect((await readdir(into)).sort()).toEqual([...OLD].sort());
  });

  test('심볼릭 링크는 다른 볼륨으로 옮기지 않는다(복사하면 대상의 내용이 된다) — leftover', async () => {
    const { root, writer, dir, into, keep } = await setup();
    roots.push(root);
    const target = join(root, 'elsewhere.md');
    await writeFile(target, '링크 대상');
    await rm(join(dir, '옛_제목.md'));
    await symlink(target, join(dir, '옛_제목.md'));
    state.exdev = true;

    const result = await writer.retire({ slug: 's', previousTitle: '옛 제목', keep, into });

    expect(result.leftover).toEqual(['옛_제목.md']);
    expect(result.moved).toHaveLength(4);
    expect(await readdir(dir)).toContain('옛_제목.md');
    expect(await readFile(target, 'utf8')).toBe('링크 대상');
  });

  test('보관 폴더에 같은 이름이 있으면 복사로도 덮어쓰지 않는다', async () => {
    const { root, writer, dir, into, keep } = await setup();
    roots.push(root);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(into, { recursive: true });
    await writeFile(join(into, '옛_제목.md'), '먼저 보관한 내용');
    state.exdev = true;

    const result = await writer.retire({ slug: 's', previousTitle: '옛 제목', keep, into });

    expect(result.leftover).toEqual(['옛_제목.md']);
    expect(await readFile(join(into, '옛_제목.md'), 'utf8')).toBe('먼저 보관한 내용');
    expect(await readdir(dir)).toContain('옛_제목.md');
  });
});
