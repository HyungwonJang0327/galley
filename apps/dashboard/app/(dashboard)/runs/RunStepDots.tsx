import type { TimelineStatus } from '@galley/ui';
import styles from './RunStepDots.module.css';

export interface RunStepDotsProps {
  dots: { name: string; status: TimelineStatus; label: string }[];
  /** 전체 접근성 이름(예: "단계 진행 2/6"). */
  label: string;
}

/** 목록 행 좌측 6단계 원형 진행 인디케이터. 색은 타임라인 마커와 같은 토큰. */
export function RunStepDots({ dots, label }: RunStepDotsProps) {
  return (
    <span className={styles.dots} role="img" aria-label={label}>
      {dots.map((dot) => (
        <span key={dot.name} className={styles.dot} data-status={dot.status} title={dot.label} />
      ))}
    </span>
  );
}
