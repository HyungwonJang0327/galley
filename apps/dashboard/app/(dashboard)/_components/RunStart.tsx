'use client';
// 실행 시작 Dialog — "지금 실행"이 눌리는 모든 진입점(큐 행 ⋮·큐 상단 맨 위 실행·홈 다음 실행)이 **같은 Dialog**를 연다
// (decisions/model-selection.md "화면"). 페이지가 Provider 하나를 두고, 진입점은 useRunStart()로 주제를 넘겨 연다.
// 선택지·초기값은 서버(lib/run-model-options)가 만든다 — 클라이언트는 pipeline을 모른다. 예상 비용은 보이지 않는다.
// 연결된 근거 목록·0건 경고(BE12): 열릴 때 서버 액션(loadEvidence)으로 읽는다. 0건이어도 실행은 된다 — 근거 수집까지
// 돌고 본문 단계에서 멈춘다(decisions/evidence-collection.md "벨로그 본문").
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog, FormField, InlineAlert, Select } from 'galley-ui';
import { startRun } from '../../../lib/run-api-client';
import type { RunModelChoices } from '../../../lib/run-model-options';
import type { TopicEvidenceLinkView, TopicEvidenceListResult } from '../../../lib/topic-evidence';
import { runsHref } from '../../../lib/run-view';
import styles from './RunStart.module.css';

export interface RunStartTopic {
  /** 주제 키 = QueueItem.id. */
  id: string;
  title: string;
}

const RunStartContext = createContext<((topic: RunStartTopic) => void) | null>(null);

/** 진입점이 Dialog를 여는 함수. Provider 밖에서 부르면 배선 실수다. */
export function useRunStart(): (topic: RunStartTopic) => void {
  const open = useContext(RunStartContext);
  if (open === null) throw new Error('useRunStart는 RunStartProvider 안에서만 쓴다');
  return open;
}

/**
 * 주제 하나의 실행 시작 버튼(큐 상단 `맨 위 실행`·홈 `지금 실행`). 주제가 없거나 사유가 있으면 비활성 + 사유(title).
 * 사유 판정은 서버(lib/next-run)가 한다.
 */
export function RunStartButton({
  topic,
  disabledReason,
  children,
}: {
  topic: RunStartTopic | undefined;
  disabledReason: string | undefined;
  children: ReactNode;
}) {
  const open = useRunStart();
  const disabled = topic === undefined || disabledReason !== undefined;
  return (
    <Button
      disabled={disabled}
      title={disabledReason}
      onClick={() => {
        if (topic !== undefined && !disabled) open(topic);
      }}
    >
      {children}
    </Button>
  );
}

export type LoadTopicEvidence = (topicId: string) => Promise<TopicEvidenceListResult>;

