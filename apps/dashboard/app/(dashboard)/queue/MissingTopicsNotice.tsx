'use client';
import { useState, useTransition } from 'react';
import { Button, Card } from '@galley/ui';
import type { MissingResolveResult, MissingTopicView } from '../../../lib/queue-missing';
import styles from './MissingTopicsNotice.module.css';

// 파일에서 사라졌는데 실행 이력이 붙어 있어 자동으로 내리지 않은 항목들. 제목 오타를 고치면
// 파서에게는 "줄 삭제 + 줄 추가"로 보이므로, 이력이 갈라지기 전에 사람에게 묻는다
// (decisions/queue-sync-direction.md "사라진 줄 처리").
export function MissingTopicsNotice({
  topics,
  moveToHold,
  keep,
}: {
  topics: MissingTopicView[];
  moveToHold: (topicId: string) => Promise<MissingResolveResult>;
  keep: (topicId: string) => Promise<MissingResolveResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (topics.length === 0) return null;

  const resolve = (action: (topicId: string) => Promise<MissingResolveResult>, topicId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await action(topicId);
      // 성공하면 액션이 화면을 다시 그려 이 항목이 목록에서 빠진다.
      if (!result.ok) setError(result.error.message);
    });
  };

  return (
    <Card className={styles.notice}>
      <h2 className={styles.title}>파일에서 사라진 주제가 있습니다</h2>
      <p className={styles.hint}>
        실행 이력이 있어 자동으로 옮기지 않았습니다. 제목을 고치신 거라면 그대로 두세요 — 고친 줄이
        새 주제로 잡혀 이력이 갈라집니다.
      </p>
      {error !== null ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <ul className={styles.list}>
        {topics.map((topic) => (
          <li key={topic.id} className={styles.item}>
            <div className={styles.text}>
              <span className={styles.topic}>{topic.title}</span>
              <span className={styles.meta}>실행 {topic.runCount}건</span>
            </div>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => resolve(moveToHold, topic.id)}
              >
                보류로 옮기기
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => resolve(keep, topic.id)}
              >
                그대로 두기
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
