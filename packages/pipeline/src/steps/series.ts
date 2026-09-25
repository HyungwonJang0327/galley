// 시리즈 편의 안내 줄 — 형식이 고정이고 링크 치환이 필요해 모델이 아니라 코드가 붙인다(decisions/series.md 산출물 형식).
// 전부 순수 함수다. 단계는 모델 출력 뒤에 이것들을 적용하고, 파생 단계(링크드인·Zenn)는 입력 본문에서 먼저 뗀다.
import type { SeriesContext } from '../queue/seriesContext.ts';

/** 이전 편 벨로그 URL이 아직 없을 때의 자리표시자 — 발행 뒤 사람이 채운다(발행 체크리스트). */
export const VELOG_LINK_PLACEHOLDER = '[벨로그 링크]';

/** 단계가 보는 시리즈 정보 — 이 편 기준으로 좁힌 것. 편 목록 전체는 넘기지 않는다. */
export interface SeriesStepInfo {
  name: string;
  /** 정의 줄 `ja:` — 없으면 Zenn은 한글명을 쓴다. */
  nameJa?: string;
  episodeNo: number;
  /** 파일에 있는 그 시리즈 편 수(M). */
  total: number;
  previous?: { title: string; url?: string };
  next?: { title: string };
  /** 이 편이 `(기존 글)` — 이미 발행돼 본문을 쓰지 않는다. */
  alreadyPublished: boolean;
}

/** 컨텍스트 → 이 주제 편의 정보. 편 목록에 이 주제가 없으면(태그를 뗐는데 아직 적재 전 등) undefined — 시리즈가 아닌 글로. */
export function toSeriesStepInfo(
  context: SeriesContext,
  topicId: string,
): SeriesStepInfo | undefined {
  const at = context.episodes.findIndex((e) => e.topicId === topicId);
  const current = context.episodes[at];
  if (current === undefined) return undefined;
  const prev = context.episodes[at - 1];
  const next = context.episodes[at + 1];
  return {
    name: context.name,
    ...(context.nameJa === undefined ? {} : { nameJa: context.nameJa }),
    episodeNo: current.episodeNo,
    total: context.episodes.length,
    ...(prev === undefined
      ? {}
      : {
          previous: {
            title: prev.title,
            ...(prev.velogUrl === undefined ? {} : { url: prev.velogUrl }),
          },
        }),
    ...(next === undefined ? {} : { next: { title: next.title } }),
    alreadyPublished: current.alreadyPublished,
  };
}

/** 벨로그 제목 — `<제목> | <시리즈명> N편`(2026-09-24 사용자 결정). */
export function seriesVelogTitle(title: string, info: SeriesStepInfo): string {
  return `${title} | ${info.name} ${info.episodeNo}편`;
}

/** Zenn 제목 — `<제목> (第N回)`(2026-09-24 사용자 결정). */
export function seriesZennTitle(title: string, info: SeriesStepInfo): string {
  return `${title} (第${info.episodeNo}回)`;
}

/** 본문 첫 H1 바로 아래 인용 줄 — 1편(이전 편 없음)은 링크 없이. */
export function renderSeriesHeader(info: SeriesStepInfo): string {
  const head = `> ${info.name} 시리즈 ${info.episodeNo}편.`;
  if (info.previous === undefined) return head;
  const url = info.previous.url ?? VELOG_LINK_PLACEHOLDER;
  return `${head} [이전 편: ${info.previous.title}](${url})`;
}

/** `## 결과` 절 끝 줄 — 마지막 편은 없음. */
export function renderNextEpisode(info: SeriesStepInfo): string | undefined {
  return info.next === undefined ? undefined : `다음 편: ${info.next.title}`;
}

/** Zenn `## はじめに` 첫 문장 앞에 붙이는 문장. */
export function renderZennSeriesSentence(info: SeriesStepInfo): string {
  return `${info.nameJa ?? info.name}シリーズの第${info.episodeNo}回です。`;
}

/** 벨로그 단계 SYSTEM 머리에 더하는 서술 지시 한 줄 — 안내 줄은 코드가 붙이므로 모델이 쓰지 않게. */
export function renderSeriesSystemLine(info: SeriesStepInfo): string {
  const prev = info.previous === undefined ? '' : ` (이전 편: ${info.previous.title})`;
  return `- 이 글은 "${info.name}" 시리즈 ${info.episodeNo}편입니다${prev}. 이전 편 내용은 한두 문장으로만 요약하고 시리즈 소개·목차는 넣지 않습니다. 시리즈 안내 줄·다음 편 안내는 시스템이 붙이므로 쓰지 않습니다.`;
}

const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** 코드 펜스 밖 줄의 번호들 — 펜스 안의 `# 주석`·`다음 편:`을 건드리지 않게. */
function outsideFences(lines: readonly string[]): boolean[] {
  const outside: boolean[] = [];
  let open: string | undefined;
  for (const line of lines) {
    const fence = FENCE.exec(line)?.[1];
    if (open === undefined) {
      outside.push(fence === undefined);
      if (fence !== undefined) open = fence[0];
    } else {
      outside.push(false);
      if (fence !== undefined && fence[0] === open) open = undefined;
    }
  }
  return outside;
}

