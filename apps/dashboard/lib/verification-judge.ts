// 근거 검증 줄의 배지·안내문 — 서술 판정(모델) 결과를 사람 말로. 순수 함수뿐이라 클라·서버 어디서든 import할 수 있다
// (pipeline 값 없음, `import type`만). 값은 lib/run-artifacts가 줄인 VerificationView. RH2: 판정이 잘리거나 깨진 것을
// "불확실 n"에 묻지 않고 따로 보인다 — RH1부터 판정은 묶음 단위라 일부만 실패할 수 있고, `judgeBatches`가 있으면 몇 묶음인지 센다.
import type { VerificationView } from './run-artifacts';

/** 판정 실패로 불확실이 된 서술 수 — 보고서 claims의 사유 코드를 센다(묶음 수가 없는 옛 파일도 여기서 안다). */
export function judgeFailureCounts(view: VerificationView): {
  truncated: number;
  unparsed: number;
  notJudged: number;
} {
  const counts = { truncated: 0, unparsed: 0, notJudged: 0 };
  for (const claim of view.claims) {
    if (claim.reason === 'judge-truncated') counts.truncated += 1;
    else if (claim.reason === 'judge-unparsed') counts.unparsed += 1;
    else if (claim.reason === 'not-judged') counts.notJudged += 1;
  }
  return counts;
}

/** 배지가 주황이어야 하는가 — 근거 없는 주장이 있거나, 모델 판정이 잘리거나 깨졌다(검수자가 "불확실 n"만 보고 넘어가면 안 된다). */
export function verifyBadgeTone(view: VerificationView): 'warning' | 'neutral' {
  return view.counts.unsupported > 0 || view.judge === 'truncated' || view.judge === 'unparsed'
    ? 'warning'
    : 'neutral';
}

/**
 * 배지 글자 — "근거 없음 n · 불확실 n", 판정이 잘렸으면 " · 판정 잘림 k/N"(k = 실패 묶음, N = 전체 묶음), 깨졌으면 "판정 깨짐".
 * 묶음 수가 없는 옛 파일은 비율 없이 "판정 잘림". 둘 다 있으면 깨짐 쪽 글자에 둘을 합친 수.
 */
export function verifyBadgeText(view: VerificationView): string {
  const base = `근거 없음 ${view.counts.unsupported} · 불확실 ${view.counts.uncertain}`;
  if (view.judge !== 'truncated' && view.judge !== 'unparsed') return base;
  const label = view.judge === 'truncated' ? '판정 잘림' : '판정 깨짐';
  const b = view.judgeBatches;
  if (b === undefined) return `${base} · ${label}`;
  return `${base} · ${label} ${b.truncated + b.unparsed}/${b.total}`;
}

/**
 * 펼침 안내문 — 판정이 왜 비었는지 한 문단. 없으면 undefined.
 * - 잘림·깨짐: 묶음 수가 있으면 "묶음 N개 중 k개(서술 n문장)", 없으면(옛 파일) "서술 n문장". 재실행으로 복구됨을 덧붙인다.
 * - 상한 밖(`not-judged`)이 있으면 한 문장 더 — 판정 자체가 안 된 것이라 불확실과 뜻이 다르다.
 */
export function judgeNote(view: VerificationView): string | undefined {
  const fail = judgeFailureCounts(view);
  const parts: string[] = [];
  if (view.judge === 'truncated' || view.judge === 'unparsed') {
    const cause =
      view.judge === 'truncated'
        ? '잘려'
        : view.judgeBatches !== undefined && view.judgeBatches.truncated > 0
          ? '깨지거나 잘려'
          : '깨져';
    const statements = fail.truncated + fail.unparsed;
    const b = view.judgeBatches;
    const scope =
      b === undefined
        ? `서술 ${statements}문장이`
        : `묶음 ${b.total}개 중 ${b.truncated + b.unparsed}개(서술 ${statements}문장)가`;
    parts.push(
      `모델 판정 출력이 ${cause} ${scope} 불확실로 남았습니다. 근거 검증부터 재실행하면 다시 판정합니다.`,
    );
  }
  if (fail.notJudged > 0)
    parts.push(`판정 상한을 넘어 서술 ${fail.notJudged}문장은 판정하지 않았습니다(불확실).`);
  return parts.length === 0 ? undefined : parts.join(' ');
}
