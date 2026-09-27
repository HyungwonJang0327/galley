// 승인 = Run을 done으로 끝내면서 **발행 준비를 마친다**(B3a, 2026-09-26 사용자 결정 "승인 시 복사"): DATA_DIR의 최신 산출물(썸네일 포함 7개)을
// posts/<슬러그>/로 복사하고, 주제를 큐 파일의 완료 섹션으로 옮기고(completeTopic), Run을 done으로. posts에는 승인본만 남는다
// (Run별 이력은 DATA_DIR — decisions/run-execution-model.md). 공개 발행은 여기서 일어나지 않는다(publish-gate).
//
// 순서: 읽기·검증(부작용 없음) → posts 쓰기 → DB 트랜잭션(QueueItem·Run 갱신이 성공한 뒤 **그 안에서** 큐 파일 쓰기) →
// (재승인이고 글 제목이 바뀌었으면) 직전 승인 파일을 DATA_DIR로 옮기기 → 재적재. 옮기기는 **승인이 확정된 뒤**다 — 트랜잭션이
// 실패하면 옛 승인본이 posts에 그대로 남는다(decisions/topic-slug.md 규칙 4, TS4 리뷰 M1).
// 앞에서 실패하면 뒤는 하지 않고 값으로 돌려준다(Run은 승인 대기로 남는다). 되돌릴 수 없는 큐 파일 쓰기를 맨 마지막에 두어
// 파일 쓰기 실패·롤백(그새 수정 지시)이면 DB가 같이 되돌아간다(리뷰 M1) — 남는 창은 "파일을 쓴 뒤 커밋 실패"뿐이다. posts를
// 쓴 뒤 실패하면 폴더가 남는데, DB에 승인된 Run이 없어 다음 승인이 POSTS_DIR_EXISTS로 거절된다 — 문구가 폴더를 지우라고
// 안내한다(마커 파일을 두지 않는 대가, 사용자 결정). 커밋 뒤 재적재 실패는 승인 실패가 아니다(다음 요청이 다시 적재한다).
import type { PrismaClient } from '@prisma/client';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import { stripSnippets, type EvidenceBundle, type EvidencePointers } from '../evidence/bundle.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import type { ReplacedStore } from '../artifacts/ReplacedStore.ts';
import type { PostsWriter } from '../publish/PostsWriter.ts';
import { completeTopic, completedTitle } from '../queue/completeQueue.ts';
import { importQueueFromFile } from '../queue/importQueue.ts';
import { normalizeTopicTitle, trailingUrl } from '../queue/normalizeTitle.ts';
import { parseQueue, serializeQueue, type QueueStatus } from '../queue/queueFile.ts';
import type { Storage } from '../storage/Storage.ts';
import { LINKEDIN_ARTIFACT } from '../steps/linkedinStep.ts';
import { parsePublishTitle } from '../steps/publishInfo.ts';
import { PUBLISH_ARTIFACT, THUMBNAIL_ARTIFACT } from '../steps/publishInfoStep.ts';
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
  /** DATA_DIR — 재승인이 치운 옛 승인본을 두는 자리(지우지 않고 옮긴다). */
  replaced: ReplacedStore;
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
  | {
      ok: true;
      run: RunSummary;
      postsDir: string;
      files: string[];
      /** 재승인에서 글 제목이 바뀌어 DATA_DIR로 옮긴 직전 승인 파일(없으면 빈 배열)과 옮긴 폴더. */
      replaced: string[];
      replacedDir?: string;
      /** 옮기지 못해 posts 폴더에 남은 옛 이름(폴더가 섞여 있다 — 사람이 정리). */
      leftover: string[];
    }
  | { ok: false; code: ApprovePublishFailure; detail?: string };

const ACTIVE_SECTIONS: readonly QueueStatus[] = ['대기', '후보', '보류'];

/**
 * posts/<슬러그>/evidence.json 내용 — **포인터만**(CLAUDE.md §5). 조각(snippet)뿐 아니라 분석 글 요약(`analyses`)도 뺀다 —
 * 요약은 포인터가 아니고 DATA_DIR 원본에 남는다(리뷰 M2, 사용자 결정). `## 근거` 목록은 요약을 쓰지 않는다.
 */
