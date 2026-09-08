import type { ReactNode } from 'react';
import { PageHeader, Card } from '@galley/ui';
import styles from './Placeholder.module.css';

// 자리 페이지(패턴 A 골격: 제목 → 흰 카드). 내용은 이후 단계에서 채운다.
export function Placeholder({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className={styles.note}>{note ?? '이 화면은 이후 단계에서 구현합니다.'}</p>
      </Card>
    </>
  );
}
