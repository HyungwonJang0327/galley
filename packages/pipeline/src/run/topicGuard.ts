// 주제 상태로 보는 실행 가드 — 첫 실행(startRun)과 재실행(startRerun)이 같은 판정을 쓴다.
// 둘 다 "승인이 거절할 것을 비용을 쓰기 전에 안다"가 목적이다(decisions/topic-slug.md 규칙 3,
// decisions/queue-sync-direction.md "사라진 줄 처리").
import { HOLD_REASON_REMOVED } from '../queue/importQueue.ts';
import type { QueueStatus } from '../queue/queueFile.ts';

/** QueueItem.status의 완료 값 — 큐 상태는 아직 파일 어휘(한국어)로 저장된다(todo TD1). */
const DONE_STATUS: QueueStatus = '완료';

export type TopicRunBlock =
  /** 이미 완료된 주제 — 다시 쓰려면 먼저 큐에서 되돌린다(decisions/topic-slug.md 규칙 3) */
  | 'TOPIC_ALREADY_DONE'
  /**
   * 주제_큐.md에서 줄이 사라진 주제 — 승인이 그 줄을 못 찾아 TOPIC_NOT_IN_QUEUE로 거절할 것을 실행 전에 안다(비용).
   * 제목을 고친 줄도 파서에게는 "삭제 + 추가"라 옛 행이 여기 걸린다.
   */
  | 'TOPIC_MISSING_FROM_FILE';

/**
 * 이 주제로 실행을 만들면 안 되는 이유(없으면 null). 완료가 먼저다 — 되돌리는 방법을 안내하는 쪽.
 *
 * 사라짐은 적재가 남긴 표시 둘로 본다 — 실행 이력이 없어 자동으로 보류로 내린 것(holdReason)과 이력이 있어 확인을
 * 기다리는 것(missingSince, "그대로 두기"를 골라도 남는다). 줄이 돌아오면 적재가 둘 다 지운다.
 * **호출자가 직전에 적재했어야 표시가 최신이다**(대시보드 lib/run-start·lib/run-commands).
 */
export function topicRunBlock(topic: {
  status: string;
  holdReason: string | null;
  missingSince: Date | null;
}): TopicRunBlock | null {
  if (topic.status === DONE_STATUS) return 'TOPIC_ALREADY_DONE';
  if (topic.holdReason === HOLD_REASON_REMOVED || topic.missingSince !== null)
    return 'TOPIC_MISSING_FROM_FILE';
  return null;
}
