// 주제_큐.md 항목의 괄호 힌트 → 근거 힌트(순수). 파일 형식은 건드리지 않는다(괄호는 사람이 쓰는 메모 그대로) —
// 파일 → DB 경계(parsedQueueToRows)에서만 뽑아 QueueItem.repoNames·keywords·period에 넣는다.
// 형식(decisions/evidence-collection.md "파서 확장"): `(spacehome, react-router)` `(vendor manager, 2024.03)`
// `(spacehome + vendor manager)` `(2024.07)`. 어느 항이 리포 이름인지는 파서가 모른다 — Repo.name·aliases와 대조하는
// 것은 적재 쪽(resolveTopicHints)이고, 여기서는 "기간"과 "그 밖의 항(term)"만 가른다.

export interface RawTopicHints {
  /** 기간이 아닌 항(원문 공백 정리, 순서 유지, 중복 제거). 리포 이름·키워드가 섞여 있다. */
  terms: string[];
  /** 기간 힌트 정규형 `YYYY` · `YYYY-MM` · `YYYY-MM~YYYY-MM`(RepoAnalysis.period과 같은 월 표기). 여러 개면 첫 것. 범위 전개는 매칭 쪽에서. */
  period: string | null;
}

export interface TopicHints {
  /** Repo.name(정식 이름) — alias로 썼어도 정식 이름으로. */
  repoNames: string[];
  /** 소문자 매칭 토큰(RepoAnalysis.keywords와 같은 규칙). */
  keywords: string[];
  period: string | null;
}

/** 괄호 묶음 전부(반각·전각). normalizeTopicTitle이 매칭에서 빼는 것과 같은 범위 — 제목 어디에 있든 힌트로 본다. */
const GROUPS = /[(（]([^)）]*)[)）]/g;
/**
 * 항 구분자: 쉼표(반각·전각)·플러스·화살표·가운뎃점. 하이픈·공백·슬래시는 항의 일부(`react-router`, `vendor manager`,
 * `A/B 테스트`, `src/app`, `next 13/14`) — 슬래시를 구분자로 두면 경로·버전 표기가 쪼개진다(2026-09-22 BE6 리뷰).
 */
const SEPARATORS = /[,，+·→]/;
const PERIOD = new RegExp(
  `^((?:19|20)\\d{2})(?:[.\\-](0?[1-9]|1[0-2]))?(?:\\s*[~\\-–]\\s*((?:19|20)\\d{2})(?:[.\\-](0?[1-9]|1[0-2]))?)?$`,
);

/** 이미 발행된 시리즈 편 표시 메모(decisions/series.md). 힌트가 아니라 키워드로 세지 않는다. */
export const ALREADY_PUBLISHED_NOTE = '기존 글';
/** 힌트가 아닌 표시 메모. 비교는 공백 정리·NFC 뒤 원문 그대로. */
const NON_HINT_TERMS: ReadonlySet<string> = new Set([ALREADY_PUBLISHED_NOTE]);
const LEADING_GROUP = /^\s*[(（]([^)）]*)[)）]/;

/**
 * 이미 발행된 편인가 — 제목(태그 뗀 뒤) 맨 앞 괄호의 첫 항이 `기존 글`(`(기존 글)`·`(기존 글, 2025)`). 힌트 파서가
 * 키워드에서 빼는 항과 같은 기준이다.
 */
export function isAlreadyPublished(title: string): boolean {
  const group = LEADING_GROUP.exec(title.normalize('NFC'))?.[1];
  if (group === undefined) return false;
  const first = group.split(SEPARATORS)[0]?.replace(/\s+/g, ' ').trim();
  return first === ALREADY_PUBLISHED_NOTE;
}

export const isPeriodHint = (term: string): boolean => PERIOD.test(term.trim());

/**
 * 기간 표기를 정규형으로 — `2024.3`·`2024-03` → `2024-03`, `2024` → `2024`, 범위는 `~`로(`2024.07 – 2025.1` → `2024-07~2025-01`).
 * 분석 글의 `period`(`YYYY-MM`)와 문자열·접두 비교가 바로 되게. 형식이 아니면 undefined(2026-09-22 BE6 리뷰 2).
 */
export function normalizePeriodHint(term: string): string | undefined {
  const m = PERIOD.exec(term.trim());
  if (m === null) return undefined;
  const ym = (year: string, month: string | undefined) =>
    month === undefined ? year : `${year}-${month.padStart(2, '0')}`;
  const from = ym(m[1]!, m[2]);
  return m[3] === undefined ? from : `${from}~${ym(m[3], m[4])}`;
}

export function parseTopicHints(title: string): RawTopicHints {
  const terms: string[] = [];
  const seen = new Set<string>();
  let period: string | null = null;
  for (const m of title.normalize('NFC').matchAll(GROUPS)) {
    for (const raw of (m[1] ?? '').split(SEPARATORS)) {
      const term = raw.replace(/\s+/g, ' ').trim();
      if (term === '' || NON_HINT_TERMS.has(term)) continue;
      const normalized = normalizePeriodHint(term);
      if (normalized !== undefined) {
        if (period === null) period = normalized;
        continue;
      }
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(term);
    }
  }
  return { terms, period };
}

export interface RepoNameSource {
  name: string;
  aliases: readonly string[];
}

/**
 * 항을 리포 이름과 키워드로 가른다 — Repo.name·aliases(대소문자·NFC 무시)에 맞으면 정식 이름으로 repoNames, 아니면
 * 소문자 keywords. 등록된 리포가 없으면 전부 키워드다(리포를 나중에 등록하고 재적재하면 그때 갈린다).
 */
export function resolveTopicHints(
  raw: RawTopicHints,
  repos: readonly RepoNameSource[],
): TopicHints {
  // 같은 alias가 두 리포에 있으면 목록의 앞 리포가 이긴다 — 호출자가 순서를 결정적으로(생성 순) 넘긴다. alias 유일성
  // 검사는 리포 등록 쪽 몫(기록: BE6 리뷰 4).
  const byAlias = new Map<string, string>();
  for (const repo of repos) {
    byAlias.set(repo.name.normalize('NFC').toLowerCase(), repo.name);
    for (const alias of repo.aliases) {
      const key = alias.normalize('NFC').trim().toLowerCase();
      if (key !== '' && !byAlias.has(key)) byAlias.set(key, repo.name);
    }
  }
  const repoNames: string[] = [];
  const keywords: string[] = [];
  for (const term of raw.terms) {
    const name = byAlias.get(term.normalize('NFC').toLowerCase());
    if (name !== undefined) {
      if (!repoNames.includes(name)) repoNames.push(name);
    } else keywords.push(term.toLowerCase());
  }
  return { repoNames, keywords, period: raw.period };
}