const H1 = /^#[ \t]+(.*?)[ \t]*$/;
const H2 = /^##[ \t]+(.*?)[ \t]*$/;

function findLine(
  lines: readonly string[],
  outside: readonly boolean[],
  test: (line: string) => boolean,
  from = 0,
): number {
  for (let i = from; i < lines.length; i += 1) if (outside[i] && test(lines[i]!)) return i;
  return -1;
}

function joinLines(lines: readonly string[]): string {
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

/**
 * 벨로그 본문에 시리즈 표기를 붙인다: 첫 H1 끝에 `| 시리즈명 N편`, 그 아래 인용 줄, `## 결과` 절 끝(다음 H2 또는 끝 앞)에
 * `다음 편:`. H1이 없으면 인용 줄을 맨 앞에, `## 결과`가 없으면 다음 편 줄을 맨 끝에.
 */
export function applyVelogSeries(body: string, info: SeriesStepInfo): string {
  const lines = body.replace(/\r\n/g, '\n').trimEnd().split('\n');
  let outside = outsideFences(lines);

  const next = renderNextEpisode(info);
  if (next !== undefined) {
    const result = findLine(lines, outside, (l) => H2.exec(l)?.[1] === '결과');
    let end = result === -1 ? -1 : findLine(lines, outside, (l) => H2.test(l), result + 1);
    if (end === -1) end = lines.length;
    // 절 끝의 빈 줄 앞에 넣는다.
    while (end > 0 && lines[end - 1]!.trim() === '') end -= 1;
    lines.splice(end, 0, '', next, '');
    outside = outsideFences(lines);
  }

  const header = renderSeriesHeader(info);
  const h1 = findLine(lines, outside, (l) => H1.test(l));
  if (h1 === -1) {
    lines.unshift(header, '');
  } else {
    const title = H1.exec(lines[h1]!)![1]!.replace(/[ \t]+#+$/, '');
    lines.splice(h1, 1, `# ${seriesVelogTitle(title, info)}`, '', header, '');
  }
  return joinLines(lines);
}

const HEADER_LINE = /^> .+ 시리즈 \d+편\.(?: \[이전 편: .*\]\(.*\))?[ \t]*$/;
const NEXT_LINE = /^다음 편: .+$/;
const TITLE_SUFFIX = /^(#[ \t]+.*?) \| .+ \d+편[ \t]*$/;

/**
 * 파생 단계 입력에서 벨로그의 시리즈 표기를 뗀다 — 링크드인은 시리즈를 언급하지 않고, Zenn은 제 형식으로 다시 붙인다.
 * 시리즈 편이 아니어도 적용해 둔다(carried 본문이 시리즈 표기를 달고 있을 수 있다). 코드 펜스 안은 건드리지 않는다.
 */
export function stripSeriesLines(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const outside = outsideFences(lines);
  let titleSeen = false;
  const kept: string[] = [];
  lines.forEach((line, i) => {
    if (!outside[i]) {
      kept.push(line);
      return;
    }
    if (HEADER_LINE.test(line) || NEXT_LINE.test(line)) return;
    if (!titleSeen && H1.test(line)) {
      titleSeen = true;
      kept.push(line.replace(TITLE_SUFFIX, '$1'));
      return;
    }
    kept.push(line);
  });
  return joinLines(kept);
}

const HAJIMENI = /^##[ \t]+はじめに[ \t]*$/;

/**
 * Zenn 본문(제목 뗀 뒤)의 `## はじめに` 첫 문장 앞에 시리즈 문장을 붙인다. 절 첫 내용이 문단이 아니면(제목·주석·코드·목록)
 * 소제목 바로 아래 문단으로 넣고, `## はじめに`가 없으면 본문 맨 앞 문단으로.
 */
export function applyZennSeries(body: string, info: SeriesStepInfo): string {
  const sentence = renderZennSeriesSentence(info);
  const lines = body.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const outside = outsideFences(lines);
  const heading = findLine(lines, outside, (l) => HAJIMENI.test(l));
  if (heading === -1) return joinLines([sentence, '', ...lines]);

  // 펜스 여는 줄도 "첫 내용"으로 봐야 코드 블록 뒤 문단에 붙지 않는다 — 여기선 펜스를 가리지 않고 찾는다.
  let first = heading + 1;
  while (first < lines.length && lines[first]!.trim() === '') first += 1;
  if (first === lines.length) first = -1;
  const text = first === -1 ? undefined : lines[first]!;
  const isParagraph =
    text !== undefined && !/^[ \t]*(?:#|<!--|[-*+>]|\d+\.|\||`{3}|~{3})/.test(text);
  if (isParagraph) lines[first] = `${sentence}${text.trimStart()}`;
  else lines.splice(heading + 1, 0, '', sentence);
  return joinLines(lines);
}
