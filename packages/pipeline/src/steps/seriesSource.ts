// 워커의 시리즈 편 정보 조회(WorkerDeps.series) — 주제 id → DB의 seriesKey → 큐 파일을 읽는 읽기 전용 컨텍스트 → 이 편 정보.
// 적재하지 않는다(getSeriesContext 머리 주석). 조회 실패는 단계 실패로 기록되게 StepFailure로 바꾼다 — 설정·파일 문제는 재시도
// 불가, DB 일시 오류(SQLITE_BUSY 등)는 재시도 가능.
import type { PrismaClient } from '@prisma/client';
import { buildSeriesContext, getSeriesContext } from '../queue/seriesContext.ts';
import { parseQueue } from '../queue/queueFile.ts';
import type { Storage } from '../storage/Storage.ts';
import { toSeriesStepInfo, type SeriesStepInfo } from './series.ts';
import { StepFailure } from './StepRunner.ts';

const lookupFailed = (error: unknown) =>
  new StepFailure('SERIES_LOOKUP_FAILED', '시리즈 정보를 DB에서 읽지 못했습니다.', true, {
    cause: error,
  });

/**
 * `storage`가 없으면(BLOG_DIR 미설정) 시리즈가 아닌 주제는 그대로, 시리즈 편은 SERIES_SOURCE_UNCONFIGURED로 멈춘다 —
 * 표기 없는 본문이 조용히 나가지 않게(BX3 리뷰 L7, 사용자 결정).
 */
export function createSeriesSource(deps: { storage?: Storage; prisma: PrismaClient }): {
  forTopic(topicId: string): Promise<SeriesStepInfo | undefined>;
} {
  return {
    async forTopic(topicId) {
      let key: string | null;
      try {
        const item = await deps.prisma.queueItem.findUnique({
          where: { id: topicId },
          select: { seriesKey: true },
        });
        key = item?.seriesKey ?? null;
      } catch (error) {
        throw lookupFailed(error);
      }
      if (key === null) return undefined;

      if (deps.storage === undefined)
        throw new StepFailure(
          'SERIES_SOURCE_UNCONFIGURED',
          '시리즈 편인데 워커에 BLOG_DIR이 없어 주제 큐 파일을 읽을 수 없습니다(루트 .env를 확인하세요).',
          false,
        );

      let raw: string;
      try {
        raw = await deps.storage.readQueueFile();
      } catch (error) {
        throw new StepFailure(
          'SERIES_QUEUE_UNREADABLE',
          '시리즈 정보를 읽으려 했지만 주제 큐 파일을 읽지 못했습니다(BLOG_DIR을 확인하세요).',
          false,
          { cause: error },
        );
      }

      let rows: { id: string; title: string; status: string }[];
      try {
        rows = await deps.prisma.queueItem.findMany({
          select: { id: true, title: true, status: true },
          orderBy: { createdAt: 'asc' },
        });
      } catch (error) {
        throw lookupFailed(error);
      }

      const result = buildSeriesContext(key, parseQueue(raw), rows);
      if (!result.ok)
        throw new StepFailure(
          'SERIES_NOT_DEFINED',
          `시리즈 ${key}의 정의 줄이 없습니다. 주제 큐 후보의 "### 시리즈" 아래에 "시리즈 ${key}. <이름>" 줄을 추가하세요.`,
          false,
        );
      const info = toSeriesStepInfo(result.series, topicId);
      // DB에는 시리즈 편인데 파일 편 줄과 짝이 안 맞는다(같은 제목의 다른 행·태그를 바꾸고 아직 적재 전 등) — 표기 없는 본문을
      // 조용히 내지 않고 멈춘다(BX3 리뷰 M6, 사용자 결정).
      if (info === undefined)
        throw new StepFailure(
          'SERIES_EPISODE_NOT_MATCHED',
          `시리즈 ${key}의 편 목록에서 이 주제를 찾지 못했습니다. 큐 화면에서 파일을 다시 불러온 뒤 다시 실행하세요.`,
          false,
        );
      return info;
    },
  };
}

/**
 * 화면(실행 상세)용 조회 — 워커와 달리 값으로 끝난다. 시리즈가 아니거나 정의 줄·편 짝이 없으면 undefined(화면은 시리즈
 * 표시를 생략할 뿐, 실행을 막는 판정은 워커 몫). DB·파일 오류는 그대로 던진다 — 어댑터가 감싼다.
 */
export async function readTopicSeriesInfo(
  deps: { storage: Storage; prisma: PrismaClient },
  topicId: string,
): Promise<SeriesStepInfo | undefined> {
  const item = await deps.prisma.queueItem.findUnique({
    where: { id: topicId },
    select: { seriesKey: true },
  });
  const key = item?.seriesKey ?? null;
  if (key === null) return undefined;
  const result = await getSeriesContext(deps, key);
  if (!result.ok) return undefined;
  return toSeriesStepInfo(result.series, topicId);
}
