// B3c 산출물 구조 테스트 — 임시 blog 폴더에 실제로 쓰고 이름·내용·임시 파일 잔여를 본다.
import { describe, test, expect } from 'vitest';
import { link, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsPostsWriter, type PostFiles } from './PostsWriter.ts';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'galley-posts-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const FILES: PostFiles = {
  velog: '# 무한 스크롤\n\n본문\n',
  linkedin: '링크드인\n',
  zenn: '---\ntitle: "x"\n---\n\n本文\n',
  publishInfo: '# 발행 정보 — 무한 스크롤\n',
  thumbnail: new Uint8Array([137, 80, 78, 71, 0, 255]),
  evidence: '{"items":[]}\n',
  verification: '{"claims":[]}\n',
};

const EXPECTED = [
  '무한_스크롤.md',
  '무한_스크롤_링크드인.md',
  '무한_스크롤_zenn.md',
  '무한_스크롤_발행정보.md',
  '무한_스크롤_썸네일.png',
  'evidence.json',
  'verification.json',
];

describe('LocalFsPostsWriter', () => {
  test('posts/<슬러그>/에 7개 파일을 쓰고 임시 파일을 남기지 않는다', async () => {
    await withTempDir(async (blogDir) => {
      const writer = new LocalFsPostsWriter(blogDir);

      const result = await writer.write({
        slug: 'infinite-scroll',
        articleTitle: '무한 스크롤',
        files: FILES,
        overwrite: false,
      });

      const dir = join(blogDir, 'posts', 'infinite-scroll');
      expect(result).toEqual({ ok: true, dir, files: EXPECTED });
      expect((await readdir(dir)).sort()).toEqual([...EXPECTED].sort());
      expect(await readFile(join(dir, '무한_스크롤.md'), 'utf8')).toBe(FILES.velog);
      expect(await readFile(join(dir, 'evidence.json'), 'utf8')).toBe(FILES.evidence);
      expect(new Uint8Array(await readFile(join(dir, '무한_스크롤_썸네일.png')))).toEqual(
        FILES.thumbnail,
      );
    });
  });

  test('폴더가 이미 있으면 overwrite가 아닐 때 POSTS_DIR_EXISTS — 아무것도 쓰지 않는다', async () => {
    await withTempDir(async (blogDir) => {
      const dir = join(blogDir, 'posts', 'taken');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, '사람이_쓴_글.md'), '손으로\n');
      const writer = new LocalFsPostsWriter(blogDir);

      const result = await writer.write({
        slug: 'taken',
        articleTitle: '제목',
        files: FILES,
        overwrite: false,
      });

      expect(result).toEqual({ ok: false, code: 'POSTS_DIR_EXISTS', dir });
      expect(await readdir(dir)).toEqual(['사람이_쓴_글.md']);
    });
  });

  test('overwrite면 같은 이름을 덮어쓰고 다른 파일은 건드리지 않는다', async () => {
    await withTempDir(async (blogDir) => {
      const writer = new LocalFsPostsWriter(blogDir);
      const first = { slug: 's', articleTitle: '제목', files: FILES, overwrite: false };
      await writer.write(first);
      const dir = join(blogDir, 'posts', 's');
      await writeFile(join(dir, 'illust1.png'), 'png');

      const result = await writer.write({
        ...first,
        files: { ...FILES, velog: '# 제목\n\n고친 본문\n' },
        overwrite: true,
      });

      expect(result.ok).toBe(true);
      expect(await readFile(join(dir, '제목.md'), 'utf8')).toBe('# 제목\n\n고친 본문\n');
      expect(await readdir(dir)).toContain('illust1.png');
    });
  });

  describe('retire — 재승인에서 글 제목이 바뀐 경우 직전 승인 파일을 옮긴다', () => {
    const OLD = [
      '옛_제목.md',
      '옛_제목_링크드인.md',
      '옛_제목_zenn.md',
      '옛_제목_발행정보.md',
      '옛_제목_썸네일.png',
    ];

    /** blog 폴더에 옛 제목으로 승인본을 쓰고, 새 제목으로 덮어쓴 상태를 만든다. */
    async function reapproved(blogDir: string, oldTitle: string, newTitle: string) {
      const writer = new LocalFsPostsWriter(blogDir);
      await writer.write({ slug: 's', articleTitle: oldTitle, files: FILES, overwrite: false });
      const written = await writer.write({
        slug: 's',
        articleTitle: newTitle,
        files: FILES,
        overwrite: true,
      });
      if (!written.ok) throw new Error(written.code);
      return { writer, dir: join(blogDir, 'posts', 's'), keep: written.files };
    }

    test('직전 승인이 쓴 5개 이름만 옮기고 새 7개·사람이 넣은 파일은 그대로', async () => {
      await withTempDir(async (root) => {
        const { writer, dir, keep } = await reapproved(
          join(root, 'blog'),
          '옛 제목',
          '무한 스크롤',
        );
        await writeFile(join(dir, '메모.md'), '사람이 쓴 메모');
        await writeFile(join(dir, '옛_제목_초안.md'), '이름이 비슷한 사람 파일');
        await writeFile(join(dir, '옛_제목.md'), '사람이 posts에서 고친 옛 본문');
        const into = join(root, 'data', 'replaced', 's', 'run_2');

        const result = await writer.retire({ slug: 's', previousTitle: '옛 제목', keep, into });

        expect([...result.moved].sort()).toEqual([...OLD].sort());
        expect(result.leftover).toEqual([]);
        expect((await readdir(dir)).sort()).toEqual(
          [...EXPECTED, '메모.md', '옛_제목_초안.md'].sort(),
        );
        expect((await readdir(into)).sort()).toEqual([...OLD].sort());
        // 지우지 않고 옮긴다 — 사람이 고친 내용을 되살릴 수 있다.
        expect(await readFile(join(into, '옛_제목.md'), 'utf8')).toBe(
          '사람이 posts에서 고친 옛 본문',
        );
      });
    });

    test('제목의 대소문자만 바뀌면 아무것도 옮기지 않는다 — 새 파일이 사라지지 않는다(H1)', async () => {
      await withTempDir(async (root) => {
        const { writer, dir, keep } = await reapproved(
          join(root, 'blog'),
          'React Hooks 정리',
          'React hooks 정리',
        );
        const into = join(root, 'data', 'replaced');

        const result = await writer.retire({
          slug: 's',
          previousTitle: 'React Hooks 정리',
          keep,
          into,
        });

        expect(result).toEqual({ moved: [], leftover: [] });
        // 대소문자를 구분하지 않는 파일시스템(macOS)에서는 7개, 구분하는 곳(CI)에서는 옛 5개가 더 남는다 — 어느 쪽이든
        // 이번 승인이 쓴 7개는 모두 있어야 한다.
        const names = await readdir(dir);
        for (const name of keep)
          expect(
            names.some((n) => n.toLowerCase() === name.toLowerCase()),
            name,
          ).toBe(true);
        expect(await readFile(join(dir, 'React_hooks_정리.md'), 'utf8')).toBe(FILES.velog);
        await expect(readdir(into)).rejects.toThrow();
      });
    });

    test('제목이 같으면 옮기지 않고, 옮길 것이 없으면 폴더도 만들지 않는다', async () => {
      await withTempDir(async (root) => {
        const { writer, dir, keep } = await reapproved(
          join(root, 'blog'),
          '무한 스크롤',
          '무한 스크롤',
        );
        const into = join(root, 'data', 'replaced');

        expect(
          await writer.retire({ slug: 's', previousTitle: '무한 스크롤', keep, into }),
        ).toEqual({ moved: [], leftover: [] });
        expect((await readdir(dir)).sort()).toEqual([...EXPECTED].sort());
        await expect(readdir(into)).rejects.toThrow();
      });
    });

    test('이름이 접두 관계여도 이번 승인이 쓴 파일은 옮기지 않는다', async () => {
      await withTempDir(async (root) => {
        // 옛 제목 "무한 스크롤 링크드인"의 본문 이름은 새 제목 "무한 스크롤"의 링크드인 이름과 같다.
        const { writer, dir, keep } = await reapproved(
          join(root, 'blog'),
          '무한 스크롤 링크드인',
          '무한 스크롤',
        );
        const into = join(root, 'data', 'replaced');

        const result = await writer.retire({
          slug: 's',
          previousTitle: '무한 스크롤 링크드인',
          keep,
          into,
        });

        expect(result.moved).not.toContain('무한_스크롤_링크드인.md');
        expect((await readdir(dir)).sort()).toEqual([...EXPECTED].sort());
        expect(await readFile(join(dir, '무한_스크롤_링크드인.md'), 'utf8')).toBe(FILES.linkedin);
      });
    });

    test('옛 이름 자리가 폴더면 옮기지 않고 leftover — 안의 파일은 그대로', async () => {
      await withTempDir(async (root) => {
        const { writer, dir, keep } = await reapproved(
          join(root, 'blog'),
          '옛 제목',
          '무한 스크롤',
        );
        await rm(join(dir, '옛_제목.md'));
        await mkdir(join(dir, '옛_제목.md'));
        await writeFile(join(dir, '옛_제목.md', 'inner.txt'), '안의 파일');

        const result = await writer.retire({
          slug: 's',
          previousTitle: '옛 제목',
          keep,
          into: join(root, 'data', 'replaced'),
        });

        expect(result.leftover).toEqual(['옛_제목.md']);
        expect(result.moved).toHaveLength(4);
        expect(await readFile(join(dir, '옛_제목.md', 'inner.txt'), 'utf8')).toBe('안의 파일');
      });
    });

    test('이미 없는 파일은 조용히 넘어가고, 심볼릭 링크는 링크만 옮긴다(대상은 그대로)', async () => {
      await withTempDir(async (root) => {
        const { writer, dir, keep } = await reapproved(
          join(root, 'blog'),
          '옛 제목',
          '무한 스크롤',
        );
        await rm(join(dir, '옛_제목_zenn.md'));
        const target = join(root, 'elsewhere.md');
        await writeFile(target, '링크 대상');
        await rm(join(dir, '옛_제목.md'));
        await symlink(target, join(dir, '옛_제목.md'));
        const into = join(root, 'data', 'replaced');

        const result = await writer.retire({ slug: 's', previousTitle: '옛 제목', keep, into });

        expect([...result.moved].sort()).toEqual(OLD.filter((n) => n !== '옛_제목_zenn.md').sort());
        expect(result.leftover).toEqual([]);
        expect(await readFile(target, 'utf8')).toBe('링크 대상');
      });
    });

    test('옛 이름이 새 파일의 하드링크면 옮기지 않고 leftover로 알린다 — 파일 비교(dev·ino)만으로 막는다', async () => {
      await withTempDir(async (root) => {
        const { writer, dir, keep } = await reapproved(
          join(root, 'blog'),
          '옛 제목',
          '무한 스크롤',
        );
        // 옛 본문 이름을 새 본문의 하드링크로 — 이름은 전혀 다르지만 같은 파일이다(어느 OS에서도 성립).
        await rm(join(dir, '옛_제목.md'));
        await link(join(dir, '무한_스크롤.md'), join(dir, '옛_제목.md'));
        const into = join(root, 'data', 'replaced');

        const result = await writer.retire({ slug: 's', previousTitle: '옛 제목', keep, into });

        expect(result.moved).not.toContain('옛_제목.md');
        expect(result.leftover).toEqual(['옛_제목.md']);
        expect(await readFile(join(dir, '무한_스크롤.md'), 'utf8')).toBe(FILES.velog);
        expect(await readdir(dir)).toContain('옛_제목.md');
      });
    });

    test('보관 폴더에 같은 이름이 이미 있으면 덮어쓰지 않고 leftover — 앞서 보관한 파일을 잃지 않는다', async () => {
      await withTempDir(async (root) => {
        const { writer, dir, keep } = await reapproved(
          join(root, 'blog'),
          '옛 제목',
          '무한 스크롤',
        );
        const into = join(root, 'data', 'replaced');
        await mkdir(into, { recursive: true });
        await writeFile(join(into, '옛_제목.md'), '먼저 보관한 내용');

        const result = await writer.retire({ slug: 's', previousTitle: '옛 제목', keep, into });

        expect(result.leftover).toEqual(['옛_제목.md']);
        expect(result.moved).toHaveLength(4);
        expect(await readFile(join(into, '옛_제목.md'), 'utf8')).toBe('먼저 보관한 내용');
        expect(await readdir(dir)).toContain('옛_제목.md');
      });
    });

    test('같은 보관 폴더로 두 번 불러도 두 번째는 아무것도 하지 않는다', async () => {
      await withTempDir(async (root) => {
        const { writer, keep } = await reapproved(join(root, 'blog'), '옛 제목', '무한 스크롤');
        const input = {
          slug: 's',
          previousTitle: '옛 제목',
          keep,
          into: join(root, 'data', 'replaced'),
        };

        expect((await writer.retire(input)).moved).toHaveLength(5);
        expect(await writer.retire(input)).toEqual({ moved: [], leftover: [] });
        expect(await readdir(input.into)).toHaveLength(5);
      });
    });

    test('posts 폴더가 없으면 아무것도 하지 않는다', async () => {
      await withTempDir(async (root) => {
        const writer = new LocalFsPostsWriter(join(root, 'blog'));
        expect(
          await writer.retire({
            slug: 'none',
            previousTitle: '옛 제목',
            keep: [],
            into: join(root, 'data', 'replaced'),
          }),
        ).toEqual({ moved: [], leftover: [] });
      });
    });

    test('깨진 제목(경로 조작·점뿐·아주 긴 제목)도 폴더 밖 파일을 건드리지 않는다', async () => {
      await withTempDir(async (root) => {
        const blogDir = join(root, 'blog');
        const { writer, dir, keep } = await reapproved(blogDir, '옛 제목', '무한 스크롤');
        await writeFile(join(root, 'x.md'), '폴더 밖');
        await writeFile(join(blogDir, 'x.md'), '부모 폴더');
        await writeFile(join(blogDir, 'posts', 'x.md'), '형제');

        for (const previousTitle of ['../../x', '..', '.', '가'.repeat(300), ''])
          await writer.retire({
            slug: 's',
            previousTitle,
            keep,
            into: join(root, 'data', 'replaced'),
          });

        expect(await readFile(join(root, 'x.md'), 'utf8')).toBe('폴더 밖');
        expect(await readFile(join(blogDir, 'x.md'), 'utf8')).toBe('부모 폴더');
        expect(await readFile(join(blogDir, 'posts', 'x.md'), 'utf8')).toBe('형제');
        // 이번 승인이 쓴 7개는 그대로.
        for (const name of EXPECTED) expect(await readdir(dir)).toContain(name);
      });
    });
  });

  test('blog 폴더가 쓸 수 없으면 POSTS_WRITE_FAILED(값)', async () => {
    await withTempDir(async (blogDir) => {
      // posts 자리에 파일을 두면 그 아래 폴더를 만들 수 없다.
      await writeFile(join(blogDir, 'posts'), 'not a dir');
      const writer = new LocalFsPostsWriter(blogDir);

      const result = await writer.write({
        slug: 'x',
        articleTitle: '제목',
        files: FILES,
        overwrite: false,
      });

      expect(result).toMatchObject({ ok: false, code: 'POSTS_WRITE_FAILED' });
    });
  });

  test('쓰다 실패하면 임시 파일을 남기지 않는다', async () => {
    await withTempDir(async (blogDir) => {
      const writer = new LocalFsPostsWriter(blogDir);
      const dir = join(blogDir, 'posts', 's');
      // 두 번째 파일 이름 자리에 폴더를 두면 rename이 실패한다.
      await mkdir(join(dir, '제목_링크드인.md'), { recursive: true });

      const result = await writer.write({
        slug: 's',
        articleTitle: '제목',
        files: FILES,
        overwrite: true,
      });

      expect(result).toMatchObject({ ok: false, code: 'POSTS_WRITE_FAILED' });
      expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    });
  });

  test('슬러그에 구분자·..이 있으면 프로그래머 오류로 던진다', async () => {
    await withTempDir(async (blogDir) => {
      const writer = new LocalFsPostsWriter(blogDir);
      for (const slug of ['../out', 'a/b', '..', '']) {
        await expect(
          writer.write({ slug, articleTitle: '제목', files: FILES, overwrite: true }),
        ).rejects.toThrow('프로그래머 오류');
      }
    });
  });
});
