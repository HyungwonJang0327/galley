import { Badge, Tooltip } from 'galley-ui';
import type { QueueRowSeriesView } from '../../../lib/queue-view';
import styles from './QueueRowTitle.module.css';

// 큐 행 제목 — 시리즈 편이면 앞에 배지(`A-1`, 중립 톤)와 툴팁(시리즈명 · N/M편). 태그는 제목 텍스트에 섞지 않는다
// (정렬·검색·DnD 데이터는 제목 문자열 그대로 — decisions/series.md). 서버·클라이언트 어디서든 그린다(판정은 lib/queue-view).
export function QueueRowTitle({
  title,
  series,
}: {
  title: string;
  series: QueueRowSeriesView | undefined;
}) {
  if (series === undefined) return <>{title}</>;
  const badge = (
    <Badge tone="neutral" className={styles.tag} aria-label={`시리즈 ${series.label}`}>
      {series.label}
    </Badge>
  );
  return (
    <>
      {series.tooltip === undefined ? badge : <Tooltip trigger={badge} content={series.tooltip} />}
      {title}
    </>
  );
}