export function toPostsEvidence(bundle: EvidenceBundle): Omit<EvidencePointers, 'analyses'> {
  const { analyses: _analyses, ...pointers } = stripSnippets(bundle);
  void _analyses;
  return pointers;
}

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
  // 썸네일은 발행정보 단계가 같이 만든다(B3b) — 그 전에 돈 Run은 없어서 발행정보 단계부터 다시 돌아야 한다.
  const thumbnail = await deps.artifacts.readBytes(
    slug,
    producer('publishInfo'),
    THUMBNAIL_ARTIFACT,
  );
  if (!thumbnail.ok) return { ok: false, code: 'ARTIFACT_MISSING', detail: THUMBNAIL_ARTIFACT };

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
  // 되돌려 다시 쓴 주제의 줄 끝 URL(발행한 벨로그 링크)은 새 완료 줄이 이어받는다 — 시리즈 다음 편의 이전 편 링크.
  const url = trailingUrl(section[index]!.title);
  const completion = {
    articleTitle,
    slug,
    completedOn: localDate(now),
    ...(url === undefined ? {} : { url }),
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
  const priorApproved = await deps.prisma.run.findFirst({
    where: { topicId: run.topicId, topicSlug: slug, status: RUN_STATUS.done, id: { not: run.id } },
    orderBy: { attempt: 'desc' },
    select: {
      id: true,
      steps: { where: { name: 'publishInfo' }, select: { origin: true, sourceRunId: true } },
    },
  });
  // 직전 승인의 글 제목 — 그 Run의 발행정보(DATA_DIR, carried면 출처 Run)에서 읽는다(부작용 없음). 못 읽으면 옛 파일은
  // 그대로 둔다. **직전 승인 하나만** 본다(결정 문서 그대로 — 치우는 범위를 넓히지 않는다).
  let previousTitle: string | undefined;
  if (priorApproved) {
    const step = priorApproved.steps[0];
    const priorProducer =
      step?.origin === STEP_ORIGIN.carried && step.sourceRunId
        ? step.sourceRunId
        : priorApproved.id;
    const text = await deps.artifacts.read(slug, priorProducer, PUBLISH_ARTIFACT);
    if (text.ok) previousTitle = parsePublishTitle(text.text);
  }
  const written = await deps.posts.write({
    slug,
    articleTitle,
    files: {
      velog: texts.velog!,
      linkedin: texts.linkedin!,
      zenn: texts.zenn!,
      publishInfo: texts.publishInfo!,
      thumbnail: thumbnail.bytes,
      evidence: `${JSON.stringify(toPostsEvidence(bundle.bundle), null, 2)}\n`,
      verification: texts.verification!,
    },
    overwrite: priorApproved !== null,
  });
  if (!written.ok)
    return written.code === 'POSTS_DIR_EXISTS'
      ? { ok: false, code: written.code, detail: written.dir }
      : { ok: false, code: written.code, detail: written.detail };

  // 5. DB(QueueItem을 완료 줄과 같은 키·상태로 먼저 맞춘다 — 재적재에서 행이 갈라지지 않게, BX4 M2) + Run done, 둘 다 성공한
  //    뒤 같은 트랜잭션 안에서 큐 파일(완료 줄). 파일 쓰기가 던지면 DB는 되돌아간다.
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
      await deps.storage.writeQueueFile(serializeQueue(moved.queue));
    });
  } catch (error) {
    if (error instanceof Rollback) return { ok: false, code: 'NOT_PENDING_APPROVAL' };
    throw error;
  }
  // 6. 승인이 확정됐다 — 글 제목이 바뀐 재승인이면 직전 승인이 쓴 5개 이름을 DATA_DIR로 옮긴다. 실패해도 승인은 끝났다
  //    (못 옮긴 이름은 leftover로 돌려준다).
  const retired =
    previousTitle === undefined
      ? { moved: [], leftover: [] }
      : await retirePrevious(deps, { slug, runId: run.id, previousTitle, keep: written.files });

  // 재적재는 승인의 일부가 아니다 — 여기서 실패해도 승인·posts·큐 이동은 끝났고 다음 페이지 요청이 다시 적재한다(리뷰 M5).
  try {
    await importQueueFromFile({ storage: deps.storage, prisma: deps.prisma });
  } catch {
    /* 다음 적재가 같은 결과를 낸다 */
  }

  const summary = await deps.prisma.run.findUniqueOrThrow({
    where: { id: run.id },
    select: RUN_SUMMARY_SELECT,
  });
  return {
    ok: true,
    run: summary,
    postsDir: written.dir,
    files: written.files,
    replaced: retired.moved,
    ...(retired.moved.length === 0 ? {} : { replacedDir: deps.replaced.dirFor(slug, run.id) }),
    leftover: retired.leftover,
  };
}

/** 옮기기는 승인 뒤 정리라 던지지 않는다 — 예외는 "아무것도 못 옮김"으로 본다(옛 파일은 posts에 남는다). */
async function retirePrevious(
  deps: ApprovePublishDeps,
  input: { slug: string; runId: string; previousTitle: string; keep: readonly string[] },
): Promise<{ moved: string[]; leftover: string[] }> {
  try {
    return await deps.posts.retire({
      slug: input.slug,
      previousTitle: input.previousTitle,
      keep: input.keep,
      into: deps.replaced.dirFor(input.slug, input.runId),
    });
  } catch {
    return { moved: [], leftover: [] };
  }
}
