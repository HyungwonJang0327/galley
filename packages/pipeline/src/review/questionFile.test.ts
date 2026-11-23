// 질문 파일 — 임시 DATA_DIR. 모델·DB 없음.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { renderReviewAnswerSet } from './answerSet.ts';
import {
  collectReviewQuestions,
  createReviewQuestionWriter,
  parseReviewQuestions,
  renderReviewQuestions,
  reviewQuestionsInputOf,
} from './questionFile.ts';
import { REVIEW_QUESTIONS_ARTIFACT, type ReviewQuestion } from './questions.ts';

const SLUG = '한-피드';
const BODY = [
  '# 한 피드에 섞기',
  '',
  '테이블을 둘로 나눴다. 응답 시간이 절반으로 줄었다.',
  '',
  '제약은 애플리케이션에서 검사했다.',
  '<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->',
  '',
  '배포는 금요일에 했다.',
  '',
].join('\n');
const report = (claims: unknown[]) => JSON.stringify({ version: 1, claims });
const CLAIMS = [
  { text: '배포는 금요일에 했다.', status: 'unsupported', line: 8, note: '커밋에 요일 없음' },
  { text: '응답 시간이 절반으로 줄었다.', status: 'unsupported', line: 3 },
  { text: '테이블을 둘로 나눴다.', status: 'supported', line: 3 },
];

let dir: string;
let artifacts: LocalFsArtifactStore;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-question-file-'));
  artifacts = new LocalFsArtifactStore(dir);
  await artifacts.write(SLUG, 'run_1', 'velog.md', BODY);
  await artifacts.write(SLUG, 'run_1', 'verification.json', report(CLAIMS));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('collectReviewQuestions', () => {
  test('본문 주석 → 근거 없음 순으로 고른다', async () => {
    const got = await collectReviewQuestions(artifacts, {
      slug: SLUG,
      bodyRunId: 'run_1',
      verifyRunId: 'run_1',
    });
    expect(got.ok && got.value.questions.map((q) => [q.id, q.question, q.anchor])).toEqual([
      ['c1', 'CHECK 제약을 검토했나요?', { paragraph: 2, line: 6 }],
      ['u1', '응답 시간이 절반으로 줄었다.', { paragraph: 1, line: 3 }],
      ['u2', '배포는 금요일에 했다.', { paragraph: 3, line: 8 }],
    ]);
    expect(got.ok && got.value.more).toEqual([]);
  });

  test('근거 검증 리포트가 없거나 깨졌으면 주석만으로 고른다', async () => {
    await artifacts.write(SLUG, 'run_broken', 'verification.json', '{');
    for (const verifyRunId of ['run_none', 'run_broken']) {
      const got = await collectReviewQuestions(artifacts, {
        slug: SLUG,
        bodyRunId: 'run_1',
        verifyRunId,
      });
      expect(got.ok && got.value.questions.map((q) => q.id)).toEqual(['c1']);
    }
  });

  test('본문이 없으면 값으로 실패한다', async () => {
    expect(
      await collectReviewQuestions(artifacts, {
        slug: SLUG,
        bodyRunId: 'run_none',
        verifyRunId: 'run_1',
      }),
    ).toEqual({ ok: false, code: 'REVIEW_BODY_MISSING' });
  });

  test('이미 그대로 두기로 확정한 근거 없음 문장은 다시 묻지 않는다(공백 차이 무시)', async () => {
    const got = await collectReviewQuestions(artifacts, {
      slug: SLUG,
      bodyRunId: 'run_1',
      verifyRunId: 'run_1',
      confirmed: ['배포는  금요일에 했다.'],
    });
    expect(got.ok && got.value.questions.map((q) => q.question)).toEqual([
      'CHECK 제약을 검토했나요?',
      '응답 시간이 절반으로 줄었다.',
    ]);
  });

  test('본문이 고쳐져 줄이 당겨졌으면 근거 없음 질문의 앵커를 본문에서 다시 잡는다', async () => {
    // 주석 줄을 지운 본문 + 옛 리포트(줄 번호는 고치기 전 기준).
    const patched = BODY.replace(
      '<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->\n',
      '',
    );
    await artifacts.write(SLUG, 'run_2', 'velog.md', patched);
    const got = await collectReviewQuestions(artifacts, {
      slug: SLUG,
      bodyRunId: 'run_2',
      verifyRunId: 'run_1',
    });
    const friday = got.ok ? got.value.questions.find((q) => q.question.startsWith('배포')) : null;
    expect(friday?.anchor).toEqual({ paragraph: 3, line: 7 });
  });
});

