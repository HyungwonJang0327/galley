import { Badge } from 'galley-ui';
import type { QueueGroupView } from '../../../lib/queue-view';
import styles from './QueueGroupHeader.module.css';

// 후보 탭의 시리즈 정의 줄 — 행 사이 그룹 헤더. ui에 그룹 헤더 컴포넌트가 없어 앱 마크업으로 둔다(2026-09-25 사용자
// 결정, BX5). ListRows(<ul>) 안의 <li>라 목록 의미는 유지하고, 행이 아님을 aria-label로 알린다.
export function QueueGroupHeader({ group }: { group: QueueGroupView }) {
  return (
    <li className={styles.header} aria-label={`시리즈 ${group.key} ${group.name}`}>
      <Badge tone="neutral">{group.key}</Badge>
      <span className={styles.name}>{group.name}</span>
      {group.hint === undefined ? null : <span className={styles.hint}>{group.hint}</span>}
    </li>
  );
}
