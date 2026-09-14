// 실행 상세 하단 ActionBar의 순수 판단(클라이언트에서도 쓴다 — server-only 아님, 타입만 import).
// 재실행 규칙 "시작 단계 + 이후 전부"의 계산은 pipeline `planRerun`이 하고, 여기서는 그 결과를
// 사람이 읽는 문장으로 바꾸고 입력을 검사만 한다.
import type { RerunPlanView } from './run-commands';

export interface StepOption {
  name: string;
  label: string;
}

/** 빈 지시는 보내지 않는다. 길이 상한은 서버(pipeline)가 같은 상수로 거절하지만 왕복 전에 한 번 막는다. */
export function validateInstruction(text: string, maxLength: number): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '수정 지시를 입력해 주세요.';
  if (trimmed.length > maxLength) return `수정 지시는 ${maxLength}자 이하로 써 주세요.`;
  return null;
}

export interface RerunPlanText {
  /** "근거 수집 → 벨로그 본문 → …" — 이번에 다시 도는 단계. */
  fresh: string;
  /** "근거 수집" — 이전 결과를 그대로 쓰는 앞 단계. 없으면 null(첫 단계부터). */
  carried: string | null;
}

/** decisions/layout.md 재실행 확인 Dialog 문구: 단계 이름을 라벨로 바꿔 화살표로 잇는다. */
export function describeRerunPlan(
  plan: RerunPlanView,
  steps: readonly StepOption[],
): RerunPlanText {
  const label = (name: string) => steps.find((s) => s.name === name)?.label ?? name;
  return {
    fresh: plan.fresh.map(label).join(' → '),
    carried: plan.carried.length === 0 ? null : plan.carried.map(label).join(' · '),
  };
}
