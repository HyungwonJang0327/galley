// 모델 id → 화면 label, 비용(USD) 표기(서버 전용 — 레지스트리는 pipeline 런타임 값).
// 모델 표기는 레지스트리만 안다(decisions/model-selection.md) — 앱은 id를 들고 있다가 보여 줄 때만 바꾼다.
import 'server-only';
import { createModelRegistryFromEnv } from '@galley/pipeline';

/** id → label. 레지스트리에 없는 id(카탈로그에서 빠진 옛 모델 등)는 id 그대로 — 화면이 비지 않게. */
export function createModelLabeler(env: NodeJS.ProcessEnv = process.env): (id: string) => string {
  const registry = createModelRegistryFromEnv(env);
  return (id) => registry.get(id)?.label ?? id;
}

/** `$0.0123` — 소수 4자리 고정(decisions/model-selection.md "비용(USD, 소수 4자리)"). 음수·NaN은 쓰지 않는다는 전제. */
export function formatCostUsd(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`;
}
