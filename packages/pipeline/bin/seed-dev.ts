// 개발용 실행 목데이터. 화면(B2c)을 만들 때 DB에 실행이 하나도 없어 눈으로 볼 수 없던 것을 채운다.
// **Run·RunStep을 전부 지우고** 대표 상황 6개를 넣는다 — 개발 DB 전용(production 거부).
// 주제는 이미 적재된 QueueItem(주제_큐.md에서 온 것)에 붙인다. 없으면 주제도 만든다.
//   pnpm --filter @galley/pipeline seed:dev
// 주의: 워커가 돌고 있으면 "실행 중" 시드를 Mock으로 집어가 끝내 버린다 — 화면 작업 중엔 워커를 끈다.
import { prisma } from '../src/db.ts';
import { DEFAULT_MODEL_ID } from '../src/model/ModelRegistry.ts';
import { RUN_STATUS, STEP_ORDER, STEP_ORIGIN, STEP_STATUS } from '../src/run/stateMachine.ts';
import { topicSlug } from '../src/queue/topicSlug.ts';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-dev: production에서는 돌리지 않는다.');
  process.exit(1);
}

type StepName = (typeof STEP_ORDER)[number];
type StepSeed = {
  status?: string;
  origin?: string;
  sourceRunId?: string;
  errorCode?: string;
  errorMessage?: string;
  attemptCount?: number;
  withUsage?: boolean;
  startedAt?: Date;
  finishedAt?: Date;
};

const MODEL = DEFAULT_MODEL_ID;
const minutes = (n: number) => n * 60_000;
const now = Date.now();
const at = (minutesAgo: number) => new Date(now - minutes(minutesAgo));

/** 단계 6행. 성공 행에는 그럴듯한 토큰·비용·소요를 넣는다(썸네일 단계는 모델 없음). */
function steps(runId: string, seed: Partial<Record<StepName, StepSeed>>, base: Date) {
  return STEP_ORDER.map((name, order) => {
    const s = seed[name] ?? {};
    const status = s.status ?? STEP_STATUS.pending;
    const succeeded = status === STEP_STATUS.succeeded;
    const usesModel = name !== 'publishInfo';
    const startedAt =
      s.startedAt ?? (status === 'pending' ? null : new Date(base.getTime() + minutes(order * 3)));
    const finishedAt =
      s.finishedAt ??
      (succeeded || status === 'failed' ? new Date(base.getTime() + minutes(order * 3 + 2)) : null);
    const input = 3200 + order * 900;
    const output = 1400 + order * 300;
    return {
      runId,
      name,
      order,
      status,
      origin: s.origin ?? STEP_ORIGIN.fresh,
      sourceRunId: s.sourceRunId ?? null,
      errorCode: s.errorCode ?? null,
      errorMessage: s.errorMessage ?? null,
      attemptCount: s.attemptCount ?? (status === 'pending' ? 0 : 1),
      modelId: succeeded && usesModel ? MODEL : null,
      inputTokens: succeeded && usesModel ? input : null,
      outputTokens: succeeded && usesModel ? output : null,
      costUsd:
        succeeded && usesModel ? Number(((input * 5 + output * 25) / 1_000_000).toFixed(4)) : null,
      durationMs: succeeded ? 90_000 + order * 20_000 : status === 'failed' ? 600_000 : null,
      startedAt,
      finishedAt,
    };
  });
}

const ALL_OK: Partial<Record<StepName, StepSeed>> = Object.fromEntries(
  STEP_ORDER.map((n) => [n, { status: STEP_STATUS.succeeded }]),
);

async function pickTopics(count: number) {
  const existing = await prisma.queueItem.findMany({
    where: { status: { in: ['대기', '후보'] } },
    orderBy: [{ status: 'desc' }, { order: 'asc' }],
    take: count,
    select: { id: true, title: true },
  });
  if (existing.length >= count) return existing;
  const made = [];
  for (let i = existing.length; i < count; i += 1) {
    made.push(
      await prisma.queueItem.create({
        data: { title: `시드 주제 ${i + 1}`, order: 100 + i },
        select: { id: true, title: true },
      }),
    );
  }
  return [...existing, ...made];
}

