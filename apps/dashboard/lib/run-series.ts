// 실행 상세 헤더의 시리즈 편 정보(서버 전용) — "○○ 시리즈 N/M편"과 이전·다음 편 제목. 주제 id → DB seriesKey →
// 큐 파일(BLOG_DIR)에서 편 목록. 장식이라 실패해도 상세를 막지 않는다 — 시리즈가 아니거나 못 읽으면 undefined.
import 'server-only';
import { LocalFsStorage, prisma, readTopicSeriesInfo, type SeriesStepInfo } from '@galley/pipeline';

export interface RunSeriesView {
  /** `앱 만들기 시리즈 2/3편` */
  summary: string;
  previousTitle: string | undefined;
  nextTitle: string | undefined;
}

/** 단계 정보 → 헤더 표시 값(순수). */
export function runSeriesView(info: SeriesStepInfo): RunSeriesView {
  return {
    summary: `${info.name} 시리즈 ${info.episodeNo}/${info.total}편`,
    previousTitle: info.previous?.title,
    nextTitle: info.next?.title,
  };
}

export async function getRunSeries(topicId: string): Promise<RunSeriesView | undefined> {
  const blogDir = process.env.BLOG_DIR;
  if (!blogDir) return undefined;
  try {
    const info = await readTopicSeriesInfo(
      { storage: new LocalFsStorage(blogDir), prisma },
      topicId,
    );
    return info === undefined ? undefined : runSeriesView(info);
  } catch {
    return undefined;
  }
}
