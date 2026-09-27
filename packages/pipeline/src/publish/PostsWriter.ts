// posts/<슬러그>/ 산출물 7개 쓰기 — blog 폴더(BLOG_DIR)에 쓰는 **유일한 산출물 경로**. 파일 이름은 postFileNames, 내용은 호출부
// (approvePublish)가 DATA_DIR에서 읽어 넘긴다. 회사 코드 조각은 여기로 오지 않는다(evidence는 포인터 사본 — CLAUDE.md §5).
// 폴더가 이미 있으면 `overwrite`일 때만 쓴다 — Galley가 만든 폴더(DB에 이 주제의 승인된 Run)만 덮어쓰고 사람이 만든 같은
// 슬러그 폴더는 거부한다(2026-09-26 사용자 결정). 파일마다 임시 파일 + rename(원자적, 에디터로 열어 둔 파일이 잘리지 않게).
// 재승인에서 글 제목이 바뀌면 직전 승인이 쓴 5개 이름을 **지우지 않고 DATA_DIR로 옮긴다**(`retire`, decisions/topic-slug.md
// 규칙 4) — 승인이 확정된 뒤에 호출부가 부른다. 그 밖의 파일(사람이 넣은 것)과 이번 승인이 쓴 파일은 건드리지 않는다.
import { constants } from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { postFileNames } from './postFiles.ts';

/** 사람이 읽는 5개 + Galley 부산물 2개. 값은 파일 내용(문자열, 썸네일은 PNG 바이트). */
export interface PostFiles {
  velog: string;
  linkedin: string;
  zenn: string;
  publishInfo: string;
  /** PNG 바이트(발행정보 단계가 만든 thumbnail.png). */
  thumbnail: Uint8Array;
  /** JSON 텍스트 — 포인터만(stripSnippets 결과). */
  evidence: string;
  verification: string;
}

export interface WritePostInput {
  slug: string;
  /** 파일 이름 줄기가 되는 글 제목(발행정보 첫 줄). */
  articleTitle: string;
  files: PostFiles;
  /** 폴더가 이미 있을 때 덮어쓸지 — 호출부가 DB로 판정한다. */
  overwrite: boolean;
}

export type WritePostResult =
  | { ok: true; dir: string; files: string[] }
  /** 폴더가 있는데 덮어쓰기가 허용되지 않음 — 사람이 만든 폴더거나 앞선 승인이 중간에 실패해 남은 폴더. */
  | { ok: false; code: 'POSTS_DIR_EXISTS'; dir: string }
  | { ok: false; code: 'POSTS_WRITE_FAILED'; dir: string; detail: string };

export interface RetirePostInput {
  slug: string;
  /** 직전 승인의 글 제목(호출부가 그 Run의 발행정보에서 읽는다 — 사실 기록). 이 제목으로 만든 5개 이름이 대상이다. */
  previousTitle: string;
  /** 이번 승인이 쓴 파일 이름 — 같은 이름이거나 **같은 파일**이면 옮기지 않는다. */
  keep: readonly string[];
  /** 옮길 폴더(절대경로, DATA_DIR 아래 — ReplacedStore.dirFor). 옮길 것이 있을 때만 만든다. */
  into: string;
}

/**
 * `moved`는 옮긴 이름, `leftover`는 옮기지 못하고 posts 폴더에 남은 이름(폴더·권한·다른 볼륨의 링크·보관 폴더에 같은 이름·
 * 새 파일의 하드링크). 다른 볼륨에서 복사는 됐는데 원본을 못 치운 경우도 leftover다(보관 폴더에 복사본이 있다). 던지지 않는다.
 */
export interface RetirePostResult {
  moved: string[];
  leftover: string[];
}

export interface PostsWriter {
  write(input: WritePostInput): Promise<WritePostResult>;
  retire(input: RetirePostInput): Promise<RetirePostResult>;
}

/** 슬러그 검증 — 구분자·`..`·NUL이면 blog 폴더 밖을 가리킬 수 있다(ArtifactStore와 같은 규칙). 프로그래머 오류라 던진다. */
const SAFE = /^(?!\.\.?$)[^/\\\0]+$/;

export class LocalFsPostsWriter implements PostsWriter {
  private readonly postsDir: string;

  constructor(blogDir: string) {
    this.postsDir = join(blogDir, 'posts');
  }

  dirFor(slug: string): string {
    if (!SAFE.test(slug))
      throw new Error('slug이 폴더 이름으로 쓸 수 없는 값이다 — 프로그래머 오류');
    return join(this.postsDir, slug);
  }

