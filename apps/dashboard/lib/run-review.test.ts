import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { read, getRunWithSteps, collectReviewQuestions, checkPostShape, json } = vi.hoisted(() => ({
  checkPostShape: vi.fn(),
  read: vi.fn(),
  getRunWithSteps: vi.fn(),
  collectReviewQuestions: vi.fn(),
  // 파서·질문 고르기 자체는 pipeline 테스트가 본다. 여기서는 어느 파일을 읽고 어떻게 잇는지만.
  json: (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  },
}));

vi.mock('@galley/pipeline', () => ({
  RUN_STATUS: { pendingApproval: 'pendingApproval' },
  REVIEW_QUESTIONS_ARTIFACT: 'questions.json',
  REVIEW_RESULT_ARTIFACT: 'review-result.json',
  REVIEW_ANSWER_MAX_LENGTH: 2000,
  derivedPatchArtifact: (step: string) => `${step}-patch.json`,
  parseReviewQuestions: json,
  parseReviewResult: json,
  parseDerivedPatchResult: json,
  parseReviewAnswerSet: json,
  reviewQuestionsInputOf: (run: unknown) => ({ from: run }),
  collectReviewQuestions,
  checkPostShape,
  POST_SHAPE_REFERENCE: {
    proseChars: { min: 1098, max: 4669 },
    codeBlocks: { min: 3, max: 6 },
    longestBlockLines: { min: 12, max: 49 },
    codePercent: { min: 19, max: 47 },
    inlineCodes: { min: 1, max: 53 },
    paragraphs: { min: 14, max: 28 },
    illustrationSlots: { min: 0, max: 3 },
    resultDates: { min: 3, max: 8 },
  },
  prisma: {},
  getRunWithSteps,
  resolveDataDir: (env: { DATA_DIR?: string }) =>
    env.DATA_DIR ? { ok: true, dir: env.DATA_DIR } : { ok: false, code: 'DATA_DIR_MISSING' },
  LocalFsArtifactStore: class {
    read = read;
  },
}));

import { getRunReview, resolveReviewAnswers } from './run-review';

const question = (id: string, source: string, text: string, line = 10) => ({
  id,
  source,
  question: text,
  anchor: { paragraph: 1, line },
});

const RUN = {
  id: 'run_2',
  topicSlug: '무한-스크롤',
  status: 'pendingApproval',
  reviewAnswers: null as string | null,
  steps: [
    { name: 'velog', origin: 'carried', sourceRunId: 'run_1' },
    { name: 'verify', origin: 'fresh', sourceRunId: null },
  ],
};

/** 파일 이름 → 내용. 없는 이름은 "없음". */
const files = (map: Record<string, unknown>) =>
  read.mockImplementation((_slug: string, _runId: string, name: string) =>
    Promise.resolve(
      name in map ? { ok: true, text: JSON.stringify(map[name]) } : { ok: false, code: 'MISSING' },
    ),
  );

const SHAPE = {
  proseChars: 2500,
  codeBlocks: 3,
  longestBlockLines: 20,
  codePercent: 23,
  inlineCodes: 114,
  paragraphs: 34,
  illustrationSlots: 1,
  resultDates: 2,
};

