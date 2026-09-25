// 큐 화면용 시리즈 요약 — 정의 줄(이름·자리)과 편 수. 시리즈명·편 목록은 DB에 없고 파일에서 매번 만든다(decisions/series.md).
// 순수 함수 + 파일 한 번 읽는 로더. 적재하지 않는다(loadQueueSections가 이미 했다).
import type { Storage } from '../storage/Storage.ts';
import { parseQueue, type ParsedQueue, type QueueStatus } from './queueFile.ts';

export interface QueueSeriesSummary {
  key: string;
  name: string;
  /** 정의 줄이 있는 후보 소제목(`### 시리즈…`). */
  category: string;
  /** 정의 줄 바로 뒤 후보 항목의 인덱스(카테고리 필터 전, 후보 섹션 기준) — 그룹 헤더가 들어갈 자리. */
  position: number;
  /** 파일에 있는 편 수(네 섹션 전부, M). 편이 없는 시리즈도 유효하다. */
  episodeCount: number;
  /** 상태별 편 수 — 후보에 편이 없을 때 "편 없음 · 대기 N편" 같은 안내에 쓴다. */
  byStatus: Record<QueueStatus, number>;
}

/** 파싱한 큐 → 정의 줄 순서대로 요약(순수). */
export function summarizeQueueSeries(queue: ParsedQueue): QueueSeriesSummary[] {
  const counts = new Map<string, Record<QueueStatus, number>>();
  for (const status of ['대기', '후보', '보류', '완료'] as const)
    for (const topic of queue.sections[status]) {
      if (topic.series === undefined) continue;
      let record = counts.get(topic.series.key);
      if (record === undefined) {
        record = { 대기: 0, 후보: 0, 보류: 0, 완료: 0 };
        counts.set(topic.series.key, record);
      }
      record[status] += 1;
    }

  return queue.seriesDefs.map((def) => {
    const byStatus = counts.get(def.key) ?? { 대기: 0, 후보: 0, 보류: 0, 완료: 0 };
    return {
      key: def.key,
      name: def.name,
      category: def.category,
      position: def.position,
      episodeCount: byStatus.대기 + byStatus.후보 + byStatus.보류 + byStatus.완료,
      byStatus,
    };
  });
}

/** 파일을 한 번 읽어 시리즈 요약을 만든다. */
export async function loadQueueSeries(deps: { storage: Storage }): Promise<QueueSeriesSummary[]> {
  return summarizeQueueSeries(parseQueue(await deps.storage.readQueueFile()));
}
