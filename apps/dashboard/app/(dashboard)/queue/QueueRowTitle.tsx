import { Badge, Tooltip } from 'galley-ui';
import type { QueueRowSeriesView } from '../../../lib/queue-view';
import styles from './QueueRowTitle.module.css';

// 큐 행 제목 — 시리즈 편이면 앞에 배지(`A-1`, 중립 톤)와 툴팁(시리즈명 · N/M편). 태그는 제목 텍스트에 섞지 않는다
// (정렬·검색·DnD 데이터는 제목 문자열 그대로 — decisions/series.md). 서버·클라이언트 어디서든 그린다(판정은 lib/queue-view).
// 접근성(BX5 리뷰 M1·M2): 배지는 role="img"로 이름을 갖고(generic span은 aria-label이 무시된다), 툴팁 내용은 이름에도
// 넣는다 — 툴팁은 마우스 보조. 툴팁이 있을 때만 포커스 가능하게 해 키보드로도 열린다.
export function QueueRowTitle({
  title,
  series,
}: {
  title: string;
  series: QueueRowSeriesView | undefined;
}) {
  if (series === undefined) return <>{title}</>;
  const name =
    series.tooltip === undefined
      ? `시리즈 ${series.label}`
      : `시리즈 ${series.label}, ${series.tooltip}`;
  const badge = (
    <Badge
      tone="neutral"
      className={styles.tag}
      role="img"
      aria-label={name}
      tabIndex={series.tooltip === undefined ? undefined : 0}
    >
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
