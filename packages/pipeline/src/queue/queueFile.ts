// 주제_큐.md 파서·라이터. 파일이 큐의 진실(SoT) — decisions/queue-sync-direction.md.
// 라운드트립 기준은 "구조상 동일"(섹션 구조·줄 순서·완료 날짜 유지). 빈 줄 등 표기는 정규화한다.
// 시리즈 표기(편 줄 태그 `[A-1]`·후보 `### 시리즈` 아래 정의 줄)도 되돌린다 — decisions/series.md.
import { SERIES_TAG } from './normalizeTitle.ts';

export type QueueStatus = '대기' | '후보' | '보류' | '완료';

export interface QueueTopic {
  title: string;
  /** 후보 섹션 ### 소제목(있을 때만). */
  category?: string;
  /** 완료 섹션 날짜 접두 YYYY-MM-DD(완료 항목만). */
  completedOn?: string;
  /** 편 줄 태그 `[A-1]`(있을 때만). `title`에는 태그가 없다 — 라이터가 다시 붙인다. */
  series?: SeriesTag;
}

export interface SeriesTag {
  /** 시리즈 키(알파벳 한 글자). */
  key: string;
  /** 편 번호(1부터). */
  episode: number;
}

/** 후보 `### 시리즈…` 소제목 아래의 정의 줄 `시리즈 A. <이름> (<메모>)`. */
export interface SeriesDef {
  key: string;
  name: string;
  /** 괄호 메모(있을 때만). `ja: <일본어 표기>` 항이 들어갈 수 있다 — 지금은 보존만. */
  note?: string;
  /** 정의 줄이 있던 후보 ### 소제목. */
  category: string;
  /** 후보 배열에서 이 정의 줄 바로 뒤 항목의 위치(뒤에 항목이 없으면 후보 길이). */
  position: number;
}

export interface ParsedQueue {
  /** 첫 '## ' 헤더 이전 원문(H1+안내). 그대로 보존. */
  preamble: string;
  sections: Record<QueueStatus, QueueTopic[]>;
  /** 시리즈 정의 줄(파일 순서). 파일을 다시 쓸 때 같은 자리로 돌아간다 — 빠뜨리면 되쓰기 한 번에 사라진다. */
  seriesDefs: SeriesDef[];
}

const STATUS_ORDER: QueueStatus[] = ['대기', '후보', '보류', '완료'];
const H2 = /^##\s+(대기|후보|보류|완료)\s*$/;
const H3 = /^###\s+(.*\S)\s*$/;
const ITEM = /^-\s+(.*)$/;
const COMPLETED = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/;
/** 정의 줄을 인정하는 후보 소제목(`### 시리즈 — 사이드프로젝트 …`). 다른 소제목 아래의 `시리즈 A.` 줄은 무시한다. */
const SERIES_CATEGORY = /^시리즈/;
const SERIES_DEF = /^시리즈 ([A-Z])\.\s+(.+?)(?:\s*[(（](.*)[)）])?\s*$/;

/** 줄 본문(완료 날짜 뗀 뒤) → 제목 + 시리즈 태그. */
function parseTopicText(text: string): Pick<QueueTopic, 'title' | 'series'> {
  const tag = text.match(SERIES_TAG);
  if (!tag) return { title: text };
  return {
    title: text.slice(tag[0].length),
    series: { key: tag[1] ?? '', episode: Number(tag[2]) },
  };
}

function topicLine(topic: QueueTopic): string {
  const date = topic.completedOn ? `${topic.completedOn} ` : '';
  const tag = topic.series ? `[${topic.series.key}-${topic.series.episode}] ` : '';
  return `- ${date}${tag}${topic.title}`;
}

function seriesDefLine(def: SeriesDef): string {
  return `시리즈 ${def.key}. ${def.name}${def.note === undefined ? '' : ` (${def.note})`}`;
}

