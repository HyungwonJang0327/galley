// 인덱서 배치 실행 제어(순수) — 계획된 키 목록에서 "이번에 돌릴 것"을 고른다. area·change 인덱서가 같은 규칙을 쓴다.
// 실행자(IndexJob 틱)가 배치 하나씩 돌리며 재개·증분·중단을 다루는 근거: decisions/evidence-collection.md (BE5).
export interface ExecutionOptions {
  /** 이미 끝난 키(재개). 모델을 부르지 않는다. */
  skipKeys?: readonly string[];
  /** 이 키까지(포함) 끝났다고 보고 그 다음부터 돈다 — IndexJob.progressCursor. 목록에 없으면 처음부터. */
  resumeAfterKey?: string;
  /** 증분에서 입력이 바뀌지 않은 키 — 돌리지 않고 기존 글을 둔다. */
  unchangedKeys?: ReadonlySet<string>;
  /** 이번 호출에서 돌릴 최대 배치 수(실행자가 틱마다 하나씩). 없으면 전부. */
  maxBatches?: number;
}

export interface ExecutionPlan {
  /** 돌릴 키(계획 순서). */
  toRun: string[];
  /** skipKeys·resumeAfterKey로 건너뛴 수. */
  resumedPast: number;
  /** unchangedKeys로 건너뛴 수. */
  unchanged: number;
  /** maxBatches에 걸려 이번에 못 돈 수(다음 틱 몫). */
  remaining: number;
}

export function planExecution(keys: readonly string[], options: ExecutionOptions): ExecutionPlan {
  const skip = new Set(options.skipKeys ?? []);
  const cursor = options.resumeAfterKey;
  let resuming = cursor !== undefined && keys.includes(cursor);
  const max = options.maxBatches ?? Number.POSITIVE_INFINITY;
  const plan: ExecutionPlan = { toRun: [], resumedPast: 0, unchanged: 0, remaining: 0 };
  for (const key of keys) {
    if (resuming) {
      plan.resumedPast += 1;
      if (key === cursor) resuming = false;
      continue;
    }
    if (skip.has(key)) {
      plan.resumedPast += 1;
      continue;
    }
    if (options.unchangedKeys?.has(key)) {
      plan.unchanged += 1;
      continue;
    }
    if (plan.toRun.length >= max) {
      plan.remaining += 1;
      continue;
    }
    plan.toRun.push(key);
  }
  return plan;
}
