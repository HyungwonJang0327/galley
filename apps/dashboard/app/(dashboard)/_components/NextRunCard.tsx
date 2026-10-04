import Link from 'next/link';
import { Button, Card, EmptyState, ListRow, ListRows } from 'galley-ui';
import type { NextRunView } from '../../../lib/next-run';
import { RunStartButton } from './RunStart';
import styles from './NextRunCard.module.css';

// 홈 "다음 실행" 카드(layout.md §4). 표현 전용 — 데이터는 홈 페이지가 넘긴다.
// `지금 실행`은 실행 시작 Dialog를 연다(큐와 같은 Dialog — 홈 페이지가 RunStartProvider로 감싼다).

export function NextRunCard({ view }: { view: NextRunView }) {
  return (
    <Card>
      <h2 className={styles.title}>다음 실행</h2>
      {view.top === undefined ? (
        <EmptyState
          message="대기 중인 주제가 없습니다. 후보에서 골라 주세요."
          action={
            <Button variant="secondary" size="sm" render={<Link href="/queue?tab=candidates" />}>
              후보 보기
            </Button>
          }
        />
      ) : (
        <>
          <div className={styles.top}>
            <div className={styles.topBody}>
              <p className={styles.topTitle}>{view.top.title}</p>
              {view.top.category !== undefined ? (
                <p className={styles.topMeta}>{view.top.category}</p>
              ) : null}
            </div>
            <div className={styles.actions}>
              <RunStartButton
                topic={{ id: view.top.id, title: view.top.title }}
                disabledReason={view.top.runDisabledReason}
              >
                지금 실행
              </RunStartButton>
              <Button variant="secondary" render={<Link href="/queue?tab=waiting" />}>
                큐 편집
              </Button>
            </div>
          </div>
          {view.rest.length > 0 ? (
            <ListRows>
              {view.rest.map((topic) => (
                <ListRow key={topic.title} title={topic.title} meta={topic.category} />
              ))}
            </ListRows>
          ) : null}
        </>
      )}
    </Card>
  );
}
