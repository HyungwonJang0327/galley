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
  // 모델이 이미 붙인 `(第N回)`·`（第N回）`는 떼고 한 번만(L5).
  const bare = title.replace(/[ \t]*[(（][ \t]*第\d+回[ \t]*[)）][ \t]*$/, '');
  return `${bare} (第${info.episodeNo}回)`;
}

/** 본문 첫 H1 바로 아래 인용 줄 — 1편(이전 편 없음)은 링크 없이. */
export function renderSeriesHeader(info: SeriesStepInfo): string {
  const head = `> ${info.name} 시리즈 ${info.episodeNo}편.`;
  if (info.previous === undefined) return head;
  const url = info.previous.url ?? VELOG_LINK_PLACEHOLDER;
  // 링크 텍스트의 대괄호는 이스케이프 — 제목에 `]`가 있으면 링크가 깨진다.
  const title = info.previous.title.replace(/[[\]]/g, '\\$&');
  return `${head} [이전 편: ${title}](${url})`;
}

/** `## 결과` 절 끝 줄 — 마지막 편은 없음. */
export function renderNextEpisode(info: SeriesStepInfo): string | undefined {
  return info.next === undefined ? undefined : `다음 편: ${info.next.title}`;
}

/** Zenn `## はじめに` 첫 문장 앞에 붙이는 문장. */
export function renderZennSeriesSentence(info: SeriesStepInfo): string {
  return `${info.nameJa ?? info.name}シリーズの第${info.episodeNo}回です。`;
}

/**
 * 발행정보(`publish.md`)의 `## 벨로그 시리즈` 절 — `시리즈명 · N/M편`(M = 파일에 있는 그 시리즈 편 수). 시리즈가 아니면 빈 문자열
 * (절 없음). B3a가 발행정보를 조립할 때 붙인다(decisions/series.md 산출물 형식).
 */
export function renderSeriesPublishSection(info: SeriesStepInfo | undefined): string {
  if (info === undefined) return '';
  return `## 벨로그 시리즈\n\n${info.name} · ${info.episodeNo}/${info.total}편\n`;
}

/** 벨로그 단계 SYSTEM 머리에 더하는 서술 지시 한 줄 — 안내 줄은 코드가 붙이므로 모델이 쓰지 않게. */
export function renderSeriesSystemLine(info: SeriesStepInfo): string {
  const prev = info.previous === undefined ? '' : ` (이전 편: ${info.previous.title})`;
  return `- 이 글은 "${info.name}" 시리즈 ${info.episodeNo}편입니다${prev}. 이전 편 내용은 한두 문장으로만 요약하고 시리즈 소개·목차는 넣지 않습니다. 시리즈 안내 줄·다음 편 안내는 시스템이 붙이므로 쓰지 않습니다.`;
}

