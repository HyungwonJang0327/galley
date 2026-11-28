// 주제 배경 메모 어댑터(서버 전용) — 큐 행 ⋮ "배경 메모" Dialog가 쓴다.
// pipeline의 코드만 있는 결과에 한국어 문구를 붙여 { ok:false, error:{ code, message } }로 돌려준다(decisions/error-handling.md).
import 'server-only';
import { TOPIC_NOTE_MAX_CHARS, getTopicNote, prisma, setTopicNote } from '@galley/pipeline';

export type TopicNoteErrorCode = 'TOPIC_NOT_FOUND' | 'TOPIC_NOTE_TOO_LONG' | 'TOPIC_NOTE_FAILED';

export type TopicNoteFailure = {
  ok: false;
  error: { code: TopicNoteErrorCode; message: string };
};
/** `maxChars`는 입력 칸의 글자 수 안내에 쓴다(상한은 pipeline이 안다). */
export type TopicNoteResult =
  { ok: true; data: { note: string; maxChars: number } } | TopicNoteFailure;

const MESSAGE: Record<Exclude<TopicNoteErrorCode, 'TOPIC_NOTE_FAILED'>, string> = {
  TOPIC_NOT_FOUND: '큐에 없는 주제입니다. 파일에서 다시 불러온 뒤 시도해 주세요.',
  TOPIC_NOTE_TOO_LONG: `배경 메모는 ${TOPIC_NOTE_MAX_CHARS.toLocaleString('ko-KR')}자까지 적을 수 있습니다.`,
};

const failed = (what: string, error: unknown): TopicNoteFailure => {
  const reason = error instanceof Error ? error.message : String(error);
  return { ok: false, error: { code: 'TOPIC_NOTE_FAILED', message: `${what}: ${reason}` } };
};

export async function getTopicBackgroundNote(topicId: string): Promise<TopicNoteResult> {
  try {
    const result = await getTopicNote(prisma, topicId);
    if (!result.ok)
      return { ok: false, error: { code: result.code, message: MESSAGE[result.code] } };
    return { ok: true, data: { note: result.note, maxChars: TOPIC_NOTE_MAX_CHARS } };
  } catch (error) {
    return failed('배경 메모를 읽지 못했습니다', error);
  }
}

export async function saveTopicBackgroundNote(
  topicId: string,
  note: string,
): Promise<TopicNoteResult> {
  try {
    const result = await setTopicNote(prisma, { topicId, note });
    if (!result.ok)
      return { ok: false, error: { code: result.code, message: MESSAGE[result.code] } };
    return { ok: true, data: { note: result.note, maxChars: TOPIC_NOTE_MAX_CHARS } };
  } catch (error) {
    return failed('배경 메모를 저장하지 못했습니다', error);
  }
}
