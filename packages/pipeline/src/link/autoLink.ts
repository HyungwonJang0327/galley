// 주제 ↔ 분석 글 자동 연결(source=auto) — 워커가 백그라운드로, 모델 없이. 큐 적재(힌트 갱신)·리포 재인덱싱(새 글) 뒤에
// `QueueItem.autoLinkedAt`이 오래된 주제만 다시 계산한다(대시보드는 신호를 보내지 않는다 — decisions/run-location.md).
// manual 연결은 **절대 건드리지 않는다**(추가·삭제·강등 없음). auto는 계산 결과와 같아지도록 추가·삭제한다.
import type { PrismaClient } from '@prisma/client';
import { LINK_SOURCE, parseStringArray, isAnalysisKind } from '../index/schema.ts';
import type { Clock, Logger } from '../worker/WorkerDeps.ts';
import { AUTO_LINK_LIMITS, type AutoLinkLimits } from './limits.ts';
import { matchTopic, type AnalysisCandidate } from './matchTopic.ts';

export interface AutoLinkResult {
  topicId: string;
  /** 계산 뒤 이 주제의 auto 연결 수. */
  linked: number;
  added: number;
  removed: number;
  /** 계산 결과에도 있었지만 manual이라 그대로 둔 수. */
  keptManual: number;
}

/** 모든 리포의 분석 글을 후보 형태로 — 틱 하나가 한 번 읽고 여러 주제에 쓴다. */
export async function loadAnalysisCandidates(prisma: PrismaClient): Promise<AnalysisCandidate[]> {
  const rows = await prisma.repoAnalysis.findMany({
    select: {
      id: true,
      kind: true,
      key: true,
      keywords: true,
      period: true,
      repo: { select: { name: true } },
    },
  });
  const out: AnalysisCandidate[] = [];
  for (const r of rows) {
    if (!isAnalysisKind(r.kind)) continue;
    out.push({
      id: r.id,
      repoName: r.repo.name,
      kind: r.kind,
      key: r.key,
      keywords: parseStringArray(r.keywords),
      period: r.period,
    });
  }
  return out;
}

export type LinkTopicOutcome =
  | { ok: true; result: AutoLinkResult }
  /** 주제가 없다(삭제됨). */
  | { ok: false; code: 'TOPIC_NOT_FOUND' }
  /** 읽고 쓰는 사이에 큐 적재(힌트 갱신)가 끼어들었다 — 아무것도 쓰지 않았고 다음 틱이 새 힌트로 다시 계산한다. */
  | { ok: false; code: 'TOPIC_CHANGED' }
  /** 읽고 쓰는 사이에 같은 글의 manual 연결이 생겼거나 글이 지워졌다(unique·FK) — 다음 틱이 다시 계산한다. */
  | { ok: false; code: 'LINK_CONFLICT' };

class Rollback extends Error {
  code: 'TOPIC_CHANGED' | 'LINK_CONFLICT';
  constructor(code: 'TOPIC_CHANGED' | 'LINK_CONFLICT') {
    super(code);
    this.code = code;
  }
}

const isPrismaCode = (error: unknown, codes: readonly string[]): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string' &&
  codes.includes(error.code);

/**
 * 주제 하나의 auto 연결을 계산 결과와 같게 맞춘다. 힌트·기존 연결 읽기와 쓰기를 **한 트랜잭션**에서 하고, 마지막에
 * `updatedAt`이 읽은 값 그대로일 때만 `autoLinkedAt`을 기록한다(조건부 updateMany) — 그 사이 적재가 힌트를 바꿨으면
 * 옛 힌트로 만든 연결을 "최신"으로 남기지 않고 롤백한다. `updatedAt`은 건드리지 않는다(적재 시각의 의미 보존).
 * 힌트가 하나도 없는 주제는 auto 연결이 전부 지워진다(잘못 붙은 것을 남기지 않는다).
 */
