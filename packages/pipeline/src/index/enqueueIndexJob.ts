// 리포 등록 + 인덱싱 작업(IndexJob) 생성 — CLI `index <path>`와 Phase 2 `/settings/repos` Dialog가 같은 함수를 부른다.
// 실행은 하지 않는다(워커가 queued를 집어간다 — decisions/run-location.md). 예상된 실패는 값으로.
import { basename, resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { gitHead } from './gitRead.ts';
import { INDEX_JOB_KIND, INDEX_JOB_STATUS, REPO_STATUS, serializeStringArray } from './schema.ts';

export interface EnqueueIndexJobInput {
  /** 리포 경로(상대면 cwd 기준으로 절대화 — CLI는 사용자 셸 기준으로 먼저 푼다). 하드코딩 금지. */
  path: string;
  /** 주제_큐.md 힌트와 매칭되는 이름. 없으면 폴더 이름. 기존 리포면 바꾸지 않는다(값이 있을 때만 갱신). */
  name?: string;
  aliases?: readonly string[];
  /** 값이 있을 때만 갱신 — 호출자는 "읽기 전용으로 만든다"는 뜻일 때만 true를 넘기고, 플래그가 없으면 넘기지 않는다(false로 되돌리지 않게). */
  readOnly?: boolean;
  /** 레지스트리 어댑터 id. 호출자가 기본값(indexingDefault)을 채워 넘긴다 — 이 모듈은 레지스트리를 모른다. */
  modelId: string;
  /** 전체 재생성. 없으면 HEAD가 바뀐 만큼만(증분), 안 바뀌었으면 작업을 만들지 않는다. */
  full?: boolean;
}

export interface EnqueuedIndexJob {
  repo: { id: string; name: string; path: string; readOnly: boolean; created: boolean };
  /** 만들지 않았으면(HEAD 그대로) undefined. */
  job?: { id: string; kind: 'full' | 'incremental'; fromSha?: string; toSha: string };
  headSha: string;
}

export type EnqueueIndexJobFailure =
  | { ok: false; code: 'NOT_A_GIT_REPO' | 'GIT_COMMAND_FAILED' | 'GIT_OBJECT_NOT_FOUND' }
  /** 같은 리포에 queued·running·interrupted 작업이 이미 있다. */
  | { ok: false; code: 'INDEX_JOB_ACTIVE'; jobId: string }
  /** 다른 경로의 리포가 이 이름을 쓰고 있다. */
  | { ok: false; code: 'REPO_NAME_TAKEN'; path: string };
export type EnqueueIndexJobResult = { ok: true; value: EnqueuedIndexJob } | EnqueueIndexJobFailure;

const ACTIVE = [INDEX_JOB_STATUS.queued, INDEX_JOB_STATUS.running, INDEX_JOB_STATUS.interrupted];

export async function enqueueIndexJob(
  prisma: PrismaClient,
  input: EnqueueIndexJobInput,
): Promise<EnqueueIndexJobResult> {
  const path = resolve(input.path);
  const head = await gitHead(path);
  if (!head.ok) return head;

  const existing = await prisma.repo.findUnique({ where: { path } });
  const name = input.name ?? existing?.name ?? basename(path);
  const taken = await prisma.repo.findUnique({ where: { name }, select: { id: true, path: true } });
  if (taken !== null && taken.path !== path)
    return { ok: false, code: 'REPO_NAME_TAKEN', path: taken.path };

  // 실패면 아무것도 바꾸지 않는다(decisions/error-handling.md) — 활성 작업 검사는 어떤 쓰기보다 앞에.
  // 돌고 있는 작업은 클레임 시점의 readOnly로 필터 필수 여부를 정했으므로 그 밑에서 리포를 바꾸지도 않는다.
  if (existing !== null) {
    const active = await prisma.indexJob.findFirst({
      where: { repoId: existing.id, status: { in: ACTIVE } },
      select: { id: true },
    });
    if (active !== null) return { ok: false, code: 'INDEX_JOB_ACTIVE', jobId: active.id };
  }

  const data = {
    name,
    ...(input.aliases !== undefined ? { aliases: serializeStringArray(input.aliases) } : {}),
    ...(input.readOnly !== undefined ? { readOnly: input.readOnly } : {}),
  };
  const incremental =
    !input.full &&
    existing !== null &&
    existing.headSha !== null &&
    existing.status !== REPO_STATUS.error;
  const sameHead = incremental && existing.headSha === head.value;
  const kind = incremental ? INDEX_JOB_KIND.incremental : INDEX_JOB_KIND.full;
  const fromSha = incremental ? existing.headSha : null;

  // 리포 갱신 + 작업 생성 + stale 전이를 한 트랜잭션으로(중간 상태가 남지 않게).
  const { repo, jobId } = await prisma.$transaction(async (tx) => {
    const repo =
      existing === null
        ? await tx.repo.create({ data: { path, ...data, status: REPO_STATUS.indexing } })
        : await tx.repo.update({ where: { id: existing.id }, data });
    if (sameHead) return { repo, jobId: undefined };
    const job = await tx.indexJob.create({
      data: { repoId: repo.id, kind, fromSha, toSha: head.value, modelId: input.modelId },
      select: { id: true },
    });
    // HEAD가 마지막 인덱스와 달라졌을 때만 stale(스키마 정의 그대로). 실행자가 잡으면 indexing, 끝나면 ready/error.
    if (existing !== null && existing.headSha !== null && existing.headSha !== head.value)
      await tx.repo.update({ where: { id: repo.id }, data: { status: REPO_STATUS.stale } });
    return { repo, jobId: job.id };
  });

  const base = {
    id: repo.id,
    name: repo.name,
    path: repo.path,
    readOnly: repo.readOnly,
    created: existing === null,
  };
  if (jobId === undefined) return { ok: true, value: { repo: base, headSha: head.value } };
  return {
    ok: true,
    value: {
      repo: base,
      headSha: head.value,
      job: { id: jobId, kind, ...(fromSha !== null ? { fromSha } : {}), toSha: head.value },
    },
  };
}
