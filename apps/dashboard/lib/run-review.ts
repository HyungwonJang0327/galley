// 실행 상세의 확인 질문(서버 전용, decisions/review-questions.md). 승인 대기 실행의 질문 목록(`questions.json` — 없으면 그 자리에서
// 같은 규칙으로 만든다)과, 답 반영 실행이 남긴 결과(본문 `review-result.json`의 미반영 질문 · 링크드인·Zenn `<단계>-patch.json`의
// "이전 글 유지")를 화면이 그릴 형태로 읽는다. 미반영된 답은 지금 질문 목록의 같은 질문에 **그대로 다시 채워** 준다.
// 파일이 없거나 DATA_DIR이 없으면 오류가 아니라 "질문 없음"이다 — 이 패널이 실행 상세를 막지 않는다.
import 'server-only';
import {
  checkPostShape,
  collectReviewQuestions,
  derivedPatchArtifact,
  getRunWithSteps,
  LocalFsArtifactStore,
  parseDerivedPatchResult,
  parseReviewAnswerSet,
  parseReviewQuestions,
  parseReviewResult,
  POST_SHAPE_REFERENCE,
  prisma,
  REVIEW_ANSWER_MAX_LENGTH,
  REVIEW_QUESTIONS_ARTIFACT,
  REVIEW_RESULT_ARTIFACT,
  reviewQuestionsInputOf,
  RUN_STATUS,
  type DerivedPatchStep,
  type PostShape,
  type PostShapeFinding,
  type ReviewAnswer,
  type ReviewAnswerItem,
  type ReviewQuestion,
  type ReviewQuestions,
  type RunDetail,
} from '@galley/pipeline';
import { resolveDashboardDataDir } from './data-dir';

/**
 * 화면이 보내고 받는 답 한 건 — 질문 id와 종류(채움이면 글). 질문 본문·앵커는 서버가 질문 목록에서 다시 찾는다.
 * `redo`는 삽화 질문에만 쓴다(삽화 다시 만들기).
 */
export interface ReviewAnswerInput {
  id: string;
  kind: 'fill' | 'keep' | 'delete' | 'redo';
  text?: string;
}

export interface ReviewQuestionView {
  id: string;
  /**
   * `comment` = 본문의 [확인 필요] 주석, `unsupported` = 근거 검증이 근거를 찾지 못한 문장,
   * `illustration` = 자리 앞뒤 문단이 답 반영으로 바뀐 삽화(다시 만들지 묻는다).
   */
  source: 'comment' | 'unsupported' | 'illustration';
  /** 주석: 질문 한 문장. 근거 없음: 그 문장 원문. 삽화: "삽화를 다시 만들까요?" + 삽화 이름. */
  text: string;
  reason?: string;
  /** 본문(velog.md) 줄 번호. */
  line: number;
  /** 직전 답 반영에서 반영되지 못한 답 — 입력 초기값으로 다시 쓴다. */
  previousAnswer?: ReviewAnswerInput;
}

export interface ReviewUnappliedView {
  id: string;
  text: string;
  /** 그때의 답(문구). */
  answer: string;
  /** 반영하지 못한 이유(문구). */
  message: string;
  /** 지금 질문 목록에 같은 질문이 있어 답을 다시 채워 두었는가. */
  reused: boolean;
}

/** 기존 글과 견준 수치 한 줄 — 이 본문의 값과 기존 글 23편의 범위. */
export interface BodyShapeStat {
  label: string;
  value: string;
  reference: string;
}

export interface BodyShapeView {
  /** 기준(본문 글자 수·코드 블록 수) 밖인 항목(문구). */
  off: string[];
  /** 경고(블록 길이·코드 비율, 문구). */
  warn: string[];
  stats: BodyShapeStat[];
}

export interface RunReviewView {
  /** 질문에 답할 수 있는가 — 승인 대기만. */
  answerable: boolean;
  questions: ReviewQuestionView[];
  /** "그 외 N건" — 같은 형태, 접어서 보인다. */
  more: ReviewQuestionView[];
  /** 이 실행(답 반영 실행)이 반영하지 못한 질문. */
  unapplied: ReviewUnappliedView[];
  /** 본문 수정이 반영되지 않아 이전 글을 그대로 둔 뒤 단계(문구). */
  kept: string[];
  /** 본문을 기존 글과 견준 결과(승인 대기에서만) — 표시만 하고 승인을 막지 않는다. */
  bodyShape?: BodyShapeView;
  /** 채움 글 길이 상한. */
  maxLength: number;
}

