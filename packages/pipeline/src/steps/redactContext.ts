// 단계 진입 전 식별 정보 필터 — 주제 제목·시리즈명·이전/다음 편 제목에 근거 조각과 같은 `redact()`를 건다
// (decisions/title-redact.md, TD8). 자리는 여기 한 곳(createStepRunner가 라우팅 전에 부른다) — 단계 구현은 받은 제목이
// 이미 걸러진 것이라고 믿는다. 설정이 없으면(null) 그대로. slug·id·URL은 건드리지 않는다(폴더·매칭 키).
import { redact, type RedactConfig, type RedactHit } from '../evidence/redact.ts';
import type { SeriesStepInfo } from './series.ts';
import type { StepContext } from './StepRunner.ts';

export interface RedactedContext {
  ctx: StepContext;
  /** 하나라도 치환됐는가 — 로그·테스트용. 어느 규칙이 몇 번인지는 hits. */
  redacted: boolean;
  hits: RedactHit[];
}

/** 순수 — 입력을 바꾸지 않고 새 컨텍스트를 돌려준다. */
export function redactStepContext(ctx: StepContext, config: RedactConfig | null): RedactedContext {
  if (config === null) return { ctx, redacted: false, hits: [] };
  const hits: RedactHit[] = [];
  const pass = (text: string): string => {
    const result = redact(text, config);
    hits.push(...result.hits);
    return result.text;
  };
  const series = ctx.series === undefined ? undefined : redactSeries(ctx.series, pass);
  const next: StepContext = {
    ...ctx,
    topic: { ...ctx.topic, title: pass(ctx.topic.title) },
    ...(series === undefined ? {} : { series }),
  };
  return { ctx: next, redacted: hits.length > 0, hits: mergeHits(hits) };
}

function redactSeries(info: SeriesStepInfo, pass: (text: string) => string): SeriesStepInfo {
  return {
    ...info,
    name: pass(info.name),
    ...(info.nameJa === undefined ? {} : { nameJa: pass(info.nameJa) }),
    ...(info.previous === undefined
      ? {}
      : { previous: { ...info.previous, title: pass(info.previous.title) } }),
    ...(info.next === undefined ? {} : { next: { title: pass(info.next.title) } }),
  };
}

/** 같은 규칙의 적중을 합친다(필드마다 따로 세어 온 것). */
function mergeHits(hits: readonly RedactHit[]): RedactHit[] {
  const byRule = new Map<string, number>();
  for (const hit of hits) byRule.set(hit.ruleId, (byRule.get(hit.ruleId) ?? 0) + hit.count);
  return [...byRule].map(([ruleId, count]) => ({ ruleId, count }));
}
