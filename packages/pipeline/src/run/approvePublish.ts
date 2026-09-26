// 승인 = Run을 done으로 끝내면서 **발행 준비를 마친다**(B3a, 2026-09-26 사용자 결정 "승인 시 복사"): DATA_DIR의 최신 산출물을
// posts/<슬러그>/로 복사하고, 주제를 큐 파일의 완료 섹션으로 옮기고(completeTopic), Run을 done으로. posts에는 승인본만 남는다
// (Run별 이력은 DATA_DIR — decisions/run-execution-model.md). 공개 발행은 여기서 일어나지 않는다(publish-gate).
//
// 순서: 읽기·검증(부작용 없음) → posts 쓰기 → 큐 파일 쓰기 → DB(QueueItem·Run 한 트랜잭션) → 재적재. 앞에서 실패하면
// 뒤는 하지 않고 값으로 돌려준다(Run은 승인 대기로 남는다). posts를 쓴 뒤 실패하면 폴더가 남는데, DB에 승인된 Run이 없어
// 다음 승인이 POSTS_DIR_EXISTS로 거절된다 — 문구가 폴더를 지우라고 안내한다(마커 파일을 두지 않는 대가, 사용자 결정).
import type { PrismaClient } from '@prisma/client';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import { stripSnippets } from '../evidence/bundle.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import type { PostsWriter } from '../publish/PostsWriter.ts';
import { completeTopic, completedTitle } from '../queue/completeQueue.ts';
import { importQueueFromFile } from '../queue/importQueue.ts';
import { normalizeTopicTitle } from '../queue/normalizeTitle.ts';
import { parseQueue, serializeQueue, type QueueStatus } from '../queue/queueFile.ts';
import type { Storage } from '../storage/Storage.ts';
import { LINKEDIN_ARTIFACT } from '../steps/linkedinStep.ts';
import { parsePublishTitle } from '../steps/publishInfo.ts';
import { PUBLISH_ARTIFACT } from '../steps/publishInfoStep.ts';
import { VELOG_ARTIFACT } from '../steps/velogStep.ts';
import { VERIFICATION_ARTIFACT } from '../steps/verifyStep.ts';
import { ZENN_ARTIFACT } from '../steps/zennStep.ts';
import { RUN_SUMMARY_SELECT, type ApproveRunFailure } from './runCommands.ts';
import type { RunSummary } from './runQueries.ts';
import { RUN_STATUS, STEP_ORIGIN, applyCommand, isRunStatus, isStepName } from './stateMachine.ts';
import type { StepName } from './stateMachine.ts';

export interface ApprovePublishDeps {
  prisma: PrismaClient;
  /** DATA_DIR — 단계 산출물·근거 번들. */
  artifacts: ArtifactStore;
  evidence: EvidenceStore;
  /** BLOG_DIR — posts 폴더와 주제_큐.md. */
  posts: PostsWriter;
  storage: Storage;
  clock?: { now(): Date };
}

export type ApprovePublishFailure =
  | ApproveRunFailure
  /** 앞 단계 산출물이 DATA_DIR에 없음(`detail` = 파일명). B3a 전에 돈 Run·DATA_DIR을 옮긴 뒤가 여기 온다 — 다시 실행해야 한다. */
  | 'ARTIFACT_MISSING'
  /** 발행정보 첫 줄에서 글 제목을 못 읽음(옛 Mock 산출물 등) — 발행정보 단계부터 다시. */
  | 'PUBLISH_TITLE_MISSING'
  /** 주제가 큐 파일의 대기·후보·보류 어디에도 없음(이미 완료·파일에서 삭제). */
  | 'TOPIC_NOT_IN_QUEUE'
  /** 완료 줄을 만들 수 없는 값(글 제목·슬러그 형식) — completeTopic. */
  | 'INVALID_COMPLETION'
  | 'POSTS_DIR_EXISTS'
  | 'POSTS_WRITE_FAILED';

export type ApprovePublishResult =
  | { ok: true; run: RunSummary; postsDir: string; files: string[] }
  | { ok: false; code: ApprovePublishFailure; detail?: string };

const ACTIVE_SECTIONS: readonly QueueStatus[] = ['대기', '후보', '보류'];

/** 트랜잭션 안의 값-실패를 던져 되돌리고 밖에서 값으로 바꾼다. */
class Rollback extends Error {
  constructor() {
    super('NOT_PENDING_APPROVAL');
    this.name = 'Rollback';
  }
}

