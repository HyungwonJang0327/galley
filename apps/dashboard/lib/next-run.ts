// 홈 "다음 실행" 카드 모델: 대기 맨 위 1개(크게) + 그다음 최대 3개(작은 행) — layout.md §4.
// 순서는 주제_큐.md 대기 섹션 그대로(파일이 진실).
import type { QueueSections } from '@galley/pipeline';

export interface NextRunTopic {
  title: string;
  /** 대기 섹션 항목은 보통 카테고리가 없다(카테고리는 후보 ### 소제목). */
  category: string | undefined;
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
  const toTopic = (topic: { title: string; category: string | null }): NextRunTopic => ({
    title: topic.title,
    category: topic.category ?? undefined,
  });

  return {
    top: first ? toTopic(first) : undefined,
    rest: others.slice(0, REST_LIMIT).map(toTopic),
  };
}
