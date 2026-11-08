// 근거 수집 단계(evidence) — linked: 주제에 연결된 분석 글(TopicAnalysisLink)의 포인터를 따라 원본 조각을 읽는다(BE8).
// discovered: 연결에 없던 분석 글을 주제 키워드·기간 점수로 골라(`discoverAnalyses`, 모델 없음) 같은 방식으로 읽는다(BE9).
// 산출물: snippet 포함 번들은 EvidenceStore(DATA_DIR)에 쓰고, 워커에 돌려주는 artifacts에는 **포인터 사본만**
// (`evidence.json` — B3a가 posts/<슬러그>/에 쓴다). 회사 코드 조각은 DATA_DIR 밖으로 나가지 않는다(CLAUDE.md §5).
// 단계 라우팅(createStepRunner)은 BS5 — 여기는 evidence 단계만 아는 StepRunner다.
import type { PrismaClient } from '@prisma/client';
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import type {
  EvidenceAnalysis,
  EvidenceBundle,
  EvidenceItem,
  EvidenceSource,
} from '../evidence/bundle.ts';
import { stripSnippets } from '../evidence/bundle.ts';
import { discoverAnalyses, type DiscoverRerank } from '../evidence/discover.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import { EVIDENCE_LIMITS, type EvidenceLimits } from '../evidence/limits.ts';
import { readPointerSnippet, type CommitMetaResolver } from '../evidence/readSnippet.ts';
import { gitCommitMeta } from '../index/gitRead.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import { LINK_SOURCE, isAnalysisKind, parsePointers, parseStringArray } from '../index/schema.ts';
import { loadAnalysisCandidates } from '../link/autoLink.ts';
import type { Clock } from '../worker/WorkerDeps.ts';

export interface EvidenceStepDeps {
  prisma: PrismaClient;
  store: EvidenceStore;
  /** null = 설정 없음. readOnly 리포의 포인터가 하나라도 있으면 거부한다(회사 코드 조각을 필터 없이 저장하지 않는다). */
  redactConfig: RedactConfig | null;
  clock: Clock;
  limits?: EvidenceLimits;
  /** discovered 재순위 훅(상한 전). 기본 없음 — 모델 재순위는 Phase 2. */
  rerankDiscovered?: DiscoverRerank;
}

/** 워커에 돌려주는 산출물 이름 — posts/<슬러그>/evidence.json. */
export const EVIDENCE_ARTIFACT = 'evidence.json';

interface PlannedPointer {
  analysisId: string;
  repoPath: string;
  repoReadOnly: boolean;
  pointerIndex: number;
  source: EvidenceSource;
}

/** 분석 글 한 편의 포인터를 읽을 순서대로 — linked·discovered가 같은 모양으로 읽는다. */
interface AnalysisRow {
  id: string;
  kind: string;
  title: string;
  summary: string;
  pointers: string;
  repo: { path: string; readOnly: boolean };
}
const ANALYSIS_SELECT = {
  id: true,
  kind: true,
  title: true,
  summary: true,
  pointers: true,
  repo: { select: { path: true, readOnly: true } },
} as const;

function planAnalysis(
  analysis: AnalysisRow,
  source: EvidenceSource,
): { link: PlannedPointer; pointer: ReturnType<typeof parsePointers>[number] }[] {
  return parsePointers(analysis.pointers).map((pointer, pointerIndex) => ({
    link: {
      analysisId: analysis.id,
      repoPath: analysis.repo.path,
      repoReadOnly: analysis.repo.readOnly,
      pointerIndex,
      source,
    },
    pointer,
  }));
}

