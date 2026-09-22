// 주제_큐.md 항목의 괄호 힌트 → 근거 힌트(순수). 파일 형식은 건드리지 않는다(괄호는 사람이 쓰는 메모 그대로) —
// 파일 → DB 경계(parsedQueueToRows)에서만 뽑아 QueueItem.repoNames·keywords·period에 넣는다.
// 형식(decisions/evidence-collection.md "파서 확장"): `(spacehome, react-router)` `(vendor manager, 2024.03)`
// `(spacehome + vendor manager)` `(2024.07)`. 어느 항이 리포 이름인지는 파서가 모른다 — Repo.name·aliases와 대조하는
// 것은 적재 쪽(resolveTopicHints)이고, 여기서는 "기간"과 "그 밖의 항(term)"만 가른다.

export interface RawTopicHints {
  /** 기간이 아닌 항(원문 공백 정리, 순서 유지, 중복 제거). 리포 이름·키워드가 섞여 있다. */
  terms: string[];
  /** 기간 힌트 원문(`2024.03` · `2024.07~2024.09` · `2024`). 여러 개면 첫 것. 해석은 매칭 쪽에서. */
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
/** 항 구분자: 쉼표(반각·전각)·플러스·슬래시·화살표·가운뎃점. 하이픈·공백은 항의 일부(`react-router`, `vendor manager`). */
const SEPARATORS = /[,，+/·→]/;
/** 기간: 연 또는 연.월(구분자 . - /), 선택적으로 `~`·`-`·`–`로 이은 범위. */
const YEAR_MONTH = String.raw`\d{4}(?:[.\-/]\d{1,2})?`;
const PERIOD = new RegExp(`^${YEAR_MONTH}(?:\\s*[~\\-–]\\s*${YEAR_MONTH})?$`);

export const isPeriodHint = (term: string): boolean => PERIOD.test(term.trim());

export function parseTopicHints(title: string): RawTopicHints {
  const terms: string[] = [];
  const seen = new Set<string>();
  let period: string | null = null;
  for (const m of title.normalize('NFC').matchAll(GROUPS)) {
    for (const raw of (m[1] ?? '').split(SEPARATORS)) {
      const term = raw.replace(/\s+/g, ' ').trim();
      if (term === '') continue;
      if (isPeriodHint(term)) {
        if (period === null) period = term.replace(/\s+/g, '');
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
    const name = byAlias.get(term.toLowerCase());
    if (name !== undefined) {
      if (!repoNames.includes(name)) repoNames.push(name);
    } else keywords.push(term.toLowerCase());
  }
  return { repoNames, keywords, period: raw.period };
}
