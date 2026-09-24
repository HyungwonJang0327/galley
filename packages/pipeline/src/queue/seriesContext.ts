// 시리즈 컨텍스트 — 글쓰기·발행정보 단계가 "○○ 시리즈 N편, 이전·다음 편"을 알 때 쓴다(decisions/series.md 데이터 흐름).
// 이름·일본어 표기는 파일의 정의 줄, 편 목록은 DB(적재가 파일에서 재생성한 seriesKey·episodeNo), 슬러그·벨로그 URL은 완료 줄.
import type { PrismaClient } from '@prisma/client';
import type { Storage } from '../storage/Storage.ts';
import { HOLD_REASON_REMOVED, importQueueFromFile } from './importQueue.ts';
import { stripTopicHints, trailingUrl } from './normalizeTitle.ts';
import { parseQueue, type QueueStatus, type SeriesDef } from './queueFile.ts';

export interface SeriesEpisode {
  /** QueueItem.id — 주제 키. */
  topicId: string;
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

/** 적재된 행 중 컨텍스트가 읽는 것. */
export interface SeriesEpisodeRow {
  id: string;
  title: string;
  status: string;
  order: number;
  episodeNo: number | null;
  missingSince: Date | null;
  holdReason: string | null;
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

function isQueueStatus(value: string): value is QueueStatus {
  return (STATUS_ORDER as readonly string[]).includes(value);
}

/** 정의 줄 + 적재된 행 → 컨텍스트(순수). 파일에서 사라진 행(확인 대기·자동 보류)은 편으로 세지 않는다. */
export function buildSeriesContext(
  key: string,
  defs: readonly SeriesDef[],
  rows: readonly SeriesEpisodeRow[],
): SeriesContextResult {
  const def = defs.find((d) => d.key === key);
  if (def === undefined) return { ok: false, code: 'SERIES_NOT_DEFINED' };

  const found: { episode: SeriesEpisode; order: number }[] = [];
  for (const row of rows) {
    if (row.episodeNo === null || !isQueueStatus(row.status)) continue;
    if (row.missingSince !== null || row.holdReason === HOLD_REASON_REMOVED) continue;
    const done = row.status === '완료';
    const slug = done ? POSTS_SLUG.exec(row.title)?.[1] : undefined;
    const velogUrl = done ? trailingUrl(row.title) : undefined;
    found.push({
      episode: {
        topicId: row.id,
        episodeNo: row.episodeNo,
        title: stripTopicHints(row.title),
        status: row.status,
        ...(slug === undefined ? {} : { slug }),
        ...(velogUrl === undefined ? {} : { velogUrl }),
        alreadyPublished: ALREADY_PUBLISHED.test(row.title),
      },
      order: row.order,
    });
  }
  // 편 번호가 겹치면(사람 실수) 파일 순서(섹션 → 줄)로 — 결정적이게.
  found.sort(
    (a, b) =>
      a.episode.episodeNo - b.episode.episodeNo ||
      STATUS_ORDER.indexOf(a.episode.status) - STATUS_ORDER.indexOf(b.episode.status) ||
      a.order - b.order,
  );

  const nameJa = seriesNameJa(def.note);
  return {
    ok: true,
    series: {
      key,
      name: def.name,
      ...(nameJa === undefined ? {} : { nameJa }),
      episodes: found.map(({ episode }) => episode),
    },
  };
}

/** 파일을 다시 적재한 뒤(정의 줄과 행이 같은 시점) 그 시리즈의 컨텍스트를 만든다. */
export async function getSeriesContext(
  deps: { storage: Storage; prisma: PrismaClient },
  seriesKey: string,
): Promise<SeriesContextResult> {
  await importQueueFromFile(deps);
  const parsed = parseQueue(await deps.storage.readQueueFile());
  const rows = await deps.prisma.queueItem.findMany({
    where: { seriesKey },
    select: {
      id: true,
      title: true,
      status: true,
      order: true,
      episodeNo: true,
      missingSince: true,
      holdReason: true,
    },
  });
  return buildSeriesContext(seriesKey, parsed.seriesDefs, rows);
}
