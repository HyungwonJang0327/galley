import type { ReactNode } from 'react';
import { PageHeader, Card } from 'galley-ui';
import { RouteBreadcrumb } from './RouteBreadcrumb';
import styles from './Placeholder.module.css';

// 자리 페이지(패턴 A 골격: 제목 → 흰 카드). 내용은 이후 단계에서 채운다.
export function Placeholder({
  title,
  note,
  pathname,
}: {
  title: string;
  note?: ReactNode;
  /** 있으면 제목 위에 경로 표시(메뉴 정의 기준). */
  pathname?: string;
}) {
  return (
    <>
      <PageHeader
        title={title}
        eyebrow={pathname === undefined ? undefined : <RouteBreadcrumb pathname={pathname} />}
      />
      <Card>
        <p className={styles.note}>{note ?? '이 화면은 이후 단계에서 구현합니다.'}</p>
      </Card>
    </>
  );
}