beforeEach(() => {
  vi.stubEnv('DATA_DIR', '/data');
  vi.stubEnv('BLOG_DIR', '/blog');
  getRunWithSteps.mockResolvedValue(RUN);
  collectReviewQuestions.mockResolvedValue({ ok: false, code: 'REVIEW_BODY_MISSING' });
  checkPostShape.mockReturnValue({ shape: SHAPE, findings: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('getRunReview', () => {
  it('질문 파일의 질문과 "그 외"를 화면 형태로 돌려준다', async () => {
    files({
      'questions.json': {
        questions: [{ ...question('c1', 'comment', '몇 건이었나요?', 12), reason: '로그 없음' }],
        more: [question('u1', 'unsupported', '응답이 2배 빨라졌다.', 40)],
      },
    });

    expect(await getRunReview('run_2')).toEqual({
      answerable: true,
      questions: [
        { id: 'c1', source: 'comment', text: '몇 건이었나요?', reason: '로그 없음', line: 12 },
      ],
      more: [{ id: 'u1', source: 'unsupported', text: '응답이 2배 빨라졌다.', line: 40 }],
      unapplied: [],
      kept: [],
      maxLength: 2000,
    });
    expect(collectReviewQuestions).not.toHaveBeenCalled();
  });

  it('질문 파일이 없으면 그 자리에서 고른다(이 기능 전의 실행) — 이전 결과 유지 단계는 출처 실행 기준', async () => {
    files({});
    collectReviewQuestions.mockResolvedValue({
      ok: true,
      value: { questions: [question('u1', 'unsupported', '문장')], more: [] },
    });

    const view = await getRunReview('run_2');

    expect(view?.questions.map((q) => q.id)).toEqual(['u1']);
    expect(collectReviewQuestions).toHaveBeenCalledWith(expect.anything(), {
      from: {
        id: 'run_2',
        topicSlug: '무한-스크롤',
        steps: [
          { name: 'velog', origin: 'carried', sourceRunId: 'run_1' },
          { name: 'verify', origin: 'fresh' },
        ],
      },
    });
  });

  it('삽화 질문은 묻는 말과 이유를 붙여 보인다 — 파일에는 삽화 이름만 있다', async () => {
    files({
      'questions.json': {
        questions: [question('i1', 'illustration', 'illust1_feed, illust2_table', 40)],
        more: [],
      },
    });

    expect((await getRunReview('run_2'))?.questions).toEqual([
      {
        id: 'i1',
        source: 'illustration',
        text: '삽화를 다시 만들까요? (illust1_feed, illust2_table)',
        reason: expect.stringContaining('앞뒤 문단이 답 반영으로 바뀌었습니다'),
        line: 40,
      },
    ]);
  });

  it('보일 것이 없으면 undefined — 질문 0건, 본문 없음, DATA_DIR 없음, 없는 실행', async () => {
    files({ 'questions.json': { questions: [], more: [] } });
    expect(await getRunReview('run_2')).toBeUndefined();

    files({});
    collectReviewQuestions.mockResolvedValue({ ok: false, code: 'REVIEW_BODY_MISSING' });
    expect(await getRunReview('run_2')).toBeUndefined();

    getRunWithSteps.mockResolvedValue(null);
    expect(await getRunReview('nope')).toBeUndefined();

    vi.stubEnv('DATA_DIR', '');
    expect(await getRunReview('run_2')).toBeUndefined();
  });

  it('본문을 기존 글과 견준 결과를 문구로 싣는다 — 기준 밖·경고·수치, 본문이 이전 결과 유지면 출처 실행의 것을 잰다', async () => {
    files({ 'velog.md': '본문' });
    checkPostShape.mockReturnValue({
      shape: { ...SHAPE, proseChars: 4084, codeBlocks: 7, longestBlockLines: 60, codePercent: 55 },
      findings: [
        { code: 'PROSE_CHARS_OVER', level: 'off', value: 4084, min: 2000, max: 3000 },
        { code: 'CODE_BLOCKS_OVER', level: 'off', value: 7, min: 2, max: 4 },
        { code: 'CODE_BLOCK_TOO_LONG', level: 'warn', value: 60, limit: 49 },
        { code: 'CODE_RATIO_OVER', level: 'warn', value: 55, limit: 47 },
      ],
    });

    const view = await getRunReview('run_2');

    expect(view?.bodyShape?.off).toEqual([
      '본문이 4,084자입니다(기준 2,000~3,000자, 코드 제외).',
      '코드 블록이 7개입니다(기준 2~4개).',
    ]);
    expect(view?.bodyShape?.warn).toEqual([
      '가장 긴 코드 블록이 60줄입니다(기존 글에서 가장 긴 것 49줄).',
      '코드가 본문 글자의 55%입니다(기존 글에서 가장 높은 것 47%).',
    ]);
    expect(view?.bodyShape?.stats).toEqual([
      { label: '본문 글자 수(코드 제외)', value: '4,084자', reference: '1,098~4,669자' },
      { label: '코드 블록', value: '7개', reference: '3~6개' },
      { label: '가장 긴 코드 블록', value: '60줄', reference: '12~49줄' },
      { label: '코드 비율', value: '55%', reference: '19~47%' },
      { label: '인라인 코드', value: '114개', reference: '1~53개' },
      { label: '문단', value: '34개', reference: '14~28개' },
      { label: '삽화 자리', value: '1개', reference: '0~3개' },
      { label: '결과 절 날짜', value: '2개', reference: '3~8개(날짜 목록이 있는 6편)' },
    ]);
    expect(view?.questions).toEqual([]);
    expect(checkPostShape).toHaveBeenCalledWith('"본문"');
    expect(read).toHaveBeenCalledWith('무한-스크롤', 'run_1', 'velog.md');
  });

  it('기준 안이어도 본문이 있으면 수치는 보인다(벗어난 항목은 빈 배열)', async () => {
    files({ 'velog.md': '본문' });

    const view = await getRunReview('run_2');

    expect(view?.bodyShape).toMatchObject({ off: [], warn: [] });
    expect(view?.bodyShape?.stats).toHaveLength(8);
  });

  it('승인 대기가 아니면 본문 형식도 보이지 않는다', async () => {
    getRunWithSteps.mockResolvedValue({ ...RUN, status: 'done' });
    files({ 'velog.md': '본문' });

    expect(await getRunReview('run_2')).toBeUndefined();
  });

  it('승인 대기가 아니면 질문은 읽지 않는다', async () => {
    getRunWithSteps.mockResolvedValue({ ...RUN, status: 'running' });
    files({ 'questions.json': { questions: [question('c1', 'comment', '질문')], more: [] } });

    expect(await getRunReview('run_2')).toBeUndefined();
  });

  describe('답 반영 실행', () => {
    const answers = {
      items: [
        {
          question: question('c2', 'comment', '몇 건이었나요?'),
          answer: { id: 'c2', kind: 'fill', text: '3만 건' },
        },
        {
          question: question('u1', 'unsupported', '사라진 문장'),
          answer: { id: 'u1', kind: 'delete' },
        },
      ],
    };
    const answered = { ...RUN, reviewAnswers: JSON.stringify(answers) };

    it('미반영 질문을 사유와 함께 보이고, 같은 질문이 지금 목록에 있으면 답을 다시 채운다(id는 새로 매겨진다)', async () => {
      getRunWithSteps.mockResolvedValue(answered);
      files({
        'questions.json': {
          questions: [question('c1', 'comment', '몇 건이었나요?')],
          more: [],
        },
        'review-result.json': {
          applied: [],
          unapplied: [
            { id: 'c2', code: 'PATCH_OUT_OF_SCOPE' },
            { id: 'u1', code: 'SENTENCE_NOT_FOUND' },
            { id: 'zz', code: 'QUESTION_UNKNOWN' },
          ],
        },
      });

      const view = await getRunReview('run_2');

      expect(view?.questions[0]?.previousAnswer).toEqual({
        id: 'c1',
        kind: 'fill',
        text: '3만 건',
      });
      expect(view?.unapplied).toEqual([
        {
          id: 'c2',
          text: '몇 건이었나요?',
          answer: '채움: 3만 건',
          message: expect.stringContaining('답한 곳 밖'),
          reused: true,
        },
        {
          id: 'u1',
          text: '사라진 문장',
          answer: '삭제',
          message: expect.stringContaining('문장을 찾지 못했습니다'),
          reused: false,
        },
      ]);
    });

    it('모르는 사유 코드는 코드를 그대로 보인다', async () => {
      getRunWithSteps.mockResolvedValue(answered);
      files({ 'review-result.json': { applied: [], unapplied: [{ id: 'c2', code: 'NEW_CODE' }] } });

      expect((await getRunReview('run_2'))?.unapplied[0]?.message).toContain('NEW_CODE');
    });

    it('이전 글을 그대로 둔 뒤 단계(kept)만 알린다 — 승인 대기가 아니어도', async () => {
      getRunWithSteps.mockResolvedValue({ ...answered, status: 'done' });
      files({
        'linkedin-patch.json': { status: 'kept', code: 'PATCH_OUT_OF_SCOPE' },
        'zenn-patch.json': { status: 'patched' },
      });

      expect(await getRunReview('run_2')).toMatchObject({
        answerable: false,
        questions: [],
        kept: [expect.stringMatching(/^링크드인 글에 .*바뀐 곳 밖/)],
      });
    });

    it('답 반영 실행이 아니면 결과 파일을 읽지 않는다', async () => {
      files({ 'questions.json': { questions: [question('c1', 'comment', '질문')], more: [] } });

      await getRunReview('run_2');

      expect(read.mock.calls.map((call) => call[2]).sort()).toEqual(['questions.json', 'velog.md']);
    });
  });
});

describe('resolveReviewAnswers', () => {
  beforeEach(() => {
    files({
      'questions.json': {
        questions: [question('c1', 'comment', '질문')],
        more: [question('u1', 'unsupported', '문장')],
      },
    });
  });

  it('답에 서버가 가진 질문(앵커 포함)을 붙인다 — "그 외"의 질문도', async () => {
    const result = await resolveReviewAnswers('run_2', [
      { id: 'c1', kind: 'fill', text: '3만 건' },
      { id: 'u1', kind: 'delete' },
    ]);

    expect(result).toEqual({
      ok: true,
      items: [
        {
          question: question('c1', 'comment', '질문'),
          answer: { id: 'c1', kind: 'fill', text: '3만 건' },
        },
        { question: question('u1', 'unsupported', '문장'), answer: { id: 'u1', kind: 'delete' } },
      ],
    });
  });

  it('삽화 다시 만들기 답도 서버의 질문을 붙여 넘긴다', async () => {
    files({
      'questions.json': { questions: [question('i1', 'illustration', 'illust1_feed')], more: [] },
    });

    expect(await resolveReviewAnswers('run_2', [{ id: 'i1', kind: 'redo' }])).toEqual({
      ok: true,
      items: [
        {
          question: question('i1', 'illustration', 'illust1_feed'),
          answer: { id: 'i1', kind: 'redo' },
        },
      ],
    });
  });

  it('목록에 없는 질문 id는 거절한다', async () => {
    expect(await resolveReviewAnswers('run_2', [{ id: 'c9', kind: 'keep' }])).toEqual({
      ok: false,
      code: 'REVIEW_QUESTION_UNKNOWN',
    });
  });

  it('실행·DATA_DIR·질문 목록이 없으면 각각의 코드', async () => {
    files({});
    collectReviewQuestions.mockResolvedValue({ ok: false, code: 'REVIEW_BODY_MISSING' });
    expect(await resolveReviewAnswers('run_2', [])).toEqual({
      ok: false,
      code: 'REVIEW_QUESTIONS_MISSING',
    });

    getRunWithSteps.mockResolvedValue(null);
    expect(await resolveReviewAnswers('nope', [])).toEqual({ ok: false, code: 'RUN_NOT_FOUND' });

    vi.stubEnv('DATA_DIR', '');
    expect(await resolveReviewAnswers('run_2', [])).toEqual({
      ok: false,
      code: 'DATA_DIR_MISSING',
    });
  });
});