export function RunStartProvider({
  choices,
  loadEvidence,
  children,
}: {
  choices: RunModelChoices;
  /** 연결된 근거 목록(서버 액션). Dialog가 열릴 때 읽는다. */
  loadEvidence: LoadTopicEvidence;
  children: ReactNode;
}) {
  const [topic, setTopic] = useState<RunStartTopic | null>(null);
  const [open, setOpen] = useState(false);
  /** 열 때마다 본문 상태(모델·오류)를 새로 — key로 다시 마운트한다. */
  const [session, setSession] = useState(0);

  const openFor = (next: RunStartTopic) => {
    setTopic(next);
    setSession((n) => n + 1);
    setOpen(true);
  };

  return (
    <RunStartContext.Provider value={openFor}>
      {children}
      {topic !== null ? (
        <RunStartDialog
          key={session}
          topic={topic}
          choices={choices}
          loadEvidence={loadEvidence}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </RunStartContext.Provider>
  );
}

/** Dialog에 나열하는 근거 제목 수 — 그 이상은 "외 n건". 전체 편집은 큐 행 ⋮ "근거 편집". */
const EVIDENCE_PREVIEW = 5;

type EvidenceState =
  | { kind: 'loading' }
  | { kind: 'loaded'; links: TopicEvidenceLinkView[] }
  | { kind: 'failed'; message: string };

function RunStartDialog({
  topic,
  choices,
  loadEvidence,
  open,
  onOpenChange,
}: {
  topic: RunStartTopic;
  choices: RunModelChoices;
  loadEvidence: LoadTopicEvidence;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [modelId, setModelId] = useState<string | null>(choices.initialId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void loadEvidence(topic.id).then(
      (result) => {
        if (cancelled) return;
        setEvidence(
          result.ok
            ? { kind: 'loaded', links: result.data.links }
            : { kind: 'failed', message: result.error.message },
        );
      },
      () => {
        if (!cancelled)
          setEvidence({
            kind: 'failed',
            message: '근거 목록을 읽지 못했습니다. 다시 시도해 주세요.',
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadEvidence, topic.id]);

  const selected = choices.options.find((option) => option.value === modelId);
  const canRun = selected !== undefined && !selected.disabled && !busy;

  const onRun = async () => {
    if (!canRun) return;
    setBusy(true);
    setError(null);
    const result = await startRun({ topicId: topic.id, modelId: selected.value });
    if (!result.ok) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    onOpenChange(false);
    router.push(runsHref({ tab: 'active', selectedId: result.data.id }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 요청 중에는 닫지 않는다 — 닫힌 뒤 실행이 생기면 어디로 갔는지 모른다.
        if (!busy) onOpenChange(next);
      }}
      title={topic.title}
      description="이 주제를 실행 대기열에 올립니다. 모델 단가는 백만 토큰당 입력 / 출력 USD입니다."
      closeLabel="닫기"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button disabled={!canRun} onClick={() => void onRun()}>
            실행
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <FormField label="모델">
          <Select
            value={modelId}
            onValueChange={(value) => {
              setModelId(value);
              setError(null);
            }}
            items={choices.options}
            placeholder="모델 선택"
            disabled={busy}
          />
        </FormField>
        {choices.initialId === undefined ? (
          <p className={styles.note}>
            API 키가 있는 모델이 없습니다. .env에 ANTHROPIC_API_KEY 또는 OPENAI_API_KEY를 넣어
            주세요.
          </p>
        ) : null}
        <RunStartEvidence state={evidence} />
        {/* live 영역은 비어 있어도 트리에 남긴다 — 문구가 생기기 전에 있어야 낭독이 안정적이다(RunActionBar와 같은 규칙). */}
        <p role="status" className={styles.note}>
          {busy ? '실행을 요청하는 중…' : null}
        </p>
        {error !== null ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** 연결된 근거 요약 — 제목 몇 개 + 0건이면 경고(실행은 막지 않는다 — 결정: "0건 경고(실행은 가능)"). */
function RunStartEvidence({ state }: { state: EvidenceState }) {
  if (state.kind === 'loading') return <p className={styles.note}>근거 목록을 읽는 중…</p>;
  if (state.kind === 'failed')
    return (
      <p className={styles.note}>
        근거 목록을 읽지 못했습니다({state.message}). 실행은 할 수 있습니다.
      </p>
    );
  if (state.links.length === 0)
    return (
      <InlineAlert tone="warning" variant="plain">
        연결된 근거가 없습니다. 실행하면 추가 탐색으로 찾은 근거만 쓰고, 그것도 없으면 본문 단계에서
        멈춥니다. 큐 행 ⋮ &quot;근거 편집&quot;에서 먼저 연결할 수 있습니다.
      </InlineAlert>
    );
  const shown = state.links.slice(0, EVIDENCE_PREVIEW);
  const rest = state.links.length - shown.length;
  return (
    <div>
      <p className={styles.note}>연결된 근거 {state.links.length}건</p>
      <ul className={styles.evidence} aria-label="연결된 근거">
        {shown.map((link) => (
          <li key={link.analysisId}>
            {link.title} <span className={styles.evidenceMeta}>{link.meta}</span>
          </li>
        ))}
        {rest > 0 ? <li className={styles.evidenceMeta}>외 {rest}건</li> : null}
      </ul>
    </div>
  );
}
