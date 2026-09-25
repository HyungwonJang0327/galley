import { describe, test, expect } from 'vitest';
import { resolveDataDir } from './resolveDataDir.ts';

describe('resolveDataDir', () => {
  test('절대경로면 그대로(정규화)', () => {
    expect(resolveDataDir({ DATA_DIR: '/tmp/galley/data/' })).toEqual({
      ok: true,
      dir: '/tmp/galley/data',
    });
    expect(resolveDataDir({ DATA_DIR: '/tmp/galley/data', BLOG_DIR: '/home/me/blog' })).toEqual({
      ok: true,
      dir: '/tmp/galley/data',
    });
  });

  test('비었거나 공백이면 MISSING — cwd 상대경로로 조용히 쓰지 않는다', () => {
    expect(resolveDataDir({})).toEqual({ ok: false, code: 'DATA_DIR_MISSING', value: '' });
    expect(resolveDataDir({ DATA_DIR: '   ' })).toEqual({
      ok: false,
      code: 'DATA_DIR_MISSING',
      value: '',
    });
  });

  test('상대경로는 거부(워커·대시보드 cwd가 다르다)', () => {
    expect(resolveDataDir({ DATA_DIR: 'data' })).toEqual({
      ok: false,
      code: 'DATA_DIR_NOT_ABSOLUTE',
      value: 'data',
    });
    expect(resolveDataDir({ DATA_DIR: './data' })).toMatchObject({ code: 'DATA_DIR_NOT_ABSOLUTE' });
  });

  test('BLOG_DIR 자신이나 그 아래면 거부 — 코드 조각이 발행 원고 폴더로 나가지 않게', () => {
    expect(resolveDataDir({ DATA_DIR: '/home/me/blog', BLOG_DIR: '/home/me/blog' })).toMatchObject({
      code: 'DATA_DIR_INSIDE_BLOG_DIR',
    });
    expect(
      resolveDataDir({ DATA_DIR: '/home/me/blog/.galley', BLOG_DIR: '/home/me/blog/' }),
    ).toMatchObject({ code: 'DATA_DIR_INSIDE_BLOG_DIR' });
    // 이름만 접두가 같은 형제 폴더는 안이 아니다.
    expect(resolveDataDir({ DATA_DIR: '/home/me/blog-data', BLOG_DIR: '/home/me/blog' })).toEqual({
      ok: true,
      dir: '/home/me/blog-data',
    });
    // 반대로 blog가 data 아래인 것은 막지 않는다(조각이 blog로 가지 않는다).
    expect(resolveDataDir({ DATA_DIR: '/home/me', BLOG_DIR: '/home/me/blog' })).toEqual({
      ok: true,
      dir: '/home/me',
    });
  });

  test('BLOG_DIR이 상대경로면 비교하지 않는다(그쪽 검증은 BLOG_DIR 몫)', () => {
    expect(resolveDataDir({ DATA_DIR: '/tmp/data', BLOG_DIR: 'blog' })).toEqual({
      ok: true,
      dir: '/tmp/data',
    });
  });
});