const UNAPPLIED_MESSAGE: Record<string, string> = {
  QUESTION_UNKNOWN: '질문을 본문에서 찾지 못했습니다.',
  COMMENT_NOT_FOUND: '본문에서 그 주석을 찾지 못했습니다.',
  SENTENCE_NOT_FOUND: '본문에서 그 문장을 찾지 못했습니다.',
  ANCHOR_NOT_FOUND: '고칠 자리를 본문에서 다시 찾지 못했습니다.',
  PATCH_OUT_OF_SCOPE: '모델이 두 번 다 답한 곳 밖의 문단까지 바꿔, 이전 본문을 그대로 뒀습니다.',
  PATCH_OUTPUT_INVALID: '모델 출력이 두 번 다 비었거나 잘려, 이전 본문을 그대로 뒀습니다.',
};

const KEPT_REASON: Record<string, string> = {
  PATCH_OUT_OF_SCOPE: '모델이 두 번 다 바뀐 곳 밖까지 고쳤습니다',
  PATCH_OUTPUT_INVALID: '모델 출력이 두 번 다 비었거나 잘렸습니다',
};

const ILLUSTRATION_REASON =
  '이 삽화 자리의 바로 앞뒤 문단이 답 반영으로 바뀌었습니다. 그림이 고친 글과 맞는지 확인해 주세요.';

const DERIVED_STEPS: readonly { step: DerivedPatchStep; label: string }[] = [
  { step: 'linkedin', label: '링크드인' },
  { step: 'zenn', label: 'Zenn' },
];

/** 벨로그 본문 산출물 이름(pipeline `VELOG_ARTIFACT`와 같은 값). */
const VELOG_ARTIFACT = 'velog.md';

const num = (n: number) => n.toLocaleString('ko-KR');

function describeShapeFinding(finding: PostShapeFinding): string {
  switch (finding.code) {
    case 'PROSE_CHARS_UNDER':
    case 'PROSE_CHARS_OVER':
      return `본문이 ${num(finding.value)}자입니다(기준 ${num(finding.min)}~${num(finding.max)}자, 코드 제외).`;
    case 'CODE_BLOCKS_UNDER':
    case 'CODE_BLOCKS_OVER':
      return `코드 블록이 ${finding.value}개입니다(기준 ${finding.min}~${finding.max}개).`;
    case 'CODE_BLOCK_TOO_LONG':
      return `가장 긴 코드 블록이 ${finding.value}줄입니다(기존 글에서 가장 긴 것 ${finding.limit}줄).`;
    case 'CODE_RATIO_OVER':
      return `코드가 본문 글자의 ${finding.value}%입니다(기존 글에서 가장 높은 것 ${finding.limit}%).`;
  }
}

const range = (r: { min: number; max: number }, unit: string) =>
  `${num(r.min)}~${num(r.max)}${unit}`;

/** 잰 값 전부를 기존 글 23편의 범위와 나란히 — 표시만 한다. */
function shapeStats(shape: PostShape): BodyShapeStat[] {
  const ref = POST_SHAPE_REFERENCE;
  return [
    {
      label: '본문 글자 수(코드 제외)',
      value: `${num(shape.proseChars)}자`,
      reference: range(ref.proseChars, '자'),
    },
    { label: '코드 블록', value: `${shape.codeBlocks}개`, reference: range(ref.codeBlocks, '개') },
    {
      label: '가장 긴 코드 블록',
      value: `${shape.longestBlockLines}줄`,
      reference: range(ref.longestBlockLines, '줄'),
    },
    { label: '코드 비율', value: `${shape.codePercent}%`, reference: range(ref.codePercent, '%') },
    {
      label: '인라인 코드',
      value: `${shape.inlineCodes}개`,
      reference: range(ref.inlineCodes, '개'),
    },
    { label: '문단', value: `${shape.paragraphs}개`, reference: range(ref.paragraphs, '개') },
    {
      label: '삽화 자리',
      value: `${shape.illustrationSlots}개`,
      reference: range(ref.illustrationSlots, '개'),
    },
    {
      label: '결과 절 날짜',
      value: `${shape.resultDates}개`,
      reference: `${range(ref.resultDates, '개')}(날짜 목록이 있는 6편)`,
    },
  ];
}

/**
 * 이 실행의 본문(이전 결과 유지면 출처 실행의 것)을 기존 글과 견준 결과. 본문이 없으면 undefined.
 * 기준 밖·경고·수치 모두 표시만 한다 — 승인을 막지 않는다.
 */
