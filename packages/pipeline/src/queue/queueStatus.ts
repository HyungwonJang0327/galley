// QueueItem.status 어휘(DB 저장값, 영어) ↔ 주제_큐.md 섹션 머리글(파일 어휘, 한국어)의 경계 — decisions/db-value-language.md.
// 파일 파서·라이터(queueFile.ts)는 섹션(`QueueSection`)만 알고, DB·대시보드·URL은 상태(`QueueStatus`)만 안다.
// 둘 사이 변환은 **이 파일의 두 함수**로만 한다(적재·이동·정렬·완료·승인·시리즈).
import type { QueueSection } from './queueFile.ts';

export const QUEUE_STATUS = {
  waiting: 'waiting',
  candidate: 'candidate',
  hold: 'hold',
  done: 'done',
} as const;
export type QueueStatus = (typeof QUEUE_STATUS)[keyof typeof QUEUE_STATUS];

/** 파일 섹션 순서와 같다(대기 → 후보 → 보류 → 완료). */
export const QUEUE_STATUS_ORDER: readonly QueueStatus[] = [
  QUEUE_STATUS.waiting,
  QUEUE_STATUS.candidate,
  QUEUE_STATUS.hold,
  QUEUE_STATUS.done,
];

export function isQueueStatus(value: string): value is QueueStatus {
  return (QUEUE_STATUS_ORDER as readonly string[]).includes(value);
}

const SECTION_BY_STATUS: Record<QueueStatus, QueueSection> = {
  waiting: '대기',
  candidate: '후보',
  hold: '보류',
  done: '완료',
};
const STATUS_BY_SECTION: Record<QueueSection, QueueStatus> = {
  대기: 'waiting',
  후보: 'candidate',
  보류: 'hold',
  완료: 'done',
};

/** 상태 → 파일 섹션 머리글. */
export function sectionOf(status: QueueStatus): QueueSection {
  return SECTION_BY_STATUS[status];
}
/** 파일 섹션 머리글 → 상태(파일 → DB 경계). */
export function statusOf(section: QueueSection): QueueStatus {
  return STATUS_BY_SECTION[section];
}
