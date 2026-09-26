// posts/<슬러그>/ 산출물 7개 쓰기 — blog 폴더(BLOG_DIR)에 쓰는 **유일한 산출물 경로**. 파일 이름은 postFileNames, 내용은 호출부
// (approvePublish)가 DATA_DIR에서 읽어 넘긴다. 회사 코드 조각은 여기로 오지 않는다(evidence는 포인터 사본 — CLAUDE.md §5).
// 폴더가 이미 있으면 `overwrite`일 때만 쓴다 — Galley가 만든 폴더(DB에 이 주제의 승인된 Run)만 덮어쓰고 사람이 만든 같은
// 슬러그 폴더는 거부한다(2026-09-26 사용자 결정). 파일마다 임시 파일 + rename(원자적, 에디터로 열어 둔 파일이 잘리지 않게).
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
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

export interface PostsWriter {
  write(input: WritePostInput): Promise<WritePostResult>;
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
}