export async function linkTopicAuto(
  prisma: PrismaClient,
  topicId: string,
  candidates: readonly AnalysisCandidate[],
  now: Date,
  limits: AutoLinkLimits = AUTO_LINK_LIMITS,
): Promise<LinkTopicOutcome> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const topic = await tx.queueItem.findUnique({
        where: { id: topicId },
        select: { repoNames: true, keywords: true, period: true, updatedAt: true },
      });
      if (topic === null) return null;
      const matched = matchTopic(
        {
          repoNames: parseStringArray(topic.repoNames),
          keywords: parseStringArray(topic.keywords),
          period: topic.period,
        },
        candidates,
        limits,
      );
      const existing = await tx.topicAnalysisLink.findMany({
        where: { topicId },
        select: { analysisId: true, source: true },
      });
      const manual = new Set(
        existing.filter((l) => l.source === LINK_SOURCE.manual).map((l) => l.analysisId),
      );
      const auto = new Set(
        existing.filter((l) => l.source === LINK_SOURCE.auto).map((l) => l.analysisId),
      );
      const desired = matched.map((m) => m.id).filter((id) => !manual.has(id));
      const keptManual = matched.length - desired.length;
      const add = desired.filter((id) => !auto.has(id));
      const desiredSet = new Set(desired);
      const remove = [...auto].filter((id) => !desiredSet.has(id));

      if (remove.length > 0)
        await tx.topicAnalysisLink.deleteMany({
          where: { topicId, source: LINK_SOURCE.auto, analysisId: { in: remove } },
        });
      if (add.length > 0)
        await tx.topicAnalysisLink.createMany({
          data: add.map((analysisId) => ({ topicId, analysisId, source: LINK_SOURCE.auto })),
        });
      // 읽은 뒤 적재가 끼어들었으면(updatedAt 변경) 0건 → 롤백. 성공해도 updatedAt은 그대로 둔다(@updatedAt은 명시 값을 존중).
      const { count } = await tx.queueItem.updateMany({
        where: { id: topicId, updatedAt: topic.updatedAt },
        data: { autoLinkedAt: now, updatedAt: topic.updatedAt },
      });
      if (count === 0) throw new Rollback('TOPIC_CHANGED');
      return {
        topicId,
        linked: desired.length,
        added: add.length,
        removed: remove.length,
        keptManual,
      } satisfies AutoLinkResult;
    });
    return result === null ? { ok: false, code: 'TOPIC_NOT_FOUND' } : { ok: true, result };
  } catch (error) {
    if (error instanceof Rollback) return { ok: false, code: error.code };
    // P2002 unique(topicId, analysisId) · P2003 FK(글이 지워짐) — 같은 트랜잭션 안에서도 다른 커넥션의 커밋과 경합할 수 있다.
    if (isPrismaCode(error, ['P2002', 'P2003'])) return { ok: false, code: 'LINK_CONFLICT' };
    throw error;
  }
}

/** 다시 계산할 주제 — autoLinkedAt이 없거나, 힌트 재적재(updatedAt)·리포 재인덱싱(lastIndexedAt)보다 오래된 것. 오래된 순. */
export async function findStaleTopics(prisma: PrismaClient, limit: number): Promise<string[]> {
  const [{ _max }, topics] = await Promise.all([
    prisma.repo.aggregate({ _max: { lastIndexedAt: true } }),
    prisma.queueItem.findMany({ select: { id: true, updatedAt: true, autoLinkedAt: true } }),
  ]);
  const indexedAt = _max.lastIndexedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return topics
    .filter(
      (t) =>
        t.autoLinkedAt === null ||
        t.autoLinkedAt.getTime() < t.updatedAt.getTime() ||
        t.autoLinkedAt.getTime() < indexedAt,
    )
    .sort((a, b) => (a.autoLinkedAt?.getTime() ?? 0) - (b.autoLinkedAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((t) => t.id);
}

export interface AutoLinkTickDeps {
  prisma: PrismaClient;
  clock: Clock;
  logger: Logger;
  limits?: AutoLinkLimits;
}

export type AutoLinkTickResult =
  | { outcome: 'idle' }
  /** 주제 몇 개를 다시 계산했다(연결 변화가 없어도 linked). skipped = 경합으로 건너뛴 수(다음 틱이 다시 본다). */
  | { outcome: 'linked'; topics: number; added: number; removed: number; skipped: number };

/**
 * 워커 틱 — Run·IndexJob이 없을 때만 불린다. 오래된 주제를 `topicsPerTick`개까지 계산하고, 종료 신호가 오면 주제 사이에서 멈춘다.
 * 분석 글 후보는 틱마다 한 번 읽는다.
 */
export async function runAutoLinkTick(
  deps: AutoLinkTickDeps,
  signal?: AbortSignal,
): Promise<AutoLinkTickResult> {
  if (signal?.aborted) return { outcome: 'idle' };
  const limits = deps.limits ?? AUTO_LINK_LIMITS;
  const stale = await findStaleTopics(deps.prisma, limits.topicsPerTick);
  if (stale.length === 0) return { outcome: 'idle' };
  const candidates = await loadAnalysisCandidates(deps.prisma);
  let topics = 0;
  let added = 0;
  let removed = 0;
  let skipped = 0;
  for (const topicId of stale) {
    if (signal?.aborted) break;
    const r = await linkTopicAuto(deps.prisma, topicId, candidates, deps.clock.now(), limits);
    if (!r.ok) {
      // 경합·삭제 — 다음 틱이 다시 본다(autoLinkedAt이 안 바뀌어 stale로 남는다).
      if (r.code !== 'TOPIC_NOT_FOUND') skipped += 1;
      continue;
    }
    topics += 1;
    added += r.result.added;
    removed += r.result.removed;
  }
  if (topics === 0 && skipped === 0) return { outcome: 'idle' };
  // 로그에는 수치만(주제 제목·키워드는 사람이 쓴 글이라 남기지 않는다).
  deps.logger.info('주제에 분석 글을 자동 연결했다', { topics, added, removed, skipped });
  return { outcome: 'linked', topics, added, removed, skipped };
}
