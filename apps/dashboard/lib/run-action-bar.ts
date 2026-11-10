// 실행 상세 하단 ActionBar의 순수 판단(클라이언트에서도 쓴다 — server-only 아님, 타입만 import).
// 재실행 규칙 "시작 단계 + 이후 전부"의 계산은 pipeline `planRerun`이 하고, 여기서는 그 결과를
// 사람이 읽는 문장으로 바꾸고 입력을 검사만 한다.
import type { ApprovedRun, RerunPlanView } from './run-commands';

export interface StepOption {
  name: string;
  label: string;
}

/**
 * 빈 지시는 보내지 않는다 — 단, 실패 실행의 재실행은 비워도 된다(`optional`, 원인을 밖에서 고친 뒤 "그냥 다시",
 * decisions/failed-run-rerun.md). 길이 상한은 서버(pipeline)가 같은 상수로 거절하지만 왕복 전에 한 번 막는다.
 */
export function validateInstruction(
  text: string,
  maxLength: number,
  options: { optional?: boolean } = {},
): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 && options.optional !== true) return '수정 지시를 입력해 주세요.';
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

export interface ApprovalNotice {
  /** success: 모두 정리됨. warning: posts 폴더에 옮기지 못한 옛 파일이 남음(사람이 정리해야 한다). */
  tone: 'success' | 'warning';
  title: string;
  lines: string[];
}

/**
 * 승인 응답을 안내 문구로 바꾼다. 공개 발행은 하지 않는다는 점을 제목에 늘 밝힌다(INTENT 비목표).
 * 옮긴 파일(replaced)·남은 파일(leftover)은 decisions/topic-slug.md 규칙 4의 결과 — 남은 게 있으면 warning.
 */
export function describeApproval(
  result: Pick<ApprovedRun, 'postsDir' | 'replaced' | 'replacedDir' | 'leftover'>,
): ApprovalNotice {
  const lines = [`산출물을 썼습니다 → ${result.postsDir}`];
  if (result.replaced.length > 0) {
    const where = result.replacedDir === undefined ? '' : ` → ${result.replacedDir}`;
    lines.push(
      `직전 승인 파일 ${result.replaced.length}개를 옮겼습니다${where}: ${result.replaced.join(', ')}`,
    );
  }
  if (result.leftover.length > 0) {
    lines.push(
      `posts 폴더에 옛 파일이 남았습니다(옮기지 못함): ${result.leftover.join(', ')} — 직접 옮기거나 지우세요.`,
    );
  }
  return {
    tone: result.leftover.length > 0 ? 'warning' : 'success',
    title: '승인했습니다. 공개 발행은 일어나지 않았습니다.',
    lines,
  };
}
