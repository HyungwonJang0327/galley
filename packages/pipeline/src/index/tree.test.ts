import { describe, test, expect } from 'vitest';
import { planAreas, isIgnoredPath, describeTree } from './tree.ts';
import { INDEX_LIMITS } from './limits.ts';

const f = (path: string, size = 100) => ({ path, size });

describe('isIgnoredPath', () => {
  test('의존성·산출물 폴더, 락파일, 바이너리 확장자는 뺀다. 대소문자 확장자도', () => {
    expect(isIgnoredPath('node_modules/x/index.js')).toBe(true);
    expect(isIgnoredPath('apps/web/dist/main.js')).toBe(true);
    expect(isIgnoredPath('pnpm-lock.yaml')).toBe(true);
    expect(isIgnoredPath('public/logo.PNG')).toBe(true);
    expect(isIgnoredPath('src/index.ts')).toBe(false);
    expect(isIgnoredPath('README')).toBe(false);
  });

  test('디렉터리 조각만 본다 — build·out·vendor라는 파일이나 src/build 도구 소스는 남긴다', () => {
    expect(isIgnoredPath('scripts/build')).toBe(false);
    expect(isIgnoredPath('src/vendor.ts')).toBe(false);
    expect(isIgnoredPath('build/index.js')).toBe(true);
  });

  test('비밀값 파일은 redact 설정과 무관하게 뺀다 — .env 계열·키·인증서·자격 증명', () => {
    for (const p of [
      '.env',
      '.env.local',
      'apps/web/.env.production',
      'secrets/server.pem',
      'k.key',
      'a.p12',
      'credentials.json',
      'id_rsa',
      '.npmrc',
    ])
      expect(isIgnoredPath(p), p).toBe(true);
    expect(isIgnoredPath('src/env.ts')).toBe(false);
    expect(isIgnoredPath('src/environment.md')).toBe(false);
  });
});

describe('planAreas', () => {
  test('최상위 디렉터리가 영역, 루트 파일은 "." 영역, 키는 area:<dir>, 결정론적 정렬', () => {
    const s = planAreas([
      f('src/b.ts'),
      f('src/a.ts'),
      f('README.md'),
      f('docs/x.md'),
      f('node_modules/y.js'),
    ]);
    expect(s.totalFiles).toBe(5);
    expect(s.ignoredFiles).toBe(1);
    expect(s.areas.map((a) => a.key)).toEqual(['area:.', 'area:docs', 'area:src']);
    expect(s.areas[2]!.files.map((x) => x.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(s.areas.every((a) => !a.summaryOnly)).toBe(true);
  });

  test('파일이 filesPerArea를 넘고 하위 디렉터리가 있으면 한 단계 아래로 쪼갠다(모노레포 packages/*)', () => {
    const files = [
      ...Array.from({ length: 15 }, (_, i) => f(`packages/ui/src/c${i}.ts`)),
      ...Array.from({ length: 15 }, (_, i) => f(`packages/pipeline/src/p${i}.ts`)),
      f('packages/README.md'),
    ];
    const s = planAreas(files);
    expect(s.areas.map((a) => a.dir)).toEqual(['packages', 'packages/pipeline', 'packages/ui']);
    expect(s.areas[0]!.files.map((x) => x.path)).toEqual(['packages/README.md']);
    expect(s.areas[1]!.files).toHaveLength(15);
  });

  test('filesPerArea 경계: 정확히 20개면 쪼개지 않고 21개면 쪼갠다', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => f(`pkg/${i % 2 ? 'a' : 'b'}/f${i}.ts`));
    expect(planAreas(twenty).areas.map((a) => a.dir)).toEqual(['pkg']);
    const twentyOne = [...twenty, f('pkg/a/extra.ts')];
    expect(planAreas(twentyOne).areas.map((a) => a.dir)).toEqual(['pkg/a', 'pkg/b']);
  });

  test('정렬은 코드포인트 기준(로케일 무관) — 대문자가 소문자보다 앞', () => {
    const s = planAreas([f('src/b.ts'), f('src/B.ts'), f('Zed/x.ts'), f('alpha/y.ts')]);
    expect(s.areas.map((a) => a.dir)).toEqual(['Zed', 'alpha', 'src']);
    expect(s.areas[2]!.files.map((x) => x.path)).toEqual(['src/B.ts', 'src/b.ts']);
  });

  test('하위 디렉터리가 없으면 넘쳐도 쪼개지 않고 상한 밖 파일은 이름만(summaryOnly)', () => {
    const files = Array.from({ length: 25 }, (_, i) =>
      f(`flat/f${String(i).padStart(2, '0')}.ts`, 10),
    );
    const s = planAreas(files);
    expect(s.areas).toHaveLength(1);
    const area = s.areas[0]!;
    expect(area.files.filter((x) => x.include)).toHaveLength(INDEX_LIMITS.filesPerArea);
    expect(area.summaryOnly).toBe(true);
    expect(area.includedBytes).toBe(INDEX_LIMITS.filesPerArea * 10);
  });

  test('큰 파일(fileBytes 초과)과 합계 상한(bytesPerArea)을 넘는 파일은 이름만 넘긴다', () => {
    const big = f('src/huge.ts', INDEX_LIMITS.fileBytes + 1);
    const s1 = planAreas([big, f('src/small.ts', 10)]);
    expect(s1.areas[0]!.files.find((x) => x.path === 'src/huge.ts')!.include).toBe(false);
    expect(s1.areas[0]!.summaryOnly).toBe(true);
    const many = Array.from({ length: 12 }, (_, i) => f(`src/m${i}.ts`, INDEX_LIMITS.fileBytes));
    const s2 = planAreas(many);
    const included = s2.areas[0]!.files.filter((x) => x.include);
    expect(included.length).toBe(Math.floor(INDEX_LIMITS.bytesPerArea / INDEX_LIMITS.fileBytes));
    expect(s2.areas[0]!.includedBytes).toBeLessThanOrEqual(INDEX_LIMITS.bytesPerArea);
  });

  test('상한 안에서는 소스 확장자가 문서·설정보다 먼저 들어간다', () => {
    const files = [f('src/notes.md', 10), f('src/config.json', 10), f('src/main.ts', 10)];
    const s = planAreas(files, { ...INDEX_LIMITS, filesPerArea: 1 });
    const included = s.areas[0]!.files.filter((x) => x.include).map((x) => x.path);
    expect(included).toEqual(['src/main.ts']);
  });

  test('describeTree는 영역별 파일 수를 한 줄씩 낸다', () => {
    const s = planAreas([f('src/a.ts'), f('README.md')]);
    expect(describeTree(s)).toBe(
      '2 files (0 ignored)\n- . (1 files, 1 with content)\n- src (1 files, 1 with content)',
    );
  });

  test('빈 입력은 영역 없음', () => {
    expect(planAreas([])).toEqual({ totalFiles: 0, ignoredFiles: 0, areas: [] });
  });
});