const FENCE_OPEN = /^[ ]{0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * 줄마다 코드 펜스 밖인지 — 펜스 안의 `# 주석`·`다음 편:`을 건드리지 않게. CommonMark 규칙: 닫는 펜스는 여는 것과 같은
 * 문자, 같거나 긴 길이, 뒤에 정보 문자열 없음(```` 블록 안의 ``` 줄은 닫지 않는다).
 */
function outsideFences(lines: readonly string[]): boolean[] {
  const outside: boolean[] = [];
  let open: string | undefined;
  for (const line of lines) {
    if (open === undefined) {
      const fence = FENCE_OPEN.exec(line)?.[1];
      outside.push(fence === undefined);
      if (fence !== undefined) open = fence;
    } else {
      outside.push(false);
      const fence = FENCE_CLOSE.exec(line)?.[1];
      if (fence !== undefined && fence[0] === open[0] && fence.length >= open.length)
        open = undefined;
    }
  }
  return outside;
}

const H1 = /^#[ \t]+(.*?)[ \t]*$/;
const H2 = /^##[ \t]+(.*?)[ \t]*$/;
/** 결과 절 — `## 결과`·`## 5. 결과`·`## 결과와 회고`. */
const RESULT_H2 = /^(?:\d+[.)][ \t]*)?결과/;

function findLine(
  lines: readonly string[],
  outside: readonly boolean[],
  test: (line: string) => boolean,
  from = 0,
): number {
  for (let i = from; i < lines.length; i += 1) if (outside[i] && test(lines[i]!)) return i;
  return -1;
}

/** 줄을 합친다 — 펜스 **밖**의 연속 빈 줄만 하나로 접는다(코드 블록 안 빈 줄은 코드다). 앞뒤 빈 줄은 뗀다. */
function joinLines(lines: readonly string[]): string {
  const outside = outsideFences(lines);
  const kept: string[] = [];
  lines.forEach((line, i) => {
    const blank = line.trim() === '';
    if (blank && outside[i] && (kept.length === 0 || kept[kept.length - 1]!.trim() === '')) return;
    kept.push(line);
  });
  while (kept.length > 0 && kept[kept.length - 1]!.trim() === '') kept.pop();
  return `${kept.join('\n')}\n`;
}

/** `## 결과` 절의 끝(다음 H2 줄 번호, 없으면 줄 수). 결과 절이 없으면 -1. */
function resultSectionEnd(lines: readonly string[], outside: readonly boolean[]): number {
  const result = findLine(lines, outside, (l) => RESULT_H2.test(H2.exec(l)?.[1] ?? ''));
  if (result === -1) return -1;
  const end = findLine(lines, outside, (l) => H2.test(l), result + 1);
  return end === -1 ? lines.length : end;
}

/** 마지막 비지 않은 줄의 번호(`end` 앞에서). */
function lastContent(lines: readonly string[], end: number): number {
  let at = end - 1;
  while (at >= 0 && lines[at]!.trim() === '') at -= 1;
  return at;
}

/** H1 줄 끝의 ` | <시리즈명> N편`을 뗀다 — 이 시리즈 이름일 때만(편 번호는 달라도). 이름을 정규식에 넣지 않는다. */
function stripTitleSuffix(line: string, info: SeriesStepInfo): string {
  const trimmed = line.trimEnd();
  const marker = ` | ${info.name} `;
  const at = trimmed.lastIndexOf(marker);
  if (at === -1 || !/^\d+편$/.test(trimmed.slice(at + marker.length))) return line;
  return trimmed.slice(0, at);
}

/** 이 시리즈의 인용 줄인가 — `> <시리즈명> 시리즈 N편.` 뒤에 이전 편 링크가 붙을 수 있다. */
function isSeriesHeader(line: string, info: SeriesStepInfo): boolean {
  const head = `> ${info.name} 시리즈 `;
  return (
    line.startsWith(head) &&
    /^\d+편\.(?: \[이전 편: .*\]\(.*\))?[ \t]*$/.test(line.slice(head.length))
  );
}

/**
 * 벨로그 본문에서 **이 시리즈의** 표기를 뗀다 — 첫 H1 끝 `| 시리즈명 N편`, 첫 H2 앞의 인용 줄, 결과 절 끝(또는 본문 끝)의
 * `다음 편:` 줄. 이 위치·이 이름이 아니면 건드리지 않는다(시리즈 아닌 글의 `> … 시리즈 3편.` 인용·`다음 편:` 문장 보존).
 * 파생 단계는 입력에서 떼고, 벨로그 단계는 붙이기 전에 떼서 모델이 스스로 쓴 표기가 겹치지 않게 한다.
 */
export function stripSeriesLines(body: string, info: SeriesStepInfo): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const outside = outsideFences(lines);
  const drop = new Set<number>();

  const firstH2 = findLine(lines, outside, (l) => H2.test(l));
  const leadEnd = firstH2 === -1 ? lines.length : firstH2;
  for (let i = 0; i < leadEnd; i += 1)
    if (outside[i] && isSeriesHeader(lines[i]!, info)) drop.add(i);

  for (const end of [resultSectionEnd(lines, outside), lines.length]) {
    if (end === -1) continue;
    const at = lastContent(lines, end);
    if (at >= 0 && outside[at] && lines[at]!.startsWith('다음 편: ')) drop.add(at);
  }

  const h1 = findLine(lines, outside, (l) => H1.test(l));
  if (h1 !== -1) lines[h1] = stripTitleSuffix(lines[h1]!, info);
  return joinLines(lines.filter((_, i) => !drop.has(i)));
}

/**
 * 벨로그 본문에 시리즈 표기를 붙인다: 첫 H1 끝에 `| 시리즈명 N편`, 그 아래 인용 줄, `## 결과` 절 끝(다음 H2 또는 끝 앞)에
 * `다음 편:`. H1이 없으면 인용 줄을 맨 앞에, 결과 절이 없으면 다음 편 줄을 맨 끝에. 먼저 떼고 붙이므로 여러 번 적용해도 같다.
 */
export function applyVelogSeries(body: string, info: SeriesStepInfo): string {
  const lines = stripSeriesLines(body, info).trimEnd().split('\n');
  let outside = outsideFences(lines);

  const next = renderNextEpisode(info);
  if (next !== undefined) {
    let end = resultSectionEnd(lines, outside);
    if (end === -1) end = lines.length;
    lines.splice(lastContent(lines, end) + 1, 0, '', next, '');
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
  // 확실한 문단일 때만 문장 앞에 붙인다 — Zenn 블록(:::message·링크 카드 URL·@[card]·$$·HTML·이미지)·목록·코드·
  // 4칸 들여쓰기 코드에 붙이면 렌더가 깨진다. 그 밖은 소제목 바로 아래 새 문단으로(M4).
  const isParagraph =
    text !== undefined &&
    !/^(?: {4}|\t)/.test(text) &&
    !/^[ ]{0,3}(?:#|<|[-*+>][ \t]|\d+[.)][ \t]|\||`{3}|~{3}|:::|@\[|https?:\/\/|\$\$|!\[)/.test(
      text,
    ) &&
    /^[ ]{0,3}[\p{L}\p{N}「『（(“"]/u.test(text);
  if (isParagraph) lines[first] = `${sentence}${text.trimStart()}`;
  else lines.splice(heading + 1, 0, '', sentence);
  return joinLines(lines);
}
