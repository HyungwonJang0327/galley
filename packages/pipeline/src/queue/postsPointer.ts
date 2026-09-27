// 완료 줄의 산출물 위치 표기 `posts/<슬러그>` — completeQueue가 쓰고, 시리즈 컨텍스트가 읽고, 힌트 파서가 키워드에서 뺀다.
// 세 곳이 같은 모양을 봐야 해서 한 곳에 둔다(TS1 리뷰 L6). 기계가 쓰는 형식이라 소문자 `posts/`만 인정한다.

/** 슬러그에 들어갈 수 없는 글자를 뺀 한 덩어리 — 공백·괄호·쉼표·슬래시가 들어가면 완료 줄 괄호가 깨진다. */
const SLUG_CHARS = '[^\\s(),，（）/]+';

/** 슬러그 모양(topicSlug 산출물). */
export const POSTS_SLUG_SHAPE = new RegExp(`^${SLUG_CHARS}$`);

/**
 * 괄호 힌트의 한 항이 산출물 위치인가 — 정확히 `posts/<슬러그>` 모양만. `posts/[id] 라우트`·`POSTS/x`·`src/posts/x`
 * 같은 사람의 메모는 그대로 힌트다.
 */
export function isPostsPointerTerm(term: string): boolean {
  return term.startsWith('posts/') && POSTS_SLUG_SHAPE.test(term.slice('posts/'.length));
}

/** 제목 안의 `posts/<슬러그>` 항 — 괄호 시작이나 쉼표 바로 뒤만(`…/posts/x` 같은 URL 경로는 아니다). */
export const POSTS_POINTER_IN_TITLE = /[(（,，]\s*posts\/([^\s,，)）]+)/;

const GROUPS = /[(（]([^)）]*)[)）]/g;
const TERM_SEPARATORS = /[,，]/;

/**
 * 제목에 적힌 산출물 위치의 슬러그 — 완료 줄(또는 되돌린 줄)의 `(posts/<슬러그>)`. **괄호 안의 한 항 전체가** 정확히
 * `posts/<슬러그>` 모양일 때만(`posts/[id] 라우트`처럼 뒤에 말이 붙은 메모는 아니다). 없으면 undefined.
 * 실행 기록이 없는 주제(DB 초기화 뒤)가 기존 posts 폴더와 같은 슬러그를 쓰게 하는 데 쓴다(decisions/topic-slug.md 규칙 2).
 */
export function postsPointerSlug(title: string): string | undefined {
  for (const group of title.normalize('NFC').matchAll(GROUPS))
    for (const raw of (group[1] ?? '').split(TERM_SEPARATORS)) {
      const term = raw.trim();
      if (isPostsPointerTerm(term)) return term.slice('posts/'.length);
    }
  return undefined;
}
