// 리포 인덱싱 CLI — Phase 1-B 진입점. **리포를 등록하고 IndexJob을 queued로 만들 뿐**, 실행은 워커가 한다
// (decisions/run-location.md — 대시보드·CLI는 워커에 신호를 보내지 않는다).
//   pnpm --filter @galley/pipeline index <path> [--name <n>] [--alias a,b] [--read-only] [--model <id>] [--full]
// Node 24 타입 스트리핑으로 그대로 돈다(상대 import 확장자 필수 — decisions/node-runtime.md).
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { prisma } from '../src/db.ts';
import { defaultRedactConfigPath, loadRedactConfig } from '../src/evidence/redact.ts';
import { enqueueIndexJob, type EnqueueIndexJobFailure } from '../src/index/enqueueIndexJob.ts';
import { createModelRegistryFromEnv } from '../src/model/ModelRegistry.ts';

const USAGE =
  '사용법: index <리포 경로> [--name <이름>] [--alias a,b] [--read-only] [--model <레지스트리 id>] [--full]';

const FAILURE_MESSAGES: Record<EnqueueIndexJobFailure['code'], string> = {
  NOT_A_GIT_REPO: 'git 리포지토리가 아닙니다.',
  GIT_COMMAND_FAILED: 'git 명령이 실패했습니다.',
  GIT_OBJECT_NOT_FOUND: 'HEAD 커밋을 찾을 수 없습니다(빈 리포?).',
  INDEX_JOB_ACTIVE: '이 리포에 아직 끝나지 않은 인덱싱 작업이 있습니다.',
  REPO_NAME_TAKEN: '다른 리포가 이 이름을 쓰고 있습니다.',
};

async function main(argv: readonly string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        name: { type: 'string' },
        alias: { type: 'string' },
        'read-only': { type: 'boolean' },
        model: { type: 'string' },
        full: { type: 'boolean' },
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return 2;
  }
  const [path] = parsed.positionals;
  if (path === undefined || parsed.positionals.length !== 1) {
    console.error(USAGE);
    return 2;
  }
  const { values } = parsed;

  const registry = createModelRegistryFromEnv(process.env);
  const adapter =
    values.model === undefined ? registry.indexingDefault() : registry.get(values.model);
  if (adapter === undefined) {
    console.error(
      `모델 ${values.model}이(가) 레지스트리에 없습니다. 사용 가능: ${registry
        .list()
        .map((a) => a.id)
        .join(', ')}`,
    );
    return 2;
  }
  if (!adapter.available) {
    console.error(`모델 ${adapter.id}의 API 키가 .env에 없습니다(available:false).`);
    return 2;
  }

  // 식별 정보 필터: 깨진 설정(INVALID·UNREADABLE)은 무조건 거부(BE2 결정), 없는 설정(MISSING)은 readOnly 리포만 거부
  // — 워커가 REDACT_CONFIG_REQUIRED로 실패시키기 전에 여기서 먼저 막는다.
  const redactPath = defaultRedactConfigPath(process.env);
  const loaded = await loadRedactConfig(redactPath);
  if (!loaded.ok && loaded.code !== 'REDACT_CONFIG_MISSING') {
    console.error(`식별 정보 필터 설정이 깨져 있습니다(${loaded.code}): ${redactPath}`);
    return 2;
  }
  if (!loaded.ok && values['read-only'] === true) {
    console.error(
      `읽기 전용 리포는 식별 정보 필터 설정이 필요합니다(${loaded.code}): ${redactPath}`,
    );
    return 2;
  }

  // pnpm 스크립트는 cwd가 packages/pipeline이다 — 상대경로는 사용자가 명령을 친 폴더(INIT_CWD) 기준으로 푼다.
  const absolutePath = resolve(process.env['INIT_CWD'] ?? process.cwd(), path);
  const result = await enqueueIndexJob(prisma, {
    path: absolutePath,
    ...(values.name !== undefined ? { name: values.name } : {}),
    ...(values.alias !== undefined ? { aliases: values.alias.split(',') } : {}),
    // 플래그가 있을 때만 true — 없다고 기존 readOnly 리포를 false로 되돌리지 않는다(식별 정보 필터 필수 가드).
    ...(values['read-only'] === true ? { readOnly: true } : {}),
    modelId: adapter.id,
    full: values.full === true,
  });
  if (!result.ok) {
    const detail =
      'jobId' in result ? ` (작업 ${result.jobId})` : 'path' in result ? ` (${result.path})` : '';
    console.error(`${FAILURE_MESSAGES[result.code]}${detail}`);
    return 1;
  }
  const { repo, job, headSha } = result.value;
  console.log(
    JSON.stringify({
      repo: { id: repo.id, name: repo.name, readOnly: repo.readOnly, created: repo.created },
      headSha,
      ...(job !== undefined ? { job } : {}),
      model: adapter.id,
    }),
  );
  if (job === undefined)
    console.log('HEAD가 마지막 인덱스와 같아 만들 작업이 없습니다. 전체 재생성은 --full.');
  else
    console.log(
      `인덱싱 작업 ${job.id}(${job.kind})을 큐에 넣었습니다. 워커가 집어갑니다: pnpm --filter @galley/pipeline worker`,
    );
  return 0;
}

main(process.argv.slice(2))
  .then(async (code) => {
    await prisma.$disconnect();
    process.exitCode = code;
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    await prisma.$disconnect();
    process.exitCode = 1;
  });
