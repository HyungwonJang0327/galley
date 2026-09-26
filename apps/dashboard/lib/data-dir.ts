// DATA_DIR(산출물·근거 번들 저장소) 해석 — 승인(run-commands)과 산출물 미리보기(run-artifacts)가 같은 규칙으로 읽는다.
// 규칙은 워커와 같다(절대경로·BLOG_DIR 밖, packages/pipeline resolveDataDir). 실패 문구는 여기서 한 번만 붙인다.
import 'server-only';
import { resolveDataDir } from '@galley/pipeline';

export type DataDirResult =
  { ok: true; dir: string } | { ok: false; code: 'DATA_DIR_MISSING'; message: string };

/** `.env`의 DATA_DIR을 해석한다. BLOG_DIR이 없으면 "BLOG_DIR 밖" 검사만 빠진다. 호출처가 env를 명시한다. */
export function resolveDashboardDataDir(env: {
  DATA_DIR?: string;
  BLOG_DIR?: string;
}): DataDirResult {
  const result = resolveDataDir({ DATA_DIR: env.DATA_DIR, BLOG_DIR: env.BLOG_DIR });
  if (result.ok) return { ok: true, dir: result.dir };
  return {
    ok: false,
    code: 'DATA_DIR_MISSING',
    message: `루트 .env의 DATA_DIR이 규칙에 맞지 않습니다(${result.code}). 절대경로로, BLOG_DIR 밖에 두세요.`,
  };
}