export function parseQueue(raw: string): ParsedQueue {
  const sections: Record<QueueStatus, QueueTopic[]> = { 대기: [], 후보: [], 보류: [], 완료: [] };
  const seriesDefs: SeriesDef[] = [];
  const preambleLines: string[] = [];
  let current: QueueStatus | null = null;
  let category: string | undefined;

  for (const line of raw.split('\n')) {
    const h2 = line.match(H2);
    if (h2) {
      current = h2[1] as QueueStatus;
      category = undefined;
      continue;
    }
    if (current === null) {
      preambleLines.push(line);
      continue;
    }
    const h3 = line.match(H3);
    if (h3) {
      category = h3[1];
      continue;
    }
    const item = line.match(ITEM);
    if (!item) {
      const seriesCategory =
        current === '후보' && category !== undefined && SERIES_CATEGORY.test(category)
          ? category
          : undefined;
      const def = seriesCategory === undefined ? null : line.match(SERIES_DEF);
      if (def && seriesCategory !== undefined) {
        seriesDefs.push({
          key: def[1] ?? '',
          name: def[2] ?? '',
          ...(def[3] === undefined ? {} : { note: def[3] }),
          category: seriesCategory,
          position: sections.후보.length,
        });
      }
      continue; // 빈 줄 등은 무시(정규화)
    }

    const text = item[1] ?? '';
    if (current === '완료') {
      const c = text.match(COMPLETED);
      sections.완료.push(
        c ? { ...parseTopicText(c[2] ?? ''), completedOn: c[1] ?? '' } : parseTopicText(text),
      );
    } else if (current === '후보' && category !== undefined) {
      sections.후보.push({ ...parseTopicText(text), category });
    } else {
      sections[current].push(parseTopicText(text));
    }
  }

  return { preamble: preambleLines.join('\n').replace(/\s+$/, ''), sections, seriesDefs };
}

type SectionEntry =
  | { kind: 'topic'; topic: QueueTopic; category: string | undefined }
  | { kind: 'def'; def: SeriesDef; category: string };

/** 섹션의 줄 순서 — 후보는 정의 줄을 `position` 앞에 끼운다(범위 밖이면 끝). */
function sectionEntries(queue: ParsedQueue, status: QueueStatus): SectionEntry[] {
  const topics = queue.sections[status];
  const defs = status === '후보' ? queue.seriesDefs : [];
  const entries: SectionEntry[] = [];
  const defsAt = (i: number, last: boolean) =>
    defs
      .filter((def) => (last ? def.position >= i : def.position === i))
      .map((def): SectionEntry => ({ kind: 'def', def, category: def.category }));
  topics.forEach((topic, i) => {
    entries.push(...defsAt(i, false), { kind: 'topic', topic, category: topic.category });
  });
  entries.push(...defsAt(topics.length, true));
  return entries;
}

export function serializeQueue(queue: ParsedQueue): string {
  const blocks: string[] = [];
  const preamble = queue.preamble.replace(/\s+$/, '');
  if (preamble) blocks.push(preamble);

  for (const status of STATUS_ORDER) {
    const lines: string[] = [`## ${status}`, ''];
    let category: string | undefined;
    for (const entry of sectionEntries(queue, status)) {
      if (status === '후보' && entry.category !== category) {
        category = entry.category;
        if (category !== undefined) {
          if (lines[lines.length - 1] !== '') lines.push('');
          lines.push(`### ${category}`, '');
        }
      }
      if (entry.kind === 'def') {
        // 정의 줄 앞에는 빈 줄 하나, 편 줄은 바로 아래(실제 파일 모양).
        if (lines[lines.length - 1] !== '') lines.push('');
        lines.push(seriesDefLine(entry.def));
      } else {
        lines.push(topicLine(entry.topic));
      }
    }
    blocks.push(lines.join('\n').replace(/\n+$/, ''));
  }

  return blocks.join('\n\n') + '\n';
}
