// 주제_큐.md → SQLite 적재. 파일이 진실(SoT)이지만 **전체 리셋은 하지 않는다** —
// QueueItem.id가 Run의 주제 키라 id가 바뀌면 실행 이력이 끊긴다.
// 정규화 제목으로 기존 항목을 찾아 갱신하고, 못 찾은 줄만 새로 만든다.
// 파일에서 사라진 줄은 지우지 않는다. (decisions/queue-sync-direction.md)
import type { PrismaClient } from '@prisma/client';
import { parseQueue, type ParsedQueue, type QueueStatus } from './queueFile.ts';
import { normalizeTopicTitle } from './normalizeTitle.ts';
import { parseTopicHints, resolveTopicHints, type RepoNameSource } from './topicHints.ts';
import { parseStringArray, serializeStringArray } from '../index/schema.ts';
import { RUN_STATUS } from '../run/stateMachine.ts';
import type { Storage } from '../storage/Storage.ts';

const STATUS_ORDER: QueueStatus[] = ['대기', '후보', '보류', '완료'];

/** 파일에서 사라져 자동으로 내린 항목의 보류 사유. 보류 탭이 `manual`과 구분해 보여준다. */
export const HOLD_REASON_REMOVED = 'removed-from-file';

/** DB에 넣을 QueueItem 행. id·createdAt·updatedAt은 스키마 기본값이 채운다. */
export interface QueueItemRow {
  title: string;
  status: QueueStatus;
  order: number;
  category: string | null;
  completedOn: string | null;
  /** 편 줄 태그의 시리즈 키·편 번호(시리즈 편만). 정의 줄은 행이 아니다. */
  seriesKey: string | null;
  episodeNo: number | null;
  /** 괄호 힌트에서 뽑은 근거 힌트(JSON 배열 문자열 — src/index/schema.ts 헬퍼로만 읽고 쓴다). 재적재 시 재생성. */
  repoNames: string;
  keywords: string;
  period: string | null;
}

/**
 * ParsedQueue를 QueueItem 행 배열로 변환한다(순수). order는 섹션 내 0기반. 제목은 괄호 힌트까지 **원문 그대로**
 * 두고(파일이 진실), 힌트는 여기(파일 → DB 경계)서 뽑아 컬럼으로. `repos`는 힌트의 어느 항이 리포 이름인지 가르는 기준.
 */
export function parsedQueueToRows(
  parsed: ParsedQueue,
  repos: readonly RepoNameSource[] = [],
): QueueItemRow[] {
  const rows: QueueItemRow[] = [];
  for (const status of STATUS_ORDER) {
    parsed.sections[status].forEach((topic, order) => {
      const hints = resolveTopicHints(parseTopicHints(topic.title), repos);
      rows.push({
        title: topic.title,
        status,
        order,
        category: topic.category ?? null,
        completedOn: topic.completedOn ?? null,
        seriesKey: topic.series?.key ?? null,
        episodeNo: topic.series?.episode ?? null,
        repoNames: serializeStringArray(hints.repoNames),
        keywords: serializeStringArray(hints.keywords),
        period: hints.period,
      });
    });
  }
  return rows;
}

/** 파일에서 사라진 항목을 어떻게 할지. 셋 다 **삭제는 하지 않는다**. */
export type MissingDisposition =
  /** 완료 Run이 있다 — 파일 유무로 확정된 상태를 뒤집지 않는다. 그대로 둔다. */
  | 'keep-done'
  /** Run이 붙어 있다 — 제목 수정이 "삭제 + 추가"로 보일 수 있어 확인을 받는다. 표시만 한다. */
  | 'await-confirm'
  /** Run이 없다 — 잃을 것이 없으니 조용히 보류로. */
  | 'hold';

interface ExistingItem {
  id: string;
  title: string;
  status: string;
  order: number;
  category: string | null;
  completedOn: string | null;
  seriesKey: string | null;
  episodeNo: number | null;
  repoNames: string;
  keywords: string;
  period: string | null;
  missingSince: Date | null;
  missingAck: Date | null;
  holdReason: string | null;
  runs: { status: string }[];
}

/**
 * 파일 줄이 기존 행과 내용까지 같은가 — 같으면 update를 건너뛴다. 그래야 `updatedAt`이 "내용이 바뀐 시각"이 되고,
 * 매 요청마다 도는 적재가 자동 연결(autoLinkedAt < updatedAt) 전 주제를 다시 계산하게 만들지 않는다(BE7 리뷰 M1).
 * 되살아난 줄(missingSince·missingAck·holdReason이 남아 있음)은 같지 않다 — 그 표시를 지워야 한다.
 */
export function isUnchanged(item: ExistingItem, row: QueueItemRow): boolean {
  return (
    item.title === row.title &&
    item.status === row.status &&
    item.order === row.order &&
    item.category === row.category &&
    item.completedOn === row.completedOn &&
    item.seriesKey === row.seriesKey &&
    item.episodeNo === row.episodeNo &&
    item.repoNames === row.repoNames &&
    item.keywords === row.keywords &&
    item.period === row.period &&
    item.missingSince === null &&
    item.missingAck === null &&
    item.holdReason === null
  );
}

/** 파일에서 사라진 항목 하나를 어떻게 할지 고른다(순수). */
export function disposeMissing(item: { runs: { status: string }[] }): MissingDisposition {
  if (item.runs.some((run) => run.status === RUN_STATUS.done)) return 'keep-done';
  return item.runs.length > 0 ? 'await-confirm' : 'hold';
}

