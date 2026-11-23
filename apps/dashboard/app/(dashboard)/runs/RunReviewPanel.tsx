'use client';
// 실행 상세의 확인 질문(decisions/review-questions.md): 질문 최대 3건(+ 삽화 질문) + 접힌 "그 외 N건"에 채움·모름·삭제(삽화는 다시 만들기)로 답하면
// 답한 곳만 고치는 새 실행이 생긴다. 답 반영 실행이면 그 결과(미반영 질문·이전 글을 그대로 둔 뒤 단계)를 위에 알린다 —
// 미반영된 답은 서버가 같은 질문에 다시 채워 넘긴다(previousAnswer). 질문 목록·문구는 서버(lib/run-review)가 만들고,
// 이 컴포넌트는 pipeline을 import하지 않는다(decisions/server-only-boundary.md). 명령은 Route Handler로 보낸다.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, InlineAlert, RadioGroup, Textarea, useConfirm } from 'galley-ui';
import { answerRun } from '../../../lib/run-api-client';
import {
  collectReviewAnswers,
  describeAnswerPlan,
  describeChoice,
  initialReviewForm,
  type ReviewChoice,
} from '../../../lib/run-review-form';
import type { ReviewQuestionView, RunReviewView } from '../../../lib/run-review';
import { runsHref } from '../../../lib/run-view';
import styles from './RunReviewPanel.module.css';

export interface RunReviewPanelProps {
  runId: string;
  review: RunReviewView;
}

const CHOICES: { value: ReviewChoice; label: string }[] = [
  { value: 'none', label: '답 안 함' },
  { value: 'fill', label: '채움' },
  { value: 'keep', label: '모름(그대로 둠)' },
  { value: 'delete', label: '삭제' },
];

/** 삽화 질문의 답은 "다시 만들기"뿐이다 — 그대로 두려면 답하지 않는다. */
const ILLUSTRATION_CHOICES: { value: ReviewChoice; label: string }[] = [
  { value: 'none', label: '답 안 함(그대로 둠)' },
  { value: 'redo', label: '다시 만들기' },
];

const SOURCE_LABEL: Record<ReviewQuestionView['source'], string> = {
  comment: '확인 필요',
  unsupported: '근거 없음',
  illustration: '삽화',
};

