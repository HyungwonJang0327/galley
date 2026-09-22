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

/**
 * 주제 하나의 auto 연결을 계산 결과와 같게 맞춘다. 주제가 없으면 null.
 * 힌트가 하나도 없는 주제는 auto 연결이 전부 지워진다(잘못 붙은 것을 남기지 않는다).
 */
export async function linkTopicAuto(
  prisma: PrismaClient,
  topicId: string,
  candidates: readonly AnalysisCandidate[],
  now: Date,
  limits: AutoLinkLimits = AUTO_LINK_LIMITS,
): Promise<AutoLinkResult | null> {
  const topic = await prisma.queueItem.findUnique({
    where: { id: topicId },
    select: { repoNames: true, keywords: true, period: true },
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
  const existing = await prisma.topicAnalysisLink.findMany({
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

  await prisma.$transaction(async (tx) => {
    if (remove.length > 0)
      await tx.topicAnalysisLink.deleteMany({
        where: { topicId, source: LINK_SOURCE.auto, analysisId: { in: remove } },
      });
    if (add.length > 0)
      await tx.topicAnalysisLink.createMany({
        data: add.map((analysisId) => ({ topicId, analysisId, source: LINK_SOURCE.auto })),
      });
    // autoLinkedAt만 바꾼다 — @updatedAt이 함께 움직여도 "autoLinkedAt < updatedAt"이 되지 않게 같은 시각을 쓴다.
    await tx.queueItem.update({
      where: { id: topicId },
      data: { autoLinkedAt: now, updatedAt: now },
    });
  });
  return { topicId, linked: desired.length, added: add.length, removed: remove.length, keptManual };
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
  /** 주제 몇 개를 다시 계산했다(연결 변화가 없어도 linked). */
  | { outcome: 'linked'; topics: number; added: number; removed: number };

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
  for (const topicId of stale) {
    if (signal?.aborted) break;
    const r = await linkTopicAuto(deps.prisma, topicId, candidates, deps.clock.now(), limits);
    if (r === null) continue;
    topics += 1;
    added += r.added;
    removed += r.removed;
  }
  if (topics === 0) return { outcome: 'idle' };
  // 로그에는 수치만(주제 제목·키워드는 사람이 쓴 글이라 남기지 않는다).
  deps.logger.info('주제에 분석 글을 자동 연결했다', { topics, added, removed });
  return { outcome: 'linked', topics, added, removed };
}
