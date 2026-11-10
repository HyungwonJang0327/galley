'use client';
// "근거 편집" Dialog — 큐 행 ⋮에서 연다(decisions/evidence-collection.md "수동 편집"·layout.md §4). 연결된 분석 글 목록(소스 배지·
// 이유)·제거, 인덱스 검색·추가. 데이터는 전부 서버 액션(props) — 클라이언트는 pipeline을 모르고 표시 문자열만 받는다.
// 페이지가 Provider 하나를 두고 행 메뉴는 useTopicEvidenceEdit()로 주제를 넘겨 연다(RunStartProvider와 같은 구조).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Dialog, FormField, InlineAlert, Input } from 'galley-ui';
import type {
  TopicEvidenceEditResult,
  TopicEvidenceLinkView,
  TopicEvidenceListResult,
  TopicEvidenceSearchHitView,
  TopicEvidenceSearchResult,
} from '../../../lib/topic-evidence';
import styles from './TopicEvidenceEdit.module.css';

export interface TopicEvidenceTopic {
  /** 주제 키 = QueueItem.id. */
  id: string;
  title: string;
}

export interface TopicEvidenceActions {
  load: (topicId: string) => Promise<TopicEvidenceListResult>;
  search: (topicId: string, query: string) => Promise<TopicEvidenceSearchResult>;
  add: (topicId: string, analysisId: string) => Promise<TopicEvidenceEditResult>;
  remove: (topicId: string, analysisId: string) => Promise<TopicEvidenceEditResult>;
}

const Context = createContext<((topic: TopicEvidenceTopic) => void) | null>(null);

/** 행 메뉴가 Dialog를 여는 함수. Provider 밖에서 부르면 배선 실수다. */
export function useTopicEvidenceEdit(): (topic: TopicEvidenceTopic) => void {
  const open = useContext(Context);
  if (open === null) throw new Error('useTopicEvidenceEdit는 TopicEvidenceProvider 안에서만 쓴다');
  return open;
}