async function main() {
  const deleted = await prisma.run.deleteMany();
  const [t1, t2, t3, t4, t5, t6] = await pickTopics(6);
  const runOf = (t: { id: string; title: string }) => ({
    topicId: t.id,
    topicSlug: topicSlug(t.title),
    topicTitle: t.title,
    modelId: MODEL,
  });

  // 1. 실행 중 — 근거 수집 끝, 본문 진행 중. 워커가 살아 있는 것처럼 heartbeat 최근.
  const running = await prisma.run.create({
    data: {
      ...runOf(t1!),
      status: RUN_STATUS.running,
      workerState: 'running',
      workerId: 'seed-worker',
      heartbeat: at(0),
      startedAt: at(6),
    },
  });
  await prisma.runStep.createMany({
    data: steps(
      running.id,
      { evidence: { status: STEP_STATUS.succeeded }, velog: { status: STEP_STATUS.running } },
      at(6),
    ),
  });

  // 2. 승인 대기 — 6단계 전부 성공. 첫 시도.
  const pending = await prisma.run.create({
    data: {
      ...runOf(t2!),
      status: RUN_STATUS.pendingApproval,
      workerState: 'queued',
      startedAt: at(90),
    },
  });
  await prisma.runStep.createMany({ data: steps(pending.id, ALL_OK, at(90)) });

  // 3. 실패 — 본문 단계가 3번 시도 뒤 타임아웃. 뒤 단계는 pending 그대로.
  const failed = await prisma.run.create({
    data: {
      ...runOf(t3!),
      status: RUN_STATUS.failed,
      workerState: 'queued',
      startedAt: at(60 * 26),
      finishedAt: at(60 * 25),
    },
  });
  await prisma.runStep.createMany({
    data: steps(
      failed.id,
      {
        evidence: { status: STEP_STATUS.succeeded },
        velog: {
          status: STEP_STATUS.failed,
          errorCode: 'STEP_TIMEOUT',
          errorMessage: '단계 제한 시간 10분을 넘겼습니다.',
          attemptCount: 3,
        },
      },
      at(60 * 26),
    ),
  });

  // 4. 수정 지시 → 재실행: 1차는 revised(종결), 2차는 근거 수집을 carried로 잇고 승인 대기.
  const firstAttempt = await prisma.run.create({
    data: {
      ...runOf(t4!),
      attempt: 1,
      status: RUN_STATUS.revised,
      workerState: 'queued',
      startedAt: at(60 * 50),
      finishedAt: at(60 * 47), // 수정 지시 시각 — 단계 생산 시각(아래)과 다르다
    },
  });
  await prisma.runStep.createMany({ data: steps(firstAttempt.id, ALL_OK, at(60 * 50)) });
  const secondAttempt = await prisma.run.create({
    data: {
      ...runOf(t4!),
      attempt: 2,
      status: RUN_STATUS.pendingApproval,
      workerState: 'queued',
      instruction: '어투가 딱딱하다. 독자에게 말하듯 부드럽게, 문단 첫 문장은 결론부터.',
      startStep: 'velog',
      startedAt: at(60 * 47),
    },
  });
  await prisma.runStep.createMany({
    data: steps(
      secondAttempt.id,
      {
        ...ALL_OK,
        evidence: {
          status: STEP_STATUS.succeeded,
          origin: STEP_ORIGIN.carried,
          sourceRunId: firstAttempt.id,
          startedAt: undefined,
          finishedAt: undefined,
        },
      },
      at(60 * 47),
    ).map((s) =>
      s.origin === STEP_ORIGIN.carried
        ? {
            ...s,
            startedAt: null,
            finishedAt: null,
            modelId: null,
            inputTokens: null,
            outputTokens: null,
            costUsd: null,
            durationMs: null,
          }
        : s,
    ),
  });

  // 5. 완료(승인됨) — 이틀 전.
  const done = await prisma.run.create({
    data: {
      ...runOf(t5!),
      status: RUN_STATUS.done,
      workerState: 'queued',
      startedAt: at(60 * 49),
      finishedAt: at(60 * 48),
    },
  });
  await prisma.runStep.createMany({ data: steps(done.id, ALL_OK, at(60 * 49)) });

  // 6. 중단 — 워커가 죽어 heartbeat가 오래됨(interrupted). 화면상 "실행 중" 탭에 남는다.
  const interrupted = await prisma.run.create({
    data: {
      ...runOf(t6!),
      status: RUN_STATUS.running,
      workerState: 'interrupted',
      heartbeat: at(45),
      startedAt: at(70),
    },
  });
  await prisma.runStep.createMany({
    data: steps(
      interrupted.id,
      {
        evidence: { status: STEP_STATUS.succeeded },
        velog: { status: STEP_STATUS.succeeded },
        verify: { status: STEP_STATUS.succeeded },
      },
      at(70),
    ),
  });

  console.log(`seed-dev: 기존 실행 ${deleted.count}건 삭제 → 실행 7건·단계 42행 추가`);
  console.log(
    [
      ['실행 중', running.id],
      ['승인 대기', pending.id],
      ['실패', failed.id],
      ['수정 지시(1차)', firstAttempt.id],
      ['재실행 승인 대기(2차, carried)', secondAttempt.id],
      ['완료', done.id],
      ['중단(interrupted)', interrupted.id],
    ]
      .map(([label, id]) => `  ${label}: ?id=${id}`)
      .join('\n'),
  );
}

main()
  .catch((error) => {
    console.error('seed-dev 실패:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
