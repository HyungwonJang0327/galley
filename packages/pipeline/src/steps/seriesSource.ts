// 워커의 시리즈 편 정보 조회(WorkerDeps.series) — 주제 id → DB의 seriesKey → 큐 파일을 읽는 읽기 전용 컨텍스트 → 이 편 정보.
// 적재하지 않는다(getSeriesContext 머리 주석). 조회 실패는 단계 실패로 기록되게 StepFailure로 바꾼다.
import type { PrismaClient } from '@prisma/client';
import { getSeriesContext } from '../queue/seriesContext.ts';
import type { Storage } from '../storage/Storage.ts';
import { toSeriesStepInfo, type SeriesStepInfo } from './series.ts';
import { StepFailure } from './StepRunner.ts';

export function createSeriesSource(deps: { storage: Storage; prisma: PrismaClient }): {
  forTopic(topicId: string): Promise<SeriesStepInfo | undefined>;
} {
  return {
    async forTopic(topicId) {
      const item = await deps.prisma.queueItem.findUnique({
        where: { id: topicId },
        select: { seriesKey: true },
      });
      const key = item?.seriesKey ?? null;
      if (key === null) return undefined;

      let result: Awaited<ReturnType<typeof getSeriesContext>>;
      try {
        result = await getSeriesContext(deps, key);
      } catch (error) {
        throw new StepFailure(
          'SERIES_QUEUE_UNREADABLE',
          '시리즈 정보를 읽으려 했지만 주제 큐 파일을 읽지 못했습니다(BLOG_DIR을 확인하세요).',
          false,
          { cause: error },
        );
      }
      if (!result.ok)
        throw new StepFailure(
          'SERIES_NOT_DEFINED',
          `시리즈 ${key}의 정의 줄이 없습니다. 주제 큐 후보의 "### 시리즈" 아래에 "시리즈 ${key}. <이름>" 줄을 추가하세요.`,
          false,
        );
      return toSeriesStepInfo(result.series, topicId);
    },
  };
}
