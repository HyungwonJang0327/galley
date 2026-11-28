import { describe, it, expect, vi, afterEach } from 'vitest';

const { getTopicNote, setTopicNote } = vi.hoisted(() => ({
  getTopicNote: vi.fn(),
  setTopicNote: vi.fn(),
}));

// pipeline 경계만 가짜 — 저장 규칙 자체는 pipeline 테스트가 본다.
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  TOPIC_NOTE_MAX_CHARS: 2000,
  getTopicNote,
  setTopicNote,
}));

import { getTopicBackgroundNote, saveTopicBackgroundNote } from './topic-note';

afterEach(() => {
  getTopicNote.mockReset();
  setTopicNote.mockReset();
});

describe('배경 메모 어댑터', () => {
  it('읽기 — 메모와 글자 상한을 돌려준다', async () => {
    getTopicNote.mockResolvedValue({ ok: true, note: '사용자는 나 혼자' });
    expect(await getTopicBackgroundNote('t1')).toEqual({
      ok: true,
      data: { note: '사용자는 나 혼자', maxChars: 2000 },
    });
    expect(getTopicNote).toHaveBeenCalledWith({}, 't1');
  });

  it('저장 — 정리된 메모를 돌려주고, 코드에는 한국어 문구를 붙인다', async () => {
    setTopicNote.mockResolvedValue({ ok: true, note: '메모' });
    expect(await saveTopicBackgroundNote('t1', ' 메모 ')).toEqual({
      ok: true,
      data: { note: '메모', maxChars: 2000 },
    });
    expect(setTopicNote).toHaveBeenCalledWith({}, { topicId: 't1', note: ' 메모 ' });

    setTopicNote.mockResolvedValue({ ok: false, code: 'TOPIC_NOTE_TOO_LONG' });
    expect(await saveTopicBackgroundNote('t1', 'x')).toEqual({
      ok: false,
      error: { code: 'TOPIC_NOTE_TOO_LONG', message: expect.stringContaining('2,000자') },
    });
    setTopicNote.mockResolvedValue({ ok: false, code: 'TOPIC_NOT_FOUND' });
    expect(await saveTopicBackgroundNote('t1', 'x')).toEqual({
      ok: false,
      error: { code: 'TOPIC_NOT_FOUND', message: expect.stringContaining('큐에 없는 주제') },
    });
  });

  it('던진 오류는 값으로 바꾼다', async () => {
    getTopicNote.mockRejectedValue(new Error('db locked'));
    expect(await getTopicBackgroundNote('t1')).toEqual({
      ok: false,
      error: { code: 'TOPIC_NOTE_FAILED', message: '배경 메모를 읽지 못했습니다: db locked' },
    });
    setTopicNote.mockRejectedValue(new Error('db locked'));
    expect(await saveTopicBackgroundNote('t1', 'x')).toMatchObject({
      ok: false,
      error: { code: 'TOPIC_NOTE_FAILED' },
    });
  });
});