async function loadBodyShape(
  store: LocalFsArtifactStore,
  run: RunDetail,
): Promise<BodyShapeView | undefined> {
  const step = run.steps.find((s) => s.name === 'velog');
  const bodyRunId =
    step?.origin === 'carried' && step.sourceRunId !== null ? step.sourceRunId : run.id;
  const body = await store.read(run.topicSlug, bodyRunId, VELOG_ARTIFACT);
  if (!body.ok) return undefined;
  const { shape, findings } = checkPostShape(body.text);
  return {
    off: findings.filter((f) => f.level === 'off').map(describeShapeFinding),
    warn: findings.filter((f) => f.level === 'warn').map(describeShapeFinding),
    stats: shapeStats(shape),
  };
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const questionKey = (question: Pick<ReviewQuestion, 'source' | 'question'>) =>
  `${question.source}\n${oneLine(question.question)}`;

function describeAnswer(answer: ReviewAnswer): string {
  if (answer.kind === 'fill') return `채움: ${answer.text}`;
  if (answer.kind === 'redo') return '다시 만들기';
  return answer.kind === 'keep' ? '모름(그대로 둠)' : '삭제';
}

function toAnswerInput(answer: ReviewAnswer): ReviewAnswerInput {
  return answer.kind === 'fill'
    ? { id: answer.id, kind: 'fill', text: answer.text }
    : { id: answer.id, kind: answer.kind };
}

function artifactStore(): LocalFsArtifactStore | undefined {
  const dataDir = resolveDashboardDataDir({
    DATA_DIR: process.env.DATA_DIR,
    BLOG_DIR: process.env.BLOG_DIR,
  });
  return dataDir.ok ? new LocalFsArtifactStore(dataDir.dir) : undefined;
}

/** 이 실행의 질문 목록 — 워커가 쓴 파일이 있으면 그것, 없거나 깨졌으면(이 기능 전의 실행) 본문·근거 검증에서 다시 고른다. */
async function loadQuestions(
  store: LocalFsArtifactStore,
  run: RunDetail,
): Promise<ReviewQuestions | undefined> {
  const file = await store.read(run.topicSlug, run.id, REVIEW_QUESTIONS_ARTIFACT);
  const parsed = file.ok ? parseReviewQuestions(file.text) : undefined;
  if (parsed !== undefined) return parsed;
  const collected = await collectReviewQuestions(
    store,
    reviewQuestionsInputOf({
      id: run.id,
      topicSlug: run.topicSlug,
      ...(run.reviewAnswers === null ? {} : { reviewAnswers: run.reviewAnswers }),
      steps: run.steps.map((step) => ({
        name: step.name,
        origin: step.origin,
        ...(step.sourceRunId === null ? {} : { sourceRunId: step.sourceRunId }),
      })),
    }),
  );
  return collected.ok ? collected.value : undefined;
}

/** 이 실행이 반영하지 못한 질문·답(결과 파일 + 이 실행의 답 묶음). 답 반영 실행이 아니거나 파일이 없으면 빈 배열. */
async function loadUnapplied(
  store: LocalFsArtifactStore,
  run: RunDetail,
): Promise<{ item: ReviewAnswerItem; code: string }[]> {
  if (run.reviewAnswers === null) return [];
  const answers = parseReviewAnswerSet(run.reviewAnswers);
  if (answers === undefined) return [];
  const file = await store.read(run.topicSlug, run.id, REVIEW_RESULT_ARTIFACT);
  const result = file.ok ? parseReviewResult(file.text) : undefined;
  if (result === undefined) return [];
  return result.unapplied.flatMap(({ id, code }) => {
    const item = answers.items.find((entry) => entry.question.id === id);
    return item === undefined ? [] : [{ item, code }];
  });
}

async function loadKept(store: LocalFsArtifactStore, run: RunDetail): Promise<string[]> {
  if (run.reviewAnswers === null) return [];
  const lines: string[] = [];
  for (const { step, label } of DERIVED_STEPS) {
    const file = await store.read(run.topicSlug, run.id, derivedPatchArtifact(step));
    const result = file.ok ? parseDerivedPatchResult(file.text) : undefined;
    if (result?.status !== 'kept') continue;
    const reason = result.code === undefined ? undefined : KEPT_REASON[result.code];
    lines.push(
      `${label} 글에 본문 수정이 반영되지 않았습니다 — 이전 글을 그대로 뒀습니다${reason === undefined ? '' : `(${reason})`}.`,
    );
  }
  return lines;
}

/**
 * 실행 상세의 확인 질문 패널. 보일 것이 없으면(질문 0·미반영 0·유지 0·본문 형식 없음, 또는 DATA_DIR·실행 없음) undefined — 패널이 빠진다.
 * 던지지 않는다(읽기 실패는 "없음").
 */
export async function getRunReview(runId: string): Promise<RunReviewView | undefined> {
  try {
    const store = artifactStore();
    if (store === undefined) return undefined;
    const run = await getRunWithSteps(prisma, runId);
    if (!run) return undefined;

    const answerable = run.status === RUN_STATUS.pendingApproval;
    const [questions, unapplied, kept, bodyShape] = await Promise.all([
      answerable ? loadQuestions(store, run) : undefined,
      loadUnapplied(store, run),
      loadKept(store, run),
      // 본문 형식은 승인 대기에서만 보인다 — 수정 지시를 낼 수 있는 때다.
      answerable ? loadBodyShape(store, run) : undefined,
    ]);

    // 미반영된 답은 지금 목록의 같은 질문(종류 + 문장)에 다시 채운다 — 질문 id는 실행마다 새로 매겨져 id로는 못 잇는다.
    const reusable = new Map(unapplied.map(({ item }) => [questionKey(item.question), item]));
    const reused = new Set<string>();
    const toView = (question: ReviewQuestion): ReviewQuestionView => {
      const key = questionKey(question);
      const previous = reusable.get(key);
      if (previous !== undefined) reused.add(key);
      // 삽화 질문은 파일에 삽화 이름만 있다 — 묻는 말과 이유는 여기서 붙인다.
      if (question.source === 'illustration')
        return {
          id: question.id,
          source: question.source,
          text: `삽화를 다시 만들까요? (${question.question})`,
          reason: ILLUSTRATION_REASON,
          line: question.anchor.line,
        };
      return {
        id: question.id,
        source: question.source,
        text: question.question,
        ...(question.reason === undefined ? {} : { reason: question.reason }),
        line: question.anchor.line,
        ...(previous === undefined
          ? {}
          : { previousAnswer: { ...toAnswerInput(previous.answer), id: question.id } }),
      };
    };
    const view: RunReviewView = {
      answerable,
      questions: (questions?.questions ?? []).map(toView),
      more: (questions?.more ?? []).map(toView),
      unapplied: [],
      kept,
      ...(bodyShape === undefined ? {} : { bodyShape }),
      maxLength: REVIEW_ANSWER_MAX_LENGTH,
    };
    view.unapplied = unapplied.map(({ item, code }) => ({
      id: item.question.id,
      text: item.question.question,
      answer: describeAnswer(item.answer),
      message: UNAPPLIED_MESSAGE[code] ?? `반영하지 못했습니다(${code}).`,
      reused: reused.has(questionKey(item.question)),
    }));

    const empty =
      view.questions.length + view.more.length + view.unapplied.length + view.kept.length === 0 &&
      view.bodyShape === undefined;
    return empty ? undefined : view;
  } catch {
    return undefined;
  }
}

export type ResolveReviewAnswersFailure =
  | 'RUN_NOT_FOUND'
  | 'DATA_DIR_MISSING'
  /** 이 실행의 질문 목록을 만들 수 없음(본문 파일 없음) */
  | 'REVIEW_QUESTIONS_MISSING'
  /** 답의 id가 이 실행의 질문 목록에 없음(화면이 본 뒤 목록이 바뀜) */
  | 'REVIEW_QUESTION_UNKNOWN';

export type ResolveReviewAnswersResult =
  { ok: true; items: ReviewAnswerItem[] } | { ok: false; code: ResolveReviewAnswersFailure };

/**
 * 화면이 보낸 답(id·종류·글)에 **서버가 가진 질문(앵커 포함)** 을 붙인다 — 질문 본문·앵커를 브라우저에서 받지 않는다.
 * 형식 검증(빈 채움·길이·중복)은 pipeline `answerRun`이 한다.
 */
export async function resolveReviewAnswers(
  runId: string,
  answers: readonly ReviewAnswerInput[],
): Promise<ResolveReviewAnswersResult> {
  const store = artifactStore();
  if (store === undefined) return { ok: false, code: 'DATA_DIR_MISSING' };
  const run = await getRunWithSteps(prisma, runId);
  if (!run) return { ok: false, code: 'RUN_NOT_FOUND' };
  const questions = await loadQuestions(store, run);
  if (questions === undefined) return { ok: false, code: 'REVIEW_QUESTIONS_MISSING' };

  const byId = new Map([...questions.questions, ...questions.more].map((q) => [q.id, q]));
  const items: ReviewAnswerItem[] = [];
  for (const answer of answers) {
    const question = byId.get(answer.id);
    if (question === undefined) return { ok: false, code: 'REVIEW_QUESTION_UNKNOWN' };
    items.push({
      question,
      answer:
        answer.kind === 'fill'
          ? { id: answer.id, kind: 'fill', text: answer.text ?? '' }
          : { id: answer.id, kind: answer.kind },
    });
  }
  return { ok: true, items };
}