export function createEvidenceStepRunner(deps: EvidenceStepDeps): StepRunner {
  const limits = deps.limits ?? EVIDENCE_LIMITS;
  return {
    async run(ctx: StepContext): Promise<StepResult> {
      if (ctx.step !== 'evidence')
        throw new Error(`evidence 단계 러너에 ${ctx.step} 단계가 들어왔다 — 라우팅(BS5) 오류`);
      ctx.signal.throwIfAborted();

      // manual → auto 순(아래 filter로 정렬), 같은 소스 안에서는 만든 순. 사람이 고른 근거가 상한 안에 먼저 든다.
      // 소스 무관 전체를 읽는 이유: 연결된 글(앞으로 dismissed 포함)은 어느 소스든 discovered 탐색에서 뺀다.
      const links = await deps.prisma.topicAnalysisLink.findMany({
        where: { topicId: ctx.topic.id },
        orderBy: { createdAt: 'asc' },
        select: { source: true, analysis: { select: ANALYSIS_SELECT } },
      });
      const linkedAnalyses: AnalysisRow[] = [
        ...links.filter((l) => l.source === LINK_SOURCE.manual),
        ...links.filter((l) => l.source === LINK_SOURCE.auto),
      ].map((l) => l.analysis);
      const planned = linkedAnalyses.flatMap((a) => planAnalysis(a, 'linked'));

      // discovered — 주제 힌트(큐 적재가 채운 컬럼)로 연결에 없던 글을 점수 순으로 고른다. 힌트 키워드가 없으면 탐색하지 않는다.
      const discoveredAnalyses = await selectDiscovered(
        deps,
        ctx.topic.id,
        new Set(links.map((l) => l.analysis.id)),
        limits,
      );
      planned.push(...discoveredAnalyses.flatMap((a) => planAnalysis(a, 'discovered')));

      if (deps.redactConfig === null && planned.some((p) => p.link.repoReadOnly))
        throw new StepFailure(
          'EVIDENCE_REDACT_CONFIG_REQUIRED',
          '읽기 전용 리포의 근거를 읽으려면 식별 정보 필터 설정(.galley/redact.json)이 필요합니다.',
          false,
        );

      // 같은 커밋을 여러 포인터가 가리킨다(area 포인터는 전부 HEAD) — 커밋 메타는 리포·커밋별로 한 번만 읽는다.
      const metaCache = new Map<string, ReturnType<typeof gitCommitMeta>>();
      const resolveMeta: CommitMetaResolver = (repoPath, commit) => {
        const key = `${repoPath}\0${commit}`;
        let pending = metaCache.get(key);
        if (pending === undefined) {
          pending = gitCommitMeta(repoPath, commit);
          metaCache.set(key, pending);
        }
        return pending;
      };

      const items: EvidenceItem[] = [];
      let unreadable = 0;
      const seen = new Set<string>();
      // 상한은 소스별 **담긴 항목** 기준 — 중복·못 읽는 포인터가 예산을 먹지 않는다. linked 예산이 차도 discovered는 읽는다.
      const budget: Record<EvidenceSource, number> = {
        linked: limits.maxLinked,
        discovered: limits.maxDiscoveredItems,
      };
      const count: Record<EvidenceSource, number> = { linked: 0, discovered: 0 };
      for (const { link, pointer } of planned) {
        if (count[link.source] >= budget[link.source]) continue;
        ctx.signal.throwIfAborted();
        const key = `${pointer.commit}:${pointer.path}:${pointer.lineStart ?? ''}:${pointer.lineEnd ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const read = await readPointerSnippet(
          link.repoPath,
          pointer,
          deps.redactConfig,
          limits,
          resolveMeta,
        );
        if (!read.ok) {
          // 리포 수준 실패(경로가 옮겨짐·git 없음)는 포인터 하나의 문제가 아니다 — 근거 0건으로 "성공"하지 않고 단계를 실패시킨다.
          if (read.code === 'NOT_A_GIT_REPO' || read.code === 'GIT_COMMAND_FAILED')
            throw new StepFailure(
              'EVIDENCE_REPO_UNAVAILABLE',
              '연결된 리포를 읽을 수 없습니다(경로가 바뀌었거나 git 리포가 아닙니다).',
              false,
            );
          unreadable += 1;
          continue;
        }
        items.push({
          analysisId: link.analysisId,
          commit: pointer.commit,
          path: pointer.path,
          lineRange: read.value.lineRange,
          date: read.value.date,
          ...(read.value.note !== undefined ? { note: read.value.note } : {}),
          source: link.source,
          redacted: read.value.redacted,
          truncated: read.value.truncated,
          snippet: read.value.snippet,
        });
        count[link.source] += 1;
      }

      // 항목이 실제로 담긴 글의 제목·요약만(인덱싱 때 redact된 값) — 본문 단계 입력의 "요약". linked 글 → discovered 글 순.
      const usedAnalysisIds = new Set(items.map((i) => i.analysisId));
      const analyses: EvidenceAnalysis[] = [];
      for (const a of [...linkedAnalyses, ...discoveredAnalyses]) {
        if (!usedAnalysisIds.has(a.id) || analyses.some((x) => x.id === a.id)) continue;
        if (!isAnalysisKind(a.kind)) continue;
        analyses.push({ id: a.id, kind: a.kind, title: a.title, summary: a.summary });
      }
      const bundle: EvidenceBundle = {
        version: 1,
        runId: ctx.runId,
        topicId: ctx.topic.id,
        topicSlug: ctx.topic.slug,
        collectedAt: deps.clock.now().toISOString(),
        items,
        analyses,
        unreadable,
        filtered: deps.redactConfig !== null,
      };
      ctx.signal.throwIfAborted();
      try {
        await deps.store.write(bundle);
      } catch (error) {
        // fs 오류 메시지에는 DATA_DIR 절대경로가 들어간다 — 행에는 코드와 한 줄만(error-handling.md), 원인은 cause로.
        throw new StepFailure(
          'EVIDENCE_STORE_WRITE_FAILED',
          '근거 번들을 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
          false,
          { cause: error },
        );
      }
      return {
        artifacts: { [EVIDENCE_ARTIFACT]: JSON.stringify(stripSnippets(bundle), null, 2) },
      };
    },
    async discard(ctx) {
      await deps.store.remove(ctx.topic.slug, ctx.runId);
    },
  };
}

/**
 * discovered로 읽을 분석 글(점수 순). 주제 힌트는 `QueueItem`의 repoNames·keywords·period(BE6이 채움). 후보는 자동 연결과
 * 같은 `loadAnalysisCandidates`(전체 인덱스) — 자동 연결 뒤 새로 인덱싱된 글, 상한에 밀린 글, 기간이 조금 비켜난 글이 여기서 잡힌다.
 */
async function selectDiscovered(
  deps: EvidenceStepDeps,
  topicId: string,
  exclude: ReadonlySet<string>,
  limits: EvidenceLimits,
): Promise<AnalysisRow[]> {
  const hints = await deps.prisma.queueItem.findUnique({
    where: { id: topicId },
    select: { repoNames: true, keywords: true, period: true },
  });
  if (hints === null) return [];
  const keywords = parseStringArray(hints.keywords);
  if (keywords.length === 0) return [];
  const ranked = discoverAnalyses(
    { repoNames: parseStringArray(hints.repoNames), keywords, period: hints.period },
    await loadAnalysisCandidates(deps.prisma),
    { exclude, limits, rerank: deps.rerankDiscovered },
  );
  if (ranked.length === 0) return [];
  const rows = await deps.prisma.repoAnalysis.findMany({
    where: { id: { in: ranked.map((r) => r.id) } },
    select: ANALYSIS_SELECT,
  });
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  // 점수 순을 유지한다(findMany는 순서를 보장하지 않는다). 그 사이 지워진 글은 건너뛴다.
  return ranked.flatMap((r) => {
    const row = byId.get(r.id);
    return row === undefined ? [] : [row];
  });
}
