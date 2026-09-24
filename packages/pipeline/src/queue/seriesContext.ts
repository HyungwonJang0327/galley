// 시리즈 컨텍스트 — 글쓰기·발행정보 단계가 "○○ 시리즈 N편, 이전·다음 편"을 알 때 쓴다(decisions/series.md 데이터 흐름).
// **읽기 전용**: 파일을 한 번 읽어 정의 줄(이름·ja:)과 편 줄(편 목록·슬러그·URL)을 얻고, DB는 편 줄 → QueueItem.id
// 조회에만 쓴다. 적재하지 않는다 — 워커가 부르므로 대시보드 적재와 프로세스 사이에서 경쟁하면 같은 줄이 두 행이 된다
// (importChain은 한 프로세스 안에서만 직렬화한다, BX2 리뷰 H1). 파일에서 사라진 행은 파일 줄이 없으니 저절로 빠진다.
import type { PrismaClient } from '@prisma/client';
import type { Storage } from '../storage/Storage.ts';
import { indexByTitle, takeMatch } from './importQueue.ts';
import { normalizeTopicTitle, stripTopicHints, trailingUrl } from './normalizeTitle.ts';
import { parseQueue, type ParsedQueue, type QueueStatus } from './queueFile.ts';

export interface SeriesEpisode {
  /** QueueItem.id — 주제 키. 아직 적재되지 않은 새 줄이면 없다(대시보드가 다음 적재 때 만든다). */
  topicId?: string;
  episodeNo: number;
  /** 표시·프롬프트용 제목(괄호 힌트·URL 뗌). */
  title: string;
  status: QueueStatus;
  /** 완료 줄 `(posts/<슬러그>)`(완료 편만). */
  slug?: string;
  /** 완료 줄 끝 벨로그 URL(완료 편만, 사람이 붙였을 때). */
  velogUrl?: string;
  /** 태그 바로 뒤 `(기존 글)` — 이미 발행된 편. 실행 대상이 아니다. */
  alreadyPublished: boolean;
}

export interface SeriesContext {
  key: string;
  name: string;
  /** 정의 줄 메모의 `ja:` 항. 없으면 undefined — Zenn 단계가 한글명을 쓴다. */
  nameJa?: string;
  /** 파일에 지금 있는 편(네 섹션 모두), 편 번호순. */
  episodes: SeriesEpisode[];
}

export type SeriesContextFailure =
  /** 편 줄 태그는 있는데 후보 `### 시리즈` 아래 정의 줄이 없다 — 이름을 지어내지 않는다. */
  'SERIES_NOT_DEFINED';

export type SeriesContextResult =
  { ok: true; series: SeriesContext } | { ok: false; code: SeriesContextFailure };

/** 편 줄 → id 조회에 쓰는 DB 행. 생성 순으로 넘긴다(적재의 매칭 규칙과 같게). */
export interface SeriesTopicRow {
  id: string;
  title: string;
  status: string;
}

const STATUS_ORDER: readonly QueueStatus[] = ['대기', '후보', '보류', '완료'];
const ALREADY_PUBLISHED = /^\s*[(（]기존 글[)）]/;
const POSTS_SLUG = /[(（][^)）]*?posts\/([^\s,，)）]+)/;
const JA_TERM = /^ja:\s*(.+)$/i;

/** 정의 줄 메모에서 `ja:` 항(쉼표 구분). */
export function seriesNameJa(note: string | undefined): string | undefined {
  for (const term of (note ?? '').split(/[,，]/)) {
    const ja = JA_TERM.exec(term.trim())?.[1]?.trim();
    if (ja) return ja;
  }
  return undefined;
}

/**
 * 파싱한 큐 + DB 행 → 컨텍스트(순수). 편은 파일에 있는 그 시리즈 편 줄 전부(네 섹션 — 직접 보류한 편도 센다, 편 번호가
 * 어긋나지 않게), 편 번호순·겹치면 파일 순서(섹션 → 줄). id는 적재와 같은 매칭(정규화 제목, 같은 섹션 우선).
 */
export function buildSeriesContext(
  key: string,
  queue: ParsedQueue,
  rows: readonly SeriesTopicRow[],
): SeriesContextResult {
  const def = queue.seriesDefs.find((d) => d.key === key);
  if (def === undefined) return { ok: false, code: 'SERIES_NOT_DEFINED' };

  const byTitle = indexByTitle(rows);
  const episodes: SeriesEpisode[] = [];
  for (const status of STATUS_ORDER) {
    for (const topic of queue.sections[status]) {
      // 매칭은 모든 줄에 대해 파일 순서로 소비해야 적재와 같은 짝이 나온다(같은 제목이 여러 줄일 때).
      const row = takeMatch(byTitle.get(normalizeTopicTitle(topic.title)), status);
      if (topic.series?.key !== key) continue;
      const done = status === '완료';
      const slug = done ? POSTS_SLUG.exec(topic.title)?.[1] : undefined;
      const velogUrl = done ? trailingUrl(topic.title) : undefined;
      episodes.push({
        ...(row === undefined ? {} : { topicId: row.id }),
        episodeNo: topic.series.episode,
        title: stripTopicHints(topic.title),
        status,
        ...(slug === undefined ? {} : { slug }),
        ...(velogUrl === undefined ? {} : { velogUrl }),
        alreadyPublished: ALREADY_PUBLISHED.test(topic.title),
      });
    }
  }
  // 안정 정렬 — 편 번호가 겹치면(사람 실수) 위에서 쌓은 파일 순서가 남는다.
  episodes.sort((a, b) => a.episodeNo - b.episodeNo);

  const nameJa = seriesNameJa(def.note);
  return {
    ok: true,
    series: { key, name: def.name, ...(nameJa === undefined ? {} : { nameJa }), episodes },
  };
}

/** 파일을 한 번 읽어 그 시리즈의 컨텍스트를 만든다. 적재하지 않는다(위 머리 주석). */
export async function getSeriesContext(
  deps: { storage: Storage; prisma: PrismaClient },
  seriesKey: string,
): Promise<SeriesContextResult> {
  const queue = parseQueue(await deps.storage.readQueueFile());
  const rows = await deps.prisma.queueItem.findMany({
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  return buildSeriesContext(seriesKey, queue, rows);
}
