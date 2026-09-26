import { describe, it, expect, vi } from 'vitest';

vi.mock('@galley/pipeline', () => ({
  resolveDataDir: (env: { DATA_DIR?: string; BLOG_DIR?: string }) =>
    env.DATA_DIR === undefined
      ? { ok: false, code: 'DATA_DIR_MISSING' }
      : env.BLOG_DIR !== undefined && env.DATA_DIR.startsWith(env.BLOG_DIR)
        ? { ok: false, code: 'DATA_DIR_INSIDE_BLOG_DIR' }
        : { ok: true, dir: env.DATA_DIR },
}));

import { resolveDashboardDataDir } from './data-dir';

describe('resolveDashboardDataDir', () => {
  it('규칙에 맞으면 경로를 돌려준다', () => {
    expect(resolveDashboardDataDir({ DATA_DIR: '/data', BLOG_DIR: '/blog' })).toEqual({
      ok: true,
      dir: '/data',
    });
  });

  it('실패는 코드 하나(DATA_DIR_MISSING)로 묶고 원인 코드는 문구에 넣는다', () => {
    expect(resolveDashboardDataDir({})).toMatchObject({
      ok: false,
      code: 'DATA_DIR_MISSING',
      message: expect.stringContaining('(DATA_DIR_MISSING)'),
    });
    expect(resolveDashboardDataDir({ DATA_DIR: '/blog/data', BLOG_DIR: '/blog' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('(DATA_DIR_INSIDE_BLOG_DIR)'),
    });
  });
});