export function RunReviewPanel({ runId, review }: RunReviewPanelProps) {
  const router = useRouter();
  const { confirm, element: confirmElement } = useConfirm();
  const all = [...review.questions, ...review.more];
  const [form, setForm] = useState(() => initialReviewForm(all));
  // 다시 채운 답이 접힌 쪽에 있으면 펼쳐 둔다 — 안 보이는 답이 같이 나가지 않게.
  const [moreOpen, setMoreOpen] = useState(() =>
    review.more.some((question) => question.previousAnswer !== undefined),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 요청 중 다른 실행을 고르면(page.tsx의 key) 언마운트된다 — 그 뒤 push 금지. */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setChoice = (id: string, choice: ReviewChoice) => {
    setForm((prev) => ({ ...prev, choices: { ...prev.choices, [id]: choice } }));
    setMessage(null);
  };
  const setText = (id: string, text: string) =>
    setForm((prev) => ({ ...prev, texts: { ...prev.texts, [id]: text } }));

  const onSubmit = async () => {
    // 접힌 "그 외"의 답은 보내지 않는다(보이지 않는 답) — 펼쳐 둔 것만.
    const visible = moreOpen ? all : review.questions;
    const collected = collectReviewAnswers(visible, form, review.maxLength);
    if (!collected.ok) {
      setMessage(collected.message);
      return;
    }
    setMessage(null);
    const plan = describeAnswerPlan(visible, collected.answers);
    const ok = await confirm({
      title: '답을 반영할까요?',
      description: plan.costs
        ? '비용이 드는 작업입니다. 이 실행은 닫히고, 답한 곳만 고친 새 실행이 만들어집니다.'
        : '이 실행은 닫히고, 답을 반영한 새 실행이 만들어집니다.',
      confirmLabel: '답 반영',
      cancelLabel: '취소',
      closeLabel: '닫기',
      children: (
        <dl className={styles.plan}>
          <dt>답</dt>
          <dd>{plan.counts}</dd>
          <dt>하는 일</dt>
          <dd>{plan.effect}</dd>
        </dl>
      ),
    });
    if (!ok) return;
    setBusy(true);
    const result = await answerRun(runId, collected.answers);
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    router.push(runsHref({ tab: 'active', selectedId: result.data.run.id }));
  };

  const renderQuestion = (question: ReviewQuestionView) => {
    const choice = form.choices[question.id] ?? 'none';
    const hint = describeChoice(question.source, choice);
    return (
      <li key={question.id} className={styles.question} data-source={question.source}>
        <p className={styles.head}>
          <span className={styles.source} data-source={question.source}>
            {SOURCE_LABEL[question.source]}
          </span>
          <span className={styles.muted}>본문 {question.line}줄</span>
        </p>
        <p className={styles.text}>{question.text}</p>
        {question.reason === undefined ? null : <p className={styles.muted}>{question.reason}</p>}
        <RadioGroup
          aria-label={`답: ${question.text}`}
          orientation="horizontal"
          value={choice}
          onValueChange={(value) => setChoice(question.id, value as ReviewChoice)}
          items={question.source === 'illustration' ? ILLUSTRATION_CHOICES : CHOICES}
          disabled={busy}
        />
        {choice === 'fill' ? (
          <Textarea
            aria-label={`채움 내용: ${question.text}`}
            placeholder="본문에 넣을 사실을 적어 주세요. 문장은 모델이 다듬습니다."
            rows={2}
            maxLength={review.maxLength}
            value={form.texts[question.id] ?? ''}
            onChange={(event) => setText(question.id, event.target.value)}
            disabled={busy}
          />
        ) : null}
        {hint === null ? null : <p className={styles.muted}>{hint}</p>}
      </li>
    );
  };

  const hasQuestions = review.answerable && all.length > 0;
  return (
    <section className={styles.panel} aria-label="확인 질문">
      {review.unapplied.length > 0 ? (
        <InlineAlert tone="warning" title={`반영하지 못한 답 ${review.unapplied.length}건`}>
          <ul className={styles.notices}>
            {review.unapplied.map((item) => (
              <li key={item.id}>
                <span className={styles.noticeText}>{item.text}</span>
                <span className={styles.muted}>
                  {item.answer} — {item.message}
                  {item.reused ? ' 아래 같은 질문에 답을 다시 채워 두었습니다.' : ''}
                </span>
              </li>
            ))}
          </ul>
        </InlineAlert>
      ) : null}
      {review.kept.length > 0 ? (
        <InlineAlert tone="warning" title="본문 수정이 반영되지 않은 글이 있습니다">
          {review.kept.map((line) => (
            <p key={line} className={styles.noticeLine}>
              {line}
            </p>
          ))}
        </InlineAlert>
      ) : null}
      {hasQuestions ? (
        <>
          <h3 className={styles.title}>확인 질문 {review.questions.length}건</h3>
          <ul className={styles.list}>{review.questions.map(renderQuestion)}</ul>
          {review.more.length > 0 ? (
            <>
              <button
                type="button"
                className={styles.more}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
              >
                그 외 {review.more.length}건 {moreOpen ? '접기' : '펼치기'}
              </button>
              {moreOpen ? <ul className={styles.list}>{review.more.map(renderQuestion)}</ul> : null}
            </>
          ) : null}
          <div className={styles.actions}>
            <p role="status" className={message !== null ? styles.message : styles.busy}>
              {message ?? (busy ? '답 반영을 요청하는 중…' : '')}
            </p>
            <Button size="sm" disabled={busy} onClick={() => void onSubmit()}>
              답 반영
            </Button>
          </div>
        </>
      ) : null}
      {confirmElement}
    </section>
  );
}
