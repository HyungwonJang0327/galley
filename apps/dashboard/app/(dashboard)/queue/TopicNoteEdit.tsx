'use client';
// "배경 메모" Dialog — 큐 행 ⋮에서 연다(decisions/evidence-collection.md "근거의 층과 순서"). 커밋·작업 문서에 없는 조건과 동기를
// 실행 전에 적어 두는 자유 텍스트. 비워 두어도 실행된다. 데이터는 서버 액션(props) — 클라이언트는 pipeline을 모른다.
// 페이지가 Provider 하나를 두고 행 메뉴는 useTopicNoteEdit()로 주제를 넘겨 연다(TopicEvidenceProvider와 같은 구조).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog, FormField, InlineAlert, Textarea } from 'galley-ui';
import type { TopicNoteResult } from '../../../lib/topic-note';
import styles from './TopicNoteEdit.module.css';

export interface TopicNoteTopic {
  /** 주제 키 = QueueItem.id. */
  id: string;
  title: string;
}

export interface TopicNoteActions {
  load: (topicId: string) => Promise<TopicNoteResult>;
  save: (topicId: string, note: string) => Promise<TopicNoteResult>;
}

const Context = createContext<((topic: TopicNoteTopic) => void) | null>(null);

/** 행 메뉴가 Dialog를 여는 함수. Provider 밖에서 부르면 배선 실수다. */
export function useTopicNoteEdit(): (topic: TopicNoteTopic) => void {
  const open = useContext(Context);
  if (open === null) throw new Error('useTopicNoteEdit는 TopicNoteProvider 안에서만 쓴다');
  return open;
}

export function TopicNoteProvider({
  actions,
  children,
}: {
  actions: TopicNoteActions;
  children: ReactNode;
}) {
  const [topic, setTopic] = useState<TopicNoteTopic | null>(null);
  const [open, setOpen] = useState(false);
  /** 열 때마다 본문 상태(값·오류)를 새로 — key로 다시 마운트한다. */
  const [session, setSession] = useState(0);
  const openFor = (next: TopicNoteTopic) => {
    setTopic(next);
    setSession((n) => n + 1);
    setOpen(true);
  };
  return (
    <Context.Provider value={openFor}>
      {children}
      {topic !== null ? (
        <TopicNoteDialog
          key={session}
          topic={topic}
          actions={actions}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </Context.Provider>
  );
}

const REQUEST_FAILED = '요청이 실패했습니다. 다시 시도해 주세요.';

export function TopicNoteDialog({
  topic,
  actions,
  open,
  onOpenChange,
}: {
  topic: TopicNoteTopic;
  actions: TopicNoteActions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  /** null = 아직 읽는 중(입력 칸을 잠근다 — 읽기 전에 적은 글이 덮이지 않게). */
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [maxChars, setMaxChars] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void actions.load(topic.id).then(
      (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setSaved(result.data.note);
        setValue(result.data.note);
        setMaxChars(result.data.maxChars);
      },
      () => {
        if (!cancelled) setError(REQUEST_FAILED);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [actions, topic.id]);

  const over = maxChars !== null && value.trim().length > maxChars;
  const dirty = saved !== null && value.trim() !== saved;

  const onSave = async () => {
    if (busy || saved === null || over) return;
    setBusy(true);
    setError(null);
    try {
      const result = await actions.save(topic.id, value);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onOpenChange(false);
    } catch {
      setError(REQUEST_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      title={`${topic.title} — 배경 메모`}
      description="커밋과 작업 문서에 없는 조건·동기를 적어 두면 다음 실행의 근거 수집이 함께 싣고, 본문 서론의 시점·조건에 먼저 씁니다. 비워 두어도 실행됩니다."
      closeLabel="닫기"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button disabled={busy || !dirty || over} onClick={() => void onSave()}>
            저장
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <FormField
          label="배경 메모"
          description="예: 회사에서 2년 넘게 만든 제품 / 사용자는 나 혼자 / 기간·규모 같은 숫자"
          {...(over
            ? { error: `${maxChars.toLocaleString('ko-KR')}자까지 적을 수 있습니다.` }
            : {})}
        >
          <Textarea
            rows={8}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={busy || saved === null}
          />
        </FormField>
        {maxChars !== null ? (
          <p className={over ? `${styles.count} ${styles.over}` : styles.count}>
            {value.trim().length.toLocaleString('ko-KR')} / {maxChars.toLocaleString('ko-KR')}자
          </p>
        ) : null}
        {/* live 영역은 비어 있어도 트리에 남긴다(RunStart와 같은 규칙). */}
        <p role="status" className={styles.note}>
          {saved === null && error === null ? '불러오는 중…' : busy ? '저장하는 중…' : ''}
        </p>
        {error !== null ? (
          <InlineAlert tone="danger" variant="plain">
            {error}
          </InlineAlert>
        ) : null}
      </div>
    </Dialog>
  );
}
