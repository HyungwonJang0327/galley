// 주제 슬러그 — 그 주제의 산출물 폴더 이름(posts/<슬러그>, DATA_DIR artifacts/<슬러그>). **키가 아니다** — 주제 키는
// QueueItem.id이고 슬러그는 "그 실행이 어느 폴더에 썼는가"의 사실 기록이다(decisions/queue-sync-direction.md
// 2026-09-12 결정 변경). 파생·승계 규칙은 decisions/topic-slug.md: 힌트를 뗀 제목에서 **그 주제의 첫 실행 때 한 번**
// 만들고(규칙 1), 이후 실행은 가장 최근 Run의 것을 승계한다(규칙 2 — startRun·startRerun).
//
// 규칙: 같은 제목이면 언제나 같은 슬러그. 제목이 한국어라 로마자 변환은 하지 않는다
// (변환하면 서로 다른 제목이 같은 슬러그로 뭉개진다). 한글·영숫자만 남기고 나머지는 구분자로 본다.
import { stripTopicHints } from './normalizeTitle.ts';

const MAX_LENGTH = 80;

/**
 * 글자 변환만: 소문자화 → 한글/영숫자 외 문자는 하이픈 → 중복·양끝 하이픈 정리 → 길이 상한.
 * 남는 글자가 없으면(기호만 있는 제목) 빈 문자열이 아니라 'topic'을 돌려준다.
 * **큐 제목에는 직접 쓰지 않는다** — 괄호 힌트(리포 별칭)가 슬러그에 들어간다. `slugForTopicTitle`을 쓴다.
 */
export function topicSlug(title: string): string {
  const normalized = title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (normalized === '') return 'topic';
  return normalized.slice(0, MAX_LENGTH).replace(/-$/, '');
}

/**
 * 큐 제목 → 그 주제의 슬러그. 시리즈 태그·줄 끝 URL·괄호 힌트(리포 별칭·기간·`posts/…`)를 **뗀 뒤** 만든다
 * (decisions/topic-slug.md 규칙 1) — 별칭이 posts 폴더 이름·완료 줄·URL 슬러그로 나가지 않고, 힌트만 고쳐도 슬러그가
 * 바뀌지 않는다. 힌트뿐인 제목은 `topic`.
 */
export function slugForTopicTitle(title: string): string {
  return topicSlug(stripTopicHints(title));
}
