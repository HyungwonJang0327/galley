// DATA_DIR 기동 검증(순수). 회사 코드 조각(EvidenceBundle snippet)은 DATA_DIR에만 쓰므로, 비었거나 blog 폴더 안이면
// 워커를 띄우지 않는다(BE8 리뷰 ⑩ — 빈 문자열이면 cwd 상대경로가 되어 어디에 쓰는지 알 수 없다). PROMPTS_DIR과 같은
// 이유로 절대경로만(워커·대시보드의 cwd가 다르다). decisions/evidence-collection.md.
import { isAbsolute, relative, resolve } from 'node:path';

export type DataDirResult =
  | { ok: true; dir: string }
  | {
      ok: false;
      code: 'DATA_DIR_MISSING' | 'DATA_DIR_NOT_ABSOLUTE' | 'DATA_DIR_INSIDE_BLOG_DIR';
      value: string;
    };

export function resolveDataDir(env: {
  DATA_DIR?: string | undefined;
  BLOG_DIR?: string | undefined;
}): DataDirResult {
  const raw = env.DATA_DIR?.trim() ?? '';
  if (raw === '') return { ok: false, code: 'DATA_DIR_MISSING', value: raw };
  if (!isAbsolute(raw)) return { ok: false, code: 'DATA_DIR_NOT_ABSOLUTE', value: raw };
  const dir = resolve(raw);
  const blog = env.BLOG_DIR?.trim() ?? '';
  if (blog !== '' && isAbsolute(blog)) {
    const rel = relative(resolve(blog), dir);
    // 같은 폴더(빈 문자열)거나 아래(../로 시작하지 않고 절대경로가 아님)면 blog 안이다.
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)))
      return { ok: false, code: 'DATA_DIR_INSIDE_BLOG_DIR', value: raw };
  }
  return { ok: true, dir };
}