/** 로컬 시간대 기준 `YYYY-MM-DD`(TZ는 .env — 완료 줄 날짜는 사람이 보는 날짜다). */
export function localDate(now: Date): string {
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export async function approveAndPublishRun(
  deps: ApprovePublishDeps,
  runId: string,
): Promise<ApprovePublishResult> {
  const now = deps.clock?.now() ?? new Date();

  // 1. Run·주제·단계 출처 — 상태 판정은 상태 머신.
  const run = await deps.prisma.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      topicId: true,
      topicSlug: true,
      steps: { select: { name: true, origin: true, sourceRunId: true } },
      topic: { select: { id: true, title: true, status: true } },
    },
  });
  if (!run) return { ok: false, code: 'RUN_NOT_FOUND' };
  if (!isRunStatus(run.status)) return { ok: false, code: 'NOT_PENDING_APPROVAL' };
  const decision = applyCommand(run.status, { type: 'approve' });
  if (!decision.ok) return decision;

  const sources: Partial<Record<StepName, string>> = {};
  for (const step of run.steps)
    if (isStepName(step.name) && step.origin === STEP_ORIGIN.carried && step.sourceRunId)
      sources[step.name] = step.sourceRunId;
  const producer = (step: StepName): string => sources[step] ?? run.id;
  const slug = run.topicSlug;

  // 2. 산출물 읽기(DATA_DIR) — 하나라도 없으면 승인하지 않는다.
  const read = async (step: StepName, name: string): Promise<string | undefined> => {
    const result = await deps.artifacts.read(slug, producer(step), name);
    return result.ok ? result.text : undefined;
  };
  const texts = {
    velog: await read('velog', VELOG_ARTIFACT),
    linkedin: await read('linkedin', LINKEDIN_ARTIFACT),
    zenn: await read('zenn', ZENN_ARTIFACT),
    verification: await read('verify', VERIFICATION_ARTIFACT),
    publishInfo: await read('publishInfo', PUBLISH_ARTIFACT),
  };
  for (const [key, name] of [
    ['velog', VELOG_ARTIFACT],
    ['linkedin', LINKEDIN_ARTIFACT],
    ['zenn', ZENN_ARTIFACT],
    ['verification', VERIFICATION_ARTIFACT],
    ['publishInfo', PUBLISH_ARTIFACT],
  ] as const)
    if (texts[key] === undefined) return { ok: false, code: 'ARTIFACT_MISSING', detail: name };
  const bundle = await deps.evidence.read(slug, producer('evidence'));
  if (!bundle.ok) return { ok: false, code: 'ARTIFACT_MISSING', detail: 'evidence' };

  const articleTitle = parsePublishTitle(texts.publishInfo!);
  if (articleTitle === undefined) return { ok: false, code: 'PUBLISH_TITLE_MISSING' };

  // 3. 큐 완료 이동을 메모리에서 먼저 — 파일이 그새 바뀌었거나 주제가 없으면 아무것도 쓰지 않는다.
  const parsed = parseQueue(await deps.storage.readQueueFile());
  const from = run.topic.status;
  if (!ACTIVE_SECTIONS.includes(from as QueueStatus))
    return { ok: false, code: 'TOPIC_NOT_IN_QUEUE', detail: from };
  const section = parsed.sections[from as QueueStatus];
  const key = normalizeTopicTitle(run.topic.title);
  const index = section.findIndex((topic) => normalizeTopicTitle(topic.title) === key);
  if (index === -1) return { ok: false, code: 'TOPIC_NOT_IN_QUEUE', detail: from };
  const completion = {
    articleTitle,
    slug,
    completedOn: localDate(now),
  };
  const moved = completeTopic(parsed, {
    from: from as Exclude<QueueStatus, '완료'>,
    index,
    title: section[index]!.title,
    ...completion,
  });
  if (!moved.ok)
    return { ok: false, code: moved.code === 'TOPIC_MISMATCH' ? 'TOPIC_NOT_IN_QUEUE' : moved.code };

  // 4. posts 쓰기 — 폴더가 있으면 Galley가 쓴 것(이 주제의 승인된 Run이 같은 슬러그에 있음)일 때만 덮어쓴다.
  const priorApproved = await deps.prisma.run.count({
    where: { topicId: run.topicId, topicSlug: slug, status: RUN_STATUS.done, id: { not: run.id } },
  });
  const written = await deps.posts.write({
    slug,
    articleTitle,
    files: {
      velog: texts.velog!,
      linkedin: texts.linkedin!,
      zenn: texts.zenn!,
      publishInfo: texts.publishInfo!,
      evidence: `${JSON.stringify(stripSnippets(bundle.bundle), null, 2)}\n`,
      verification: texts.verification!,
    },
    overwrite: priorApproved > 0,
  });
  if (!written.ok)
    return written.code === 'POSTS_DIR_EXISTS'
      ? { ok: false, code: written.code, detail: written.dir }
      : { ok: false, code: written.code, detail: written.detail };

  // 5. 큐 파일(완료 줄) → DB(QueueItem을 완료 줄과 같은 키·상태로 먼저 맞춘다 — 재적재에서 행이 갈라지지 않게, BX4 M2) → Run done.
  await deps.storage.writeQueueFile(serializeQueue(moved.queue));
  try {
    await deps.prisma.$transaction(async (tx) => {
      await tx.queueItem.update({
        where: { id: run.topic.id },
        data: {
          title: completedTitle(completion),
          status: '완료',
          order: moved.queue.sections.완료.length - 1,
          category: null,
          completedOn: completion.completedOn,
        },
      });
      // 읽은 상태를 조건에 — 그새 수정 지시가 끼어들었으면 0건이고, 주제 갱신까지 되돌린다(approveRun과 같은 규칙).
      const { count } = await tx.run.updateMany({
        where: { id: run.id, status: run.status },
        data: { status: decision.status, finishedAt: now, workerId: null },
      });
      if (count === 0) throw new Rollback();
    });
  } catch (error) {
    if (error instanceof Rollback) return { ok: false, code: 'NOT_PENDING_APPROVAL' };
    throw error;
  }
  await importQueueFromFile({ storage: deps.storage, prisma: deps.prisma });

  const summary = await deps.prisma.run.findUniqueOrThrow({
    where: { id: run.id },
    select: RUN_SUMMARY_SELECT,
  });
  return { ok: true, run: summary, postsDir: written.dir, files: written.files };
}
