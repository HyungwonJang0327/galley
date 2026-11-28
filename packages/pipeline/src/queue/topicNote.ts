// 주제의 배경 메모 — 커밋·작업 문서에 없는 조건과 동기("2년 넘게 만든 제품", "사용자는 나 혼자", 기간·규모 같은 숫자)를
// 사람이 미리 적어 두는 자유 텍스트. 근거 수집이 묶음의 맨 앞 층으로 싣는다(decisions/evidence-collection.md "근거의 층과 순서").
// DB에만 있다(주제_큐.md에는 쓰지 않는다 — 파일의 줄 구조를 바꾸지 않는다). 재적재(importQueue)는 이 컬럼을 건드리지 않는다.
import type { PrismaClient } from '@prisma/client';

/** 메모 최대 길이(글자). 서론에 쓸 조건 몇 줄이 목적이다 — 본문을 대신 쓰는 자리가 아니다. */
export const TOPIC_NOTE_MAX_CHARS = 2000;

export type GetTopicNoteResult =
  { ok: true; note: string } | { ok: false; code: 'TOPIC_NOT_FOUND' };

/** 저장된 메모(없으면 빈 문자열). */
export async function getTopicNote(
  prisma: PrismaClient,
  topicId: string,
): Promise<GetTopicNoteResult> {
  const topic = await prisma.queueItem.findUnique({
    where: { id: topicId },
    select: { backgroundNote: true },
  });
  if (topic === null) return { ok: false, code: 'TOPIC_NOT_FOUND' };
  return { ok: true, note: topic.backgroundNote ?? '' };
}

export type SetTopicNoteResult =
  { ok: true; note: string } | { ok: false; code: 'TOPIC_NOT_FOUND' | 'TOPIC_NOTE_TOO_LONG' };

/**
 * 메모를 저장한다. 줄바꿈은 `\n`으로 맞추고 앞뒤 공백을 뗀다. 비면 null로 지운다(= 메모 없음).
 * 같은 값이면 쓰지 않는다 — update는 `updatedAt`을 올려 자동 연결을 다시 계산하게 한다.
 */
export async function setTopicNote(
  prisma: PrismaClient,
  input: { topicId: string; note: string },
): Promise<SetTopicNoteResult> {
  const note = input.note.replace(/\r\n?/g, '\n').trim();
  if (note.length > TOPIC_NOTE_MAX_CHARS) return { ok: false, code: 'TOPIC_NOTE_TOO_LONG' };
  const topic = await prisma.queueItem.findUnique({
    where: { id: input.topicId },
    select: { backgroundNote: true },
  });
  if (topic === null) return { ok: false, code: 'TOPIC_NOT_FOUND' };
  if ((topic.backgroundNote ?? '') === note) return { ok: true, note };
  await prisma.queueItem.update({
    where: { id: input.topicId },
    data: { backgroundNote: note === '' ? null : note },
  });
  return { ok: true, note };
}
