// 적재가 남긴 "파일에서 사라짐" 표시를 한 값으로 읽는다 — 실행 가드(topicGuard)와 큐 화면(loadQueue)이 같은 판정을 쓴다.
// (decisions/queue-sync-direction.md "사라진 줄 처리")
import { HOLD_REASON_REMOVED } from './importQueue.ts';

export type MissingMark =
  /** 실행 이력이 없어 확인 없이 보류로 내린 것(`holdReason = removed-from-file`). 보류 탭에서 사유를 보인다. */
  | 'auto-held'
  /** 실행 이력이 있어 확인을 띄운 것(`missingSince`). "그대로 두기"를 골라도 줄은 여전히 없으므로 표시는 남는다. */
  | 'pending';

/** 파일에서 사라진 주제면 그 종류, 파일에 있으면 null. 줄이 돌아오면 적재가 표시를 지워 null로 돌아온다. */
export function missingMark(topic: {
  holdReason: string | null;
  missingSince: Date | null;
}): MissingMark | null {
  if (topic.holdReason === HOLD_REASON_REMOVED) return 'auto-held';
  if (topic.missingSince !== null) return 'pending';
  return null;
}
