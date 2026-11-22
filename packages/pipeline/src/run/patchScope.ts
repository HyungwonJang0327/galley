// 답 반영 범위 검사 — "답한 곳만 고쳤는가"를 승인 게이트 쪽에서 판정한다(decisions/review-questions.md, 사용자 결정:
// 이 검사는 승인 게이트 모듈에 둔다). 고치기 전·후 글을 문단 단위로 견줘, 바뀐 문단이 앵커 문단과 그 앞뒤 1문단 밖에도
// 있으면 범위 밖이다. 본문 패치(채움)와 링크드인·Zenn 패치가 같은 규칙을 쓴다. 모델 출력을 믿지 않기 위한 검사라
// 순수 함수로 두고 호출부(단계)가 실패 → 1회 재시도 → 이전 글 유지를 정한다.
import { splitParagraphs } from '../review/paragraphs.ts';

/** 앵커에서 허용하는 거리 — 앵커 문단과 그 앞뒤 1문단. */
export const PATCH_SCOPE_RADIUS = 1;

export interface ParagraphDiff {
  /** 고치기 전 글에서 없어졌거나 내용이 바뀐 문단 번호(오름차순). */
  changed: number[];
  /**
   * 고친 글에 새로 생긴(또는 바뀐 내용의) 문단이 놓인 자리 — 고치기 전 글 기준으로 "`after`번 문단 뒤, `before`번 문단 앞".
   * 맨 앞이면 after = -1, 맨 뒤면 before = 문단 수. 같은 자리의 문단 여럿은 한 항목(`count`).
   */
  inserted: { after: number; before: number; count: number }[];
}

/** 비교용 문단 글 — 줄 끝 공백만 무시한다(그 밖의 차이는 바뀐 것이다). */
const normalize = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

/**
 * 문단 단위 diff — 두 글에 순서대로 공통인 문단(최장 공통 부분열)을 그대로인 문단으로 보고, 나머지를 바뀐 것으로 본다.
 * 문단이 옮겨진 것(순서 바뀜)은 한쪽에서 없어지고 다른 쪽에 생긴 것으로 잡힌다.
 */
export function diffParagraphs(previous: string, next: string): ParagraphDiff {
  const a = splitParagraphs(previous).map((p) => normalize(p.text));
  const b = splitParagraphs(next).map((p) => normalize(p.text));
  // lcs[i][j] = a[i..]와 b[j..]의 최장 공통 부분열 길이.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);

  const changed: number[] = [];
  const inserted: ParagraphDiff['inserted'] = [];
  /** 지금까지 맞춘 마지막 고치기 전 문단 — 새 문단의 자리(`after`)가 된다. */
  let lastKept = -1;
  let pending = 0;
  const flush = (before: number) => {
    if (pending > 0) inserted.push({ after: lastKept, before, count: pending });
    pending = 0;
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      flush(i);
      lastKept = i;
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      changed.push(i);
      i += 1;
    } else {
      pending += 1;
      j += 1;
    }
  }
  for (; i < a.length; i += 1) changed.push(i);
  pending += b.length - j;
  flush(a.length);
  return { changed, inserted };
}

export type PatchScopeResult =
  | { ok: true; diff: ParagraphDiff }
  /** `outside` = 허용 범위 밖에서 바뀐 고치기 전 문단 번호(새 문단은 그 자리 바로 앞 문단 번호, 맨 앞이면 0). 오름차순·중복 없음. */
  | { ok: false; code: 'PATCH_OUT_OF_SCOPE'; outside: number[]; diff: ParagraphDiff };

/**
 * 고친 글이 앵커 범위 안에서만 바뀌었는가. `anchors`는 **고치기 전 글**의 문단 번호들(질문의 앵커).
 *  - 없어지거나 바뀐 고치기 전 문단은 전부 허용 범위(앵커 ± radius) 안이어야 한다.
 *  - 새로 생긴 문단은, 그 자리에서 없어진 문단이 있으면 그 문단들의 판정을 따르고(바뀐 내용으로 본다),
 *    순수하게 끼워 넣은 것이면 바로 앞·뒤 문단 중 하나가 허용 범위 안이어야 한다.
 * 아무것도 안 바뀐 글은 통과다(답이 반영됐는지는 이 검사의 일이 아니다).
 */
export function checkPatchScope(
  previous: string,
  next: string,
  anchors: readonly number[],
  radius: number = PATCH_SCOPE_RADIUS,
): PatchScopeResult {
  const diff = diffParagraphs(previous, next);
  const allowed = (index: number) => anchors.some((anchor) => Math.abs(anchor - index) <= radius);
  const outside = new Set<number>();
  for (const index of diff.changed) if (!allowed(index)) outside.add(index);
  const changedSet = new Set(diff.changed);
  for (const gap of diff.inserted) {
    let replaced = false;
    for (let index = gap.after + 1; index < gap.before; index += 1)
      if (changedSet.has(index)) replaced = true;
    if (replaced) continue; // 그 자리의 없어진 문단이 이미 판정됐다.
    if (!allowed(gap.after) && !allowed(gap.before)) outside.add(Math.max(gap.after, 0));
  }
  return outside.size === 0
    ? { ok: true, diff }
    : {
        ok: false,
        code: 'PATCH_OUT_OF_SCOPE',
        outside: [...outside].sort((x, y) => x - y),
        diff,
      };
}
