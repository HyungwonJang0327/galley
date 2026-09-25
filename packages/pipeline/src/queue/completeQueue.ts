// 주제를 완료로 옮기는 순수 함수 — 완료 줄은 `- YYYY-MM-DD [A-1] <글 제목> (<메모>, posts/<슬러그>)`(스케줄 실행 결과와 같은 형식,
// decisions/series.md). 시리즈 태그는 줄이 들고 간다. 파일 쓰기·DB 재적재는 호출하는 쪽(B3a·Phase 2)이 moveQueueTopic과 같은 순서로.
import type { ParsedQueue, QueueStatus } from './queueFile.ts';

export interface CompleteTopicInput {
  /** 지금 섹션(완료 제외). */
  from: Exclude<QueueStatus, '완료'>;
  /** from 섹션 안 0기반 위치(카테고리 필터 전 기준). */
  index: number;
  /** 그 위치에 있어야 할 제목(태그 없는 원문). 다르면 파일이 그새 바뀐 것으로 보고 옮기지 않는다. */
  title: string;
  /** 완료일 `YYYY-MM-DD`. */
  completedOn: string;
  /** 발행한 글 제목(큐 제목과 다를 수 있다). 시리즈 표기(`| 시리즈명 N편`)는 붙이지 않은 것. */
  articleTitle: string;
  /** 산출물 폴더 슬러그 — `posts/<슬러그>`. */
  slug: string;
  /** 괄호 메모(예: `2023 글 리라이트`). posts 항 앞에 쉼표로. */
  note?: string;
}

export type CompleteTopicFailure =
  /** index·title이 파일과 다름(그새 파일이 바뀜) */
  | 'TOPIC_MISMATCH'
  /** 날짜·슬러그·글 제목 형식이 틀림 */
  | 'INVALID_COMPLETION';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** 슬러그는 topicSlug 산출물 모양 — 공백·괄호·쉼표가 들어가면 완료 줄 괄호가 깨진다. */
const SLUG = /^[^\s(),，（）/]+$/;

/** 완료 줄 제목 부분 — `<글 제목> (<메모>, posts/<슬러그>)`. */
export function completedTitle(
  input: Pick<CompleteTopicInput, 'articleTitle' | 'slug' | 'note'>,
): string {
  const note = input.note?.trim();
  return `${input.articleTitle.trim()} (${note ? `${note}, ` : ''}posts/${input.slug})`;
}

/**
 * 옮긴 큐를 새로 만든다(입력 불변). 완료 섹션 **맨 끝**(날짜 오름차순 — 실제 파일 모양)에 붙이고, 카테고리는 벗고
 * 시리즈 태그는 유지한다. 후보에서 빠지면 뒤쪽 정의 줄 위치를 당긴다(moveTopic과 같은 규칙).
 */
export function completeTopic(
  queue: ParsedQueue,
  input: CompleteTopicInput,
): { ok: true; queue: ParsedQueue } | { ok: false; code: CompleteTopicFailure } {
  const { from, index, title } = input;
  const source = queue.sections[from];
  const topic = source[index];
  if (!topic || topic.title !== title) return { ok: false, code: 'TOPIC_MISMATCH' };
  if (!DATE.test(input.completedOn) || !SLUG.test(input.slug) || input.articleTitle.trim() === '')
    return { ok: false, code: 'INVALID_COMPLETION' };

  const done = {
    title: completedTitle(input),
    completedOn: input.completedOn,
    ...(topic.series === undefined ? {} : { series: topic.series }),
  };
  const sections = {
    ...queue.sections,
    [from]: source.filter((_, i) => i !== index),
    완료: [...queue.sections.완료, done],
  };
  const seriesDefs =
    from === '후보'
      ? queue.seriesDefs.map((def) =>
          def.position > index ? { ...def, position: def.position - 1 } : def,
        )
      : queue.seriesDefs;
  return { ok: true, queue: { preamble: queue.preamble, sections, seriesDefs } };
}