  async write(input: WritePostInput): Promise<WritePostResult> {
    const dir = this.dirFor(input.slug);
    const names = postFileNames(input.articleTitle);
    const plan: [string, string | Uint8Array][] = [
      [names.velog, input.files.velog],
      [names.linkedin, input.files.linkedin],
      [names.zenn, input.files.zenn],
      [names.publishInfo, input.files.publishInfo],
      [names.thumbnail, input.files.thumbnail],
      [names.evidence, input.files.evidence],
      [names.verification, input.files.verification],
    ];

    let exists = true;
    try {
      await access(dir);
    } catch {
      exists = false;
    }
    if (exists && !input.overwrite) return { ok: false, code: 'POSTS_DIR_EXISTS', dir };

    // 파일 단위로만 원자적이다 — 중간에 실패하면 앞 파일은 새것, 뒤는 옛것이 섞일 수 있다(리뷰 L1, 기록). 임시 파일은 남기지 않는다.
    let temp: string | undefined;
    try {
      await mkdir(dir, { recursive: true });
      for (const [name, text] of plan) {
        const path = join(dir, name);
        temp = `${path}.${process.pid}.tmp`;
        await writeFile(temp, text);
        await rename(temp, path);
        temp = undefined;
      }
    } catch (error) {
      if (temp !== undefined) await rm(temp, { force: true });
      return {
        ok: false,
        code: 'POSTS_WRITE_FAILED',
        dir,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    return { ok: true, dir, files: plan.map(([name]) => name) };
  }

  /**
   * 직전 승인 제목의 5개 이름(본문·링크드인·zenn·발행정보·썸네일)을 `into`로 옮긴다. evidence·verification은 고정 이름이라
   * 이미 덮어썼다. **지우지 않는다** — 옮기지 못하면 posts에 남기고 leftover로 알린다. 옮기지 않는 것:
   *  - 이번 승인이 쓴 이름과 같은 것 — 대소문자·유니코드 정규화를 접어 비교한다(조용히).
   *  - 이번 승인이 쓴 파일과 **같은 파일**(dev·ino) — 대소문자를 구분하지 않는 파일시스템(macOS 기본)에서는 제목의 대소문자만
   *    바뀌어도 옛 이름이 새 파일을 가리킨다(`Straße`/`STRASSE`처럼 이름 접기로 못 잡는 경우도). 이름이 아니라 파일시스템
   *    기준으로 막는다(TS4 리뷰 H1). 폴더에 그 이름이 따로 있으면(하드링크) 남은 것이므로 leftover, 없으면 같은 파일의
   *    다른 표기일 뿐이라 조용히.
   *  - 없는 파일(조용히), 폴더·`into`에 같은 이름이 이미 있는 것·옮기다 실패한 것(leftover).
   */
  async retire(input: RetirePostInput): Promise<RetirePostResult> {
    const dir = this.dirFor(input.slug);
    const fold = (name: string) => name.normalize('NFC').toLowerCase();
    const keepNames = new Set(input.keep.map(fold));
    const keepFiles = new Set<string>();
    for (const name of input.keep) {
      const id = await fileId(join(dir, name));
      if (typeof id === 'string') keepFiles.add(id);
    }
    let entries: ReadonlySet<string>;
    try {
      entries = new Set(await readdir(dir));
    } catch {
      return { moved: [], leftover: [] };
    }

    const names = postFileNames(input.previousTitle);
    const moved: string[] = [];
    const leftover: string[] = [];
    for (const name of [
      names.velog,
      names.linkedin,
      names.zenn,
      names.publishInfo,
      names.thumbnail,
    ]) {
      if (keepNames.has(fold(name))) continue;
      const path = join(dir, name);
      let stat;
      try {
        stat = await lstat(path, { bigint: true });
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') leftover.push(name);
        continue;
      }
      if (keepFiles.has(`${stat.dev}:${stat.ino}`)) {
        if (entries.has(name)) leftover.push(name);
        continue;
      }
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        leftover.push(name);
        continue;
      }
      try {
        await mkdir(input.into, { recursive: true });
        const to = join(input.into, name);
        // 보관 폴더에 같은 이름이 있으면 덮어쓰지 않는다 — 앞서 보관한 파일을 잃지 않게.
        if ((await fileId(to)) !== 'missing') {
          leftover.push(name);
          continue;
        }
        await moveFile(path, to, stat.isSymbolicLink());
        moved.push(name);
      } catch {
        leftover.push(name);
      }
    }
    return { moved, leftover };
  }
}

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

/** 파일의 `dev:ino`(링크는 링크 자체). 없으면 `'missing'`, 그 밖의 실패는 `undefined`(있다고 본다). */
async function fileId(path: string): Promise<string | 'missing' | undefined> {
  try {
    const stat = await lstat(path, { bigint: true });
    return `${stat.dev}:${stat.ino}`;
  } catch (error) {
    return errorCode(error) === 'ENOENT' ? 'missing' : undefined;
  }
}

/**
 * rename으로 옮긴다. 다른 볼륨(EXDEV)이면 **복사가 확인된 뒤에만** 원본을 치운다 — 대상이 없을 때만 복사하고(COPYFILE_EXCL),
 * 크기가 같은지 본 뒤 원본을 제거한다. 링크는 복사하면 대상의 내용이 되므로 다른 볼륨이면 옮기지 않는다(호출부가 leftover로).
 * blog 폴더의 파일을 없애는 유일한 자리다(CLAUDE.md §5 예외 — 옮기기의 일부).
 */
async function moveFile(from: string, to: string, isLink: boolean): Promise<void> {
  try {
    await rename(from, to);
    return;
  } catch (error) {
    if (errorCode(error) !== 'EXDEV' || isLink) throw error;
  }
  await copyFile(from, to, constants.COPYFILE_EXCL);
  const [source, copy] = await Promise.all([stat(from), stat(to)]);
  if (source.size !== copy.size) throw new Error('복사본의 크기가 원본과 다르다');
  await rm(from);
}
