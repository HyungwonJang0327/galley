'use client';
// 실행 시작 Dialog — "지금 실행"이 눌리는 모든 진입점(큐 행 ⋮·큐 상단 맨 위 실행·홈 다음 실행)이 **같은 Dialog**를 연다
// (decisions/model-selection.md "화면"). 페이지가 Provider 하나를 두고, 진입점은 useRunStart()로 주제를 넘겨 연다.
// 선택지·초기값은 서버(lib/run-model-options)가 만든다 — 클라이언트는 pipeline을 모른다. 예상 비용은 보이지 않는다.
import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Button, Dialog, FormField, Select } from 'galley-ui';
import { startRun } from '../../../lib/run-api-client';
import type { RunModelChoices } from '../../../lib/run-model-options';
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

export function RunStartProvider({
  choices,
  children,
}: {
  choices: RunModelChoices;
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
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </RunStartContext.Provider>
  );
}

function RunStartDialog({
  topic,
  choices,
  open,
  onOpenChange,
}: {
  topic: RunStartTopic;
  choices: RunModelChoices;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [modelId, setModelId] = useState<string | null>(choices.initialId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
