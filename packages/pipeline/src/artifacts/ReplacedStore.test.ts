import { describe, test, expect } from 'vitest';
import { join } from 'node:path';
import { LocalFsReplacedStore } from './ReplacedStore.ts';

describe('LocalFsReplacedStore', () => {
  test('DATA_DIR/replaced/<슬러그>/<runId> — 폴더를 만들지는 않는다', () => {
    const store = new LocalFsReplacedStore(join('/data'));
    expect(store.dirFor('무한-스크롤', 'run_2')).toBe(
      join('/data', 'replaced', '무한-스크롤', 'run_2'),
    );
  });

  test('구분자·..이 든 조각은 DATA_DIR 밖을 가리킬 수 있어 던진다(프로그래머 오류)', () => {
    const store = new LocalFsReplacedStore('/data');
    for (const [slug, runId] of [
      ['../x', 'run'],
      ['a/b', 'run'],
      ['..', 'run'],
      ['slug', '../run'],
      ['slug', 'a\\b'],
    ] as const)
      expect(() => store.dirFor(slug, runId), `${slug} ${runId}`).toThrow();
  });
});
