// 큐 화면용 로드: 파일(SoT)을 DB에 재적재한 뒤 DB에서 섹션별로 읽는다.
// decisions/queue-sync-direction.md "로드 시 파일을 다시 읽어 DB 갱신".
import type { PrismaClient } from '@prisma/client';
import type { Storage } from '../storage/Storage.ts';
import { importQueueFromFile } from './importQueue.ts';
import type { QueueStatus } from './queueFile.ts';
import { isAlreadyPublished } from './topicHints.ts';

/** 편 줄 태그(DB 캐시 seriesKey·episodeNo)에서 온 시리즈 표시 정보. 이름·편 수는 파일에서(`loadQueueSeries`). */
export interface QueueEntrySeries {
  key: string;
  episode: number;
  /** `(기존 글)` 편 — 이미 발행돼 실행 대상이 아니다(decisions/series.md). 화면은 실행을 막고 사유를 보인다. */
  alreadyPublished: boolean;
}

/** 화면에 보여 줄 주제 한 줄. */
export interface QueueEntry {
  /** QueueItem.id — 주제 키(실행 시작·실행 상세 연결). */
  id: string;
  title: string;
  category: string | null;
  completedOn: string | null;
  /** 시리즈 편이면 태그, 아니면 null. */
  series: QueueEntrySeries | null;
}

export type QueueSections = Record<QueueStatus, QueueEntry[]>;

const STATUSES: readonly string[] = ['대기', '후보', '보류', '완료'];

function isQueueStatus(value: string): value is QueueStatus {
  return STATUSES.includes(value);
}

export async function loadQueueSections(deps: {
  storage: Storage;
  prisma: PrismaClient;
}): Promise<QueueSections> {
  await importQueueFromFile(deps);
  const items = await deps.prisma.queueItem.findMany({
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      status: true,
      category: true,
      completedOn: true,
      seriesKey: true,
      episodeNo: true,
    },
  });

  const sections: QueueSections = { 대기: [], 후보: [], 보류: [], 완료: [] };
  for (const { id, status, title, category, completedOn, seriesKey, episodeNo } of items) {
    // status는 DB에서 문자열(스키마에 enum 없음). 방금 파일에서 적재했으므로 네 값뿐이다.
    if (!isQueueStatus(status)) continue;
    // 두 컬럼은 적재가 항상 같이 채운다 — 한쪽만 있으면 시리즈로 보지 않는다.
    const series: QueueEntrySeries | null =
      seriesKey !== null && episodeNo !== null
        ? { key: seriesKey, episode: episodeNo, alreadyPublished: isAlreadyPublished(title) }
        : null;
    sections[status].push({ id, title, category, completedOn, series });
  }
  return sections;
}