describe('삽화 질문', () => {
  const patch = (illustrations: unknown[]) =>
    JSON.stringify({ version: 1, baseRunId: 'run_0', status: 'patched', illustrations });
  const collect = (publishRunId: string) =>
    collectReviewQuestions(artifacts, {
      slug: SLUG,
      bodyRunId: 'run_1',
      verifyRunId: 'run_1',
      publishRunId,
    });

  test('발행정보 고침 결과에 물을 삽화가 있으면 질문 하나 — 상위 3건 뒤에 따로 붙는다', async () => {
    await artifacts.write(
      SLUG,
      'run_pub',
      'publishInfo-patch.json',
      patch([
        { name: 'illust2_table', paragraph: 3, line: 8 },
        { name: 'illust1_feed', paragraph: 1, line: 3 },
      ]),
    );

    const got = await collect('run_pub');

    expect(got.ok && got.value.questions.map((q) => q.id)).toEqual(['c1', 'u1', 'u2', 'i1']);
    expect(got.ok && got.value.questions[3]).toEqual({
      id: 'i1',
      source: 'illustration',
      question: 'illust2_table, illust1_feed',
      anchor: { paragraph: 1, line: 3 },
    });
  });

  test('물을 삽화가 없거나 결과 파일이 없거나 깨졌으면 묻지 않는다', async () => {
    await artifacts.write(SLUG, 'run_empty', 'publishInfo-patch.json', patch([]));
    await artifacts.write(SLUG, 'run_bad', 'publishInfo-patch.json', '{');
    for (const publishRunId of ['run_empty', 'run_bad', 'run_none']) {
      const got = await collect(publishRunId);
      expect(got.ok && got.value.questions.map((q) => q.id)).toEqual(['c1', 'u1', 'u2']);
    }
  });
});

describe('reviewQuestionsInputOf', () => {
  const step = (name: string, origin: string, sourceRunId?: string) => ({
    name,
    origin,
    ...(sourceRunId === undefined ? {} : { sourceRunId }),
  });

  test('이전 결과 유지(carried)만 출처 Run에서 읽는다 — 고침·다시 만듦은 이 Run', () => {
    expect(
      reviewQuestionsInputOf({
        id: 'run_3',
        topicSlug: SLUG,
        steps: [step('velog', 'patched', 'run_2'), step('verify', 'carried', 'run_1')],
      }),
    ).toEqual({ slug: SLUG, bodyRunId: 'run_3', verifyRunId: 'run_1', publishRunId: 'run_3' });
    expect(
      reviewQuestionsInputOf({
        id: 'run_3',
        topicSlug: SLUG,
        steps: [
          step('velog', 'carried', 'run_2'),
          step('verify', 'fresh'),
          step('publishInfo', 'carried', 'run_1'),
        ],
      }),
    ).toEqual({ slug: SLUG, bodyRunId: 'run_2', verifyRunId: 'run_3', publishRunId: 'run_1' });
  });

  test('이 실행을 만든 답 가운데 근거 없음 + 모름만 확정한 문장으로 넘긴다', () => {
    const q = (id: string, source: ReviewQuestion['source'], question: string): ReviewQuestion => ({
      id,
      source,
      question,
      anchor: { paragraph: 0, line: 1 },
    });
    const reviewAnswers = renderReviewAnswerSet({
      version: 1,
      items: [
        { question: q('u1', 'unsupported', '둔다.'), answer: { id: 'u1', kind: 'keep' } },
        { question: q('u2', 'unsupported', '뺀다.'), answer: { id: 'u2', kind: 'delete' } },
        { question: q('c1', 'comment', '주석?'), answer: { id: 'c1', kind: 'keep' } },
      ],
    });
    expect(
      reviewQuestionsInputOf({ id: 'run_3', topicSlug: SLUG, reviewAnswers, steps: [] }).confirmed,
    ).toEqual(['둔다.']);
  });
});

describe('createReviewQuestionWriter', () => {
  test('이 Run 폴더에 질문 파일을 쓴다 — 쓴 것을 그대로 읽는다', async () => {
    const writer = createReviewQuestionWriter(artifacts);
    expect(await writer.prepare({ id: 'run_1', topicSlug: SLUG, steps: [] })).toBe(true);
    const file = await artifacts.read(SLUG, 'run_1', REVIEW_QUESTIONS_ARTIFACT);
    const parsed = file.ok ? parseReviewQuestions(file.text) : undefined;
    expect(parsed?.questions.map((q) => q.id)).toEqual(['c1', 'u1', 'u2']);
    expect(parsed && renderReviewQuestions(parsed)).toBe(file.ok ? file.text : '');
  });

  test('본문이 없으면 쓰지 않는다', async () => {
    const writer = createReviewQuestionWriter(artifacts);
    expect(await writer.prepare({ id: 'run_none', topicSlug: SLUG, steps: [] })).toBe(false);
    expect((await artifacts.read(SLUG, 'run_none', REVIEW_QUESTIONS_ARTIFACT)).ok).toBe(false);
  });
});

describe('parseReviewQuestions', () => {
  test('형식이 아니면 없는 것으로 다룬다', () => {
    for (const text of [
      '',
      '[]',
      '{"version":2,"questions":[],"more":[]}',
      '{"version":1,"questions":[{"id":"c1"}],"more":[]}',
      '{"version":1,"questions":[]}',
    ])
      expect(parseReviewQuestions(text)).toBeUndefined();
  });
});