/** 정규화 제목 → 아직 매칭되지 않은 기존 항목들(먼저 만든 것부터). */
function indexByTitle(items: readonly ExistingItem[]): Map<string, ExistingItem[]> {
  const index = new Map<string, ExistingItem[]>();
  for (const item of items) {
    const key = normalizeTopicTitle(item.title);
    const bucket = index.get(key);
    if (bucket) bucket.push(item);
    else index.set(key, [item]);
  }
  return index;
}

/**
 * 그 줄에 짝지을 기존 항목 하나를 꺼낸다. 같은 제목이 여러 섹션에 있을 수 있으므로
 * (파일에 실제로 그런 경우가 있다) **같은 섹션에 있던 항목을 먼저** 고른다 —
 * 생성 순서로만 고르면 대기/후보의 id가 서로 뒤바뀌어 실행 이력이 엉뚱한 줄에 붙는다.
 */
function takeMatch(
  bucket: ExistingItem[] | undefined,
  status: QueueStatus,
): ExistingItem | undefined {
  if (bucket === undefined || bucket.length === 0) return undefined;
  const sameSection = bucket.findIndex((item) => item.status === status);
  const at = sameSection === -1 ? 0 : sameSection;
  return bucket.splice(at, 1)[0];
}

/**
 * 적재를 직렬화한다. 한 요청에서 셸(사이드바 배지)과 페이지가 **병렬로** 적재를 부르는데,
 * 둘이 동시에 `existing`을 읽으면 서로의 삽입을 보지 못해 같은 줄이 두 행으로 생긴다.
 * (전체 리셋일 때는 뒤 삭제가 앞 삽입을 덮어써서 가려져 있던 문제다.)
 */
let importChain: Promise<void> = Promise.resolve();

/**
 * 주제_큐.md를 읽어 DB에 반영한다. 매칭된 줄은 갱신, 없는 줄은 생성, 사라진 줄은
 * `disposeMissing`이 정한 대로 — 어느 경우에도 행을 지우지 않는다.
 *
 * 동시에 불리면 **차례로** 돈다(위 `importChain`). 파일이 진실이라 뒤 호출이 같은 결과를 낸다.
 */
export function importQueueFromFile(deps: {
  storage: Storage;
  prisma: PrismaClient;
}): Promise<void> {
  const next = importChain.then(
    () => runImport(deps),
    () => runImport(deps),
  );
  // 앞 호출이 실패해도 뒤 호출이 막히지 않게 체인 자체는 항상 이어 둔다.
  importChain = next.catch(() => {});
  return next;
}

async function runImport(deps: { storage: Storage; prisma: PrismaClient }): Promise<void> {
  // 등록된 리포 이름·alias — 힌트의 항을 리포/키워드로 가르는 기준. 리포를 나중에 등록하면 다음 적재가 다시 가른다.
  // 생성 순으로 — alias가 겹치면 먼저 등록한 리포가 이긴다(결정적).
  const repos: RepoNameSource[] = (
    await deps.prisma.repo.findMany({
      select: { name: true, aliases: true },
      orderBy: { createdAt: 'asc' },
    })
  ).map((r) => ({ name: r.name, aliases: parseStringArray(r.aliases) }));
  const rows = parsedQueueToRows(parseQueue(await deps.storage.readQueueFile()), repos);
  const existing: ExistingItem[] = await deps.prisma.queueItem.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      order: true,
      category: true,
      completedOn: true,
      seriesKey: true,
      episodeNo: true,
      repoNames: true,
      keywords: true,
      period: true,
      missingSince: true,
      missingAck: true,
      holdReason: true,
      runs: { select: { status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const byTitle = indexByTitle(existing);
  const matched = new Set<string>();
  const updates: { id: string; row: QueueItemRow }[] = [];
  const creates: QueueItemRow[] = [];

  for (const row of rows) {
    const item = takeMatch(byTitle.get(normalizeTopicTitle(row.title)), row.status);
    if (item) {
      matched.add(item.id);
      if (!isUnchanged(item, row)) updates.push({ id: item.id, row });
    } else {
      creates.push(row);
    }
  }

  // 사라진 줄이 보류로 갈 자리 — 파일의 보류 줄 뒤에 붙인다(파일 순서를 밀지 않는다).
  let holdOrder = rows.filter((row) => row.status === '보류').length;
  const now = new Date();

  await deps.prisma.$transaction(async (tx) => {
    for (const { id, row } of updates) {
      // 줄이 돌아왔으니 사라짐 표시·확인 기록·자동 보류 사유를 지운다.
      await tx.queueItem.update({
        where: { id },
        data: { ...row, missingSince: null, missingAck: null, holdReason: null },
      });
    }
    if (creates.length > 0) await tx.queueItem.createMany({ data: creates });

    for (const item of existing) {
      if (matched.has(item.id)) continue;
      const disposition = disposeMissing(item);
      if (disposition === 'keep-done') continue;
      if (disposition === 'await-confirm') {
        // 이미 표시돼 있으면 시각을 덮지 않는다 — "언제부터 사라졌는지"를 보존한다.
        if (item.missingSince === null) {
          await tx.queueItem.update({ where: { id: item.id }, data: { missingSince: now } });
        }
        continue;
      }
      // 확인 없이 내린 것이므로 missingSince(= 확인 대기 표시)는 남기지 않는다.
      // 왜 보류가 됐는지는 holdReason이 말한다.
      await tx.queueItem.update({
        where: { id: item.id },
        data: {
          status: '보류',
          order: holdOrder++,
          category: null,
          completedOn: null,
          holdReason: HOLD_REASON_REMOVED,
          missingSince: null,
        },
      });
    }
  });
}
