// 홈 "다음 실행" 카드 모델: 대기 맨 위 1개(크게) + 그다음 최대 3개(작은 행) — layout.md §4.
// 큐 상단 `맨 위 실행`도 같은 top을 쓴다. 순서는 주제_큐.md 대기 섹션 그대로(파일이 진실).
import type { QueueEntry, QueueSections } from '@galley/pipeline';
import { ALREADY_PUBLISHED_REASON } from './queue-row-menu';

export interface NextRunTopic {
  /** 주제 키 = QueueItem.id — 실행 시작에 넘긴다. */
  id: string;
  title: string;
  /** 대기 섹션 항목은 보통 카테고리가 없다(카테고리는 후보 ### 소제목). */
  category: string | undefined;
  /** 실행할 수 없는 사유(`(기존 글)` 편). 없으면 실행 가능. 행 ⋮과 같은 판정. */
  runDisabledReason: string | undefined;
}

export interface NextRunView {
  /** 맨 위 주제. 대기가 비면 undefined → 카드는 빈 상태. */
  top: NextRunTopic | undefined;
  /** 2~4위(최대 3). */
  rest: NextRunTopic[];
}

const REST_LIMIT = 3;

export function buildNextRunView(sections: QueueSections): NextRunView {
  const [first, ...others] = sections.대기;
  const toTopic = (topic: QueueEntry): NextRunTopic => ({
    id: topic.id,
    title: topic.title,
    category: topic.category ?? undefined,
    runDisabledReason: topic.series?.alreadyPublished ? ALREADY_PUBLISHED_REASON : undefined,
  });

  return {
    top: first ? toTopic(first) : undefined,
    rest: others.slice(0, REST_LIMIT).map(toTopic),
  };
}
