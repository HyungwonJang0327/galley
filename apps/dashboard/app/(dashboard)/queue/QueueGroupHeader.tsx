import { Badge } from 'galley-ui';
import type { QueueGroupView } from '../../../lib/queue-view';
import styles from './QueueGroupHeader.module.css';

// 후보 탭의 시리즈 정의 줄 — 행 사이 그룹 헤더. ui에 그룹 헤더 컴포넌트가 없어 앱 마크업으로 둔다(2026-09-25 사용자
// 결정, BX5). ListRows(<ul>) 안의 <li>라 목록 의미는 유지한다. 키 배지가 "시리즈 D"로 읽히게 role="img" 이름을 준다
// (li·span의 aria-label은 보조기기가 무시할 수 있다 — BX5 리뷰 M2).
export function QueueGroupHeader({ group }: { group: QueueGroupView }) {
  return (
    <li className={styles.header}>
      <Badge tone="neutral" role="img" aria-label={`시리즈 ${group.key}`}>
        {group.key}
      </Badge>
      <span className={styles.name}>{group.name}</span>
      {group.hint === undefined ? null : <span className={styles.hint}>{group.hint}</span>}
    </li>
  );
}
