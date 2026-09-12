// 단계 하나를 실제로 돌리는 것의 경계. **워커는 이 인터페이스 뒤를 모른다.**
//
// 모든 단계가 모델 호출인 것이 아니다 — 썸네일은 make_thumb.py 실행이고 발행정보는 상당 부분
// EvidenceBundle 조립이다. 워커에 모델 호출을 박으면 그 단계들이 예외가 되고 경계가 무너진다.
// 그래서 워커는 오케스트레이션(클레임·순서·기록·heartbeat·재시도 정책)만 하고,
// 무엇을 하는지는 여기 구현이 안다. (decisions/run-execution-model.md)
//
// 구현은 BE8~BE11이 단계별로 채운다. 지금은 Mock 하나뿐이다.
import type { StepName } from '../run/stateMachine';

export interface StepContext {
  runId: string;
  step: StepName;
  /** 그 실행이 다루는 주제(표시·프롬프트용 제목). */
  topic: { id: string; title: string; slug: string };
  /** 근거 수집이 만든 번들. 본문·검증 단계가 쓴다(BE8~BE11에서 타입이 붙는다). */
  evidence?: unknown;
  /** 재실행이면 그때의 수정 지시. 첫 실행에는 없다. */
  instruction?: string;
  /** 워커가 소유하는 취소·타임아웃. 구현은 오래 걸리는 일 사이사이에 확인한다. */
  signal: AbortSignal;
}

export interface StepResult {
  /** 이 단계가 만든 산출물. 파일로 쓰는 것은 워커가 아니라 B3a가 맡는다. */
  artifacts: Record<string, string>;
  /** 모델을 쓴 단계만 채운다. 워커는 받은 값을 기록만 하고 추정하지 않는다. */
  tokens?: { input: number; output: number };
  costUsd?: number;
  /** 이 단계를 돌린 모델(레지스트리 id). 썸네일처럼 모델이 없는 단계는 비운다. */
  model?: string;
  /** 화면 표시용 플래그(근거 검증의 unsupported 등). **전이에 영향 없다.** */
  flags?: { unsupported: number; uncertain: number };
}

export interface StepRunner {
  run(ctx: StepContext): Promise<StepResult>;
}

/**
 * 단계 실패. **재시도 가능 여부를 구현이 알리고 정책(횟수·간격)은 워커가 정한다**
 * — decisions/error-handling.md "재시도 분류".
 *
 * `code`는 타임라인 문구 매핑과 재시도 판단에 쓰는 안정적인 키다. **목록을 미리 만들지 않는다**
 * — 단계 구현이 실제로 내는 것만 늘린다.
 */
export class StepFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** 일시적 실패(네트워크·레이트리밋·5xx·타임아웃)면 true. 입력·설정 문제면 false. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'StepFailure';
  }
}

/** 던져진 것이 무엇이든 워커가 기록할 수 있는 형태로 좁힌다. */
export function toStepFailure(error: unknown): StepFailure {
  if (error instanceof StepFailure) return error;
  // 워커가 signal로 끊은 경우 — 실패가 아니라 중단이지만, 기록은 같은 통로로 한다.
  if (error instanceof Error && error.name === 'AbortError') {
    return new StepFailure('ABORTED', '실행이 중단되었습니다.', true);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new StepFailure('STEP_FAILED', message, false);
}
