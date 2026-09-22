// 근거 수집 단계(evidence) 1 — linked: 주제에 연결된 분석 글(TopicAnalysisLink)의 포인터를 따라 원본 조각을 읽는다.
// 모델 없음. 산출물: snippet 포함 번들은 EvidenceStore(DATA_DIR)에 쓰고, 워커에 돌려주는 artifacts에는 **포인터 사본만**
// (`evidence.json` — B3a가 posts/<슬러그>/에 쓴다). 회사 코드 조각은 DATA_DIR 밖으로 나가지 않는다(CLAUDE.md §5).
// discovered(추가 탐색)는 BE9. 단계 라우팅(createStepRunner)은 BS5 — 여기는 evidence 단계만 아는 StepRunner다.
import type { PrismaClient } from '@prisma/client';
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import type { EvidenceBundle, EvidenceItem } from '../evidence/bundle.ts';
import { stripSnippets } from '../evidence/bundle.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import { EVIDENCE_LIMITS, type EvidenceLimits } from '../evidence/limits.ts';
import { readPointerSnippet, type CommitMetaResolver } from '../evidence/readSnippet.ts';
import { gitCommitMeta } from '../index/gitRead.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import { LINK_SOURCE, parsePointers } from '../index/schema.ts';
import type { Clock } from '../worker/WorkerDeps.ts';

export interface EvidenceStepDeps {
  prisma: PrismaClient;
  store: EvidenceStore;
  /** null = 설정 없음. readOnly 리포의 포인터가 하나라도 있으면 거부한다(회사 코드 조각을 필터 없이 저장하지 않는다). */
  redactConfig: RedactConfig | null;
  clock: Clock;
  limits?: EvidenceLimits;
}

/** 워커에 돌려주는 산출물 이름 — posts/<슬러그>/evidence.json. */
export const EVIDENCE_ARTIFACT = 'evidence.json';

interface LinkedPointer {
  analysisId: string;
  repoPath: string;
  repoReadOnly: boolean;
  pointerIndex: number;
}

export function createEvidenceStepRunner(deps: EvidenceStepDeps): StepRunner {
  const limits = deps.limits ?? EVIDENCE_LIMITS;
  return {
    async run(ctx: StepContext): Promise<StepResult> {
      if (ctx.step !== 'evidence')
        throw new Error(`evidence 단계 러너에 ${ctx.step} 단계가 들어왔다 — 라우팅(BS5) 오류`);
      ctx.signal.throwIfAborted();

      // manual → auto 순(아래 filter로 정렬), 같은 소스 안에서는 만든 순. 사람이 고른 근거가 상한 안에 먼저 든다.
      const links = await deps.prisma.topicAnalysisLink.findMany({
        where: { topicId: ctx.topic.id, source: { in: [LINK_SOURCE.manual, LINK_SOURCE.auto] } },
        orderBy: { createdAt: 'asc' },
        select: {
          source: true,
          analysis: {
            select: { id: true, pointers: true, repo: { select: { path: true, readOnly: true } } },
          },
        },
      });
      const ordered = [
        ...links.filter((l) => l.source === LINK_SOURCE.manual),
        ...links.filter((l) => l.source === LINK_SOURCE.auto),
      ];
      const planned: { link: LinkedPointer; pointer: ReturnType<typeof parsePointers>[number] }[] =
        [];
      for (const l of ordered) {
        parsePointers(l.analysis.pointers).forEach((pointer, pointerIndex) => {
          planned.push({
            link: {
              analysisId: l.analysis.id,
              repoPath: l.analysis.repo.path,
              repoReadOnly: l.analysis.repo.readOnly,
              pointerIndex,
            },
            pointer,
          });
        });
      }
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
      for (const { link, pointer } of planned) {
        // 상한은 **담긴 항목** 기준 — 중복·못 읽는 포인터가 예산을 먹지 않는다.
        if (items.length >= limits.maxLinked) break;
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
          source: 'linked',
          redacted: read.value.redacted,
          truncated: read.value.truncated,
          snippet: read.value.snippet,
        });
      }

      const bundle: EvidenceBundle = {
        version: 1,
        runId: ctx.runId,
        topicId: ctx.topic.id,
        topicSlug: ctx.topic.slug,
        collectedAt: deps.clock.now().toISOString(),
        items,
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