export function TopicEvidenceProvider({
  actions,
  children,
}: {
  actions: TopicEvidenceActions;
  children: ReactNode;
}) {
  const [topic, setTopic] = useState<TopicEvidenceTopic | null>(null);
  const [open, setOpen] = useState(false);
  /** 열 때마다 본문 상태(목록·검색·오류)를 새로 — key로 다시 마운트한다. */
  const [session, setSession] = useState(0);
  const openFor = (next: TopicEvidenceTopic) => {
    setTopic(next);
    setSession((n) => n + 1);
    setOpen(true);
  };
  return (
    <Context.Provider value={openFor}>
      {children}
      {topic !== null ? (
        <TopicEvidenceDialog
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

export function TopicEvidenceDialog({
  topic,
  actions,
  open,
  onOpenChange,
}: {
  topic: TopicEvidenceTopic;
  actions: TopicEvidenceActions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [links, setLinks] = useState<TopicEvidenceLinkView[] | null>(null);
  const [query, setQuery] = useState('');
  /** 마지막으로 실행한 검색어 — 편집 뒤 결과의 "연결됨" 표시를 다시 맞출 때 쓴다. null이면 검색한 적 없음. */
  const [searched, setSearched] = useState<string | null>(null);
  const [hits, setHits] = useState<TopicEvidenceSearchHitView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const result = await actions.load(topic.id);
    if (!result.ok) {
      setError(result.error.message);
      setLinks((prev) => prev ?? []);
      return;
    }
    setLinks(result.data.links);
  };

  useEffect(() => {
    let cancelled = false;
    void actions.load(topic.id).then(
      (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error.message);
          setLinks([]);
          return;
        }
        setLinks(result.data.links);
      },
      () => {
        if (cancelled) return;
        setError(REQUEST_FAILED);
        setLinks([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [actions, topic.id]);

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      setHits([]);
      setSearched(null);
      return;
    }
    const result = await actions.search(topic.id, trimmed);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSearched(trimmed);
    setHits(result.data.hits);
  };

  /** 공통 요청 틀 — 진행 문구·오류·동시 요청 차단. 성공하면 목록을 다시 읽고 검색 결과의 연결 표시도 맞춘다. */
  const perform = async (label: string, request: () => Promise<TopicEvidenceEditResult>) => {
    if (busy !== null) return;
    setBusy(label);
    setError(null);
    try {
      const result = await request();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await reload();
      if (searched !== null) await runSearch(searched);
    } catch {
      setError(REQUEST_FAILED);
    } finally {
      setBusy(null);
    }
  };

  const onSearch = async () => {
    if (busy !== null) return;
    // 빈 검색어는 요청 없이 결과만 비운다(진행 상태도 만들지 않는다).
    if (query.trim().length === 0) {
      setHits([]);
      setSearched(null);
      return;
    }
    setBusy('검색하는 중…');
    setError(null);
    try {
      await runSearch(query);
    } catch {
      setError(REQUEST_FAILED);
    } finally {
      setBusy(null);
    }
  };

  const count = links?.length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy === null) onOpenChange(next);
      }}
      title={`${topic.title} — 근거 편집`}
      description="연결된 분석 글이 실행 때 근거 수집의 출발점이 됩니다. 뗀 근거는 자동 연결이 다시 붙이지 않습니다."
      closeLabel="닫기"
      footer={
        <Button variant="secondary" disabled={busy !== null} onClick={() => onOpenChange(false)}>
          닫기
        </Button>
      }
    >
      <div className={styles.body}>
        <section aria-labelledby="topic-evidence-links-heading">
          <h3 id="topic-evidence-links-heading" className={styles.heading}>
            연결된 근거 {links === null ? '' : `${count}건`}
          </h3>
          {links === null ? (
            <p className={styles.note}>불러오는 중…</p>
          ) : links.length === 0 ? (
            <p className={styles.note}>연결된 근거가 없습니다. 아래에서 검색해 추가하세요.</p>
          ) : (
            <ul className={styles.list} aria-label="연결된 근거">
              {links.map((link) => (
                <li key={link.analysisId} className={styles.item}>
                  <div className={styles.text}>
                    <div className={styles.titleLine}>
                      <span className={styles.title}>{link.title}</span>
                      <Badge tone={link.source === 'manual' ? 'info' : 'neutral'}>
                        {link.sourceLabel}
                      </Badge>
                    </div>
                    <p className={styles.meta}>
                      {link.reason === undefined ? link.meta : `${link.meta} · ${link.reason}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${link.title} 제거`}
                    disabled={busy !== null}
                    onClick={() =>
                      void perform('떼는 중…', () => actions.remove(topic.id, link.analysisId))
                    }
                  >
                    제거
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="topic-evidence-search-heading">
          <h3 id="topic-evidence-search-heading" className={styles.heading}>
            인덱스에서 찾기
          </h3>
          <form
            className={styles.search}
            onSubmit={(event) => {
              event.preventDefault();
              void onSearch();
            }}
          >
            <FormField label="검색어" className={styles.field}>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목·키워드·키"
                disabled={busy !== null}
              />
            </FormField>
            <Button type="submit" variant="secondary" disabled={busy !== null}>
              검색
            </Button>
          </form>
          {searched !== null ? (
            hits.length === 0 ? (
              <p className={styles.note}>"{searched}"에 맞는 분석 글이 없습니다.</p>
            ) : (
              <ul className={styles.list} aria-label="검색 결과">
                {hits.map((hit) => (
                  <li key={hit.analysisId} className={styles.item}>
                    <div className={styles.text}>
                      <span className={styles.title}>{hit.title}</span>
                      <p className={styles.meta}>{hit.meta}</p>
                      <p className={styles.summary}>{hit.summary}</p>
                    </div>
                    {hit.linked ? (
                      <Badge tone="success">연결됨</Badge>
                    ) : (
                      <Button
                        size="sm"
                        aria-label={`${hit.title} 추가`}
                        disabled={busy !== null}
                        onClick={() =>
                          void perform('추가하는 중…', () => actions.add(topic.id, hit.analysisId))
                        }
                      >
                        추가
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>

        {/* live 영역은 비어 있어도 트리에 남긴다(RunStart와 같은 규칙). */}
        <p role="status" className={styles.note}>
          {busy}
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
