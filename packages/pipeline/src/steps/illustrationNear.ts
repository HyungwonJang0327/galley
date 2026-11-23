// 고친 본문에서 "삽화 자리 주석 바로 앞뒤 문단이 바뀌었는가" — 답 반영 실행이 삽화를 다시 만들지 물을지,
// 발행정보를 다시 만들지의 기준(decisions/review-questions.md 착수 결정의 예외). 순수 함수만.
import { stripReviewComments } from '../review/answers.ts';
import { paragraphIndexAtLine, splitParagraphs } from '../review/paragraphs.ts';
import { paragraphHunks } from '../run/patchScope.ts';
import { locateIllustrationSlots } from './illustration.ts';

/** 다시 만들지 물을 삽화 — 고친 본문 기준의 자리와 함께. */
export interface NearIllustration {
  /** 파일 이름 줄기(`illust1_post_table_split`) — 본문 자리 주석의 이름. */
  name: string;
  /** 그 주석이 든 문단 번호(0부터)와 시작 줄(1부터) — **고친 본문** 기준. */
  paragraph: number;
  line: number;
}

/** 이름으로 본문에서 삽화 자리 주석을 찾는다(본문 순서). 본문에 없는 이름은 빠진다. */
export function locateIllustrations(body: string, names: readonly string[]): NearIllustration[] {
  const wanted = new Set(names);
  const paragraphs = splitParagraphs(body);
  return locateIllustrationSlots(body)
    .filter((slot) => wanted.has(slot.name))
    .map((slot) => ({
      name: slot.name,
      paragraph: paragraphIndexAtLine(paragraphs, slot.line) ?? 0,
      line: slot.line,
    }));
}

/**
 * 고치기 전·후 본문을 견줘, **바뀐 문단의 바로 앞뒤(또는 바뀐 문단 안)에 자리 주석이 있는 삽화**를 고른다.
 * `[확인 필요]` 주석은 걷어내고 견준다 — 주석만 지운 문단은 바뀐 것이 아니다(뒤 단계 고침과 같은 기준).
 * 문단이 통째로 빠진 곳은 그 자리의 앞뒤 문단을 본다. 고친 본문에 없는 삽화(주석이 지워짐)는 고르지 않는다.
 */
export function illustrationsNearChanges(previous: string, next: string): NearIllustration[] {
  const before = stripReviewComments(previous);
  const after = stripReviewComments(next);
  const hunks = paragraphHunks(before, after);
  if (hunks.length === 0) return [];

  // 바뀐 곳마다 "고친 글에서 그 곳과 앞뒤 한 문단"의 범위(양끝 포함). 앞선 곳들이 늘리거나 줄인 문단 수만큼 자리가 밀린다.
  const ranges: { from: number; to: number }[] = [];
  let shift = 0;
  for (const hunk of hunks) {
    const start = hunk.at + shift;
    ranges.push({ from: start - 1, to: start + hunk.added.length });
    shift += hunk.added.length - hunk.removed.length;
  }

  const paragraphs = splitParagraphs(after);
  const names = locateIllustrationSlots(after)
    .filter((slot) => {
      const at = paragraphIndexAtLine(paragraphs, slot.line);
      return at !== undefined && ranges.some((range) => at >= range.from && at <= range.to);
    })
    .map((slot) => slot.name);
  // 자리는 걷어내지 않은 고친 본문 기준으로 돌려준다(화면·질문이 실제 줄을 가리킨다).
  return locateIllustrations(next, names);
}
