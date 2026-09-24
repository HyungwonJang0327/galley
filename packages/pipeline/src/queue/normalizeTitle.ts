// 큐 줄 ↔ QueueItem 매칭 키. 적재는 전체 리셋이 아니라 이 값으로 기존 항목을 찾는 upsert다
// (decisions/queue-sync-direction.md) — id가 안정적이어야 Run 이력이 끊기지 않는다.

/** 괄호 힌트 묶음(반각·전각) — 매칭 키와 프롬프트용 제목이 같은 범위를 뗀다. */
const HINT_GROUPS = /[(（][^)）]*[)）]/g;
/** 편 줄 맨 앞의 시리즈 태그 `[A-1]` — 제목 맨 앞에만 인정(decisions/series.md). */
export const SERIES_TAG = /^\[([A-Z])-(\d{1,2})\]\s+/;
/** 완료 줄 끝의 벨로그 URL(괄호 밖, 사람이 발행 후 붙인다 — decisions/series.md 확정 사항 1). */
const TRAILING_URL = /\s+https?:\/\/\S+\s*$/;

/**
 * 표시·프롬프트용 제목: 시리즈 태그·줄 끝 URL·괄호 힌트를 뗀 원문(대소문자 유지). 힌트에는 리포 별칭이 들어가므로
 * 모델 입력에 넣지 않는다(BS2 리뷰 2). 매칭에는 `normalizeTopicTitle`을 쓴다.
 */
export function stripTopicHints(title: string): string {
  return title
    .normalize('NFC')
    .trim()
    .replace(SERIES_TAG, '')
    .replace(TRAILING_URL, '')
    .replace(HINT_GROUPS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 매칭용 정규화 제목: **괄호 힌트를 뺀 제목 본문**.
 *
 * 힌트(`(spacehome, react-router)`)는 근거 수집이 쓰는 메모라 자주 손댄다 — 힌트만 고쳤을 때
 * 다른 항목으로 갈라지면 그 주제의 시도 기록이 끊긴다. 앞뒤 공백·연속 공백·대소문자도 무시한다.
 *
 * 시리즈 태그(`[A-1]`)와 완료 줄 끝 URL도 뺀다 — 편 번호를 바꾸거나 발행 뒤 URL을 붙여도 같은 항목이다.
 * 태그째 적재된 옛 행도 같은 함수로 정규화하므로 새 키에 그대로 매칭된다(decisions/series.md).
 *
 * 제목 본문 자체를 고치면 다른 항목이 된다(파서에게는 "줄 삭제 + 줄 추가"로 보인다). 그래서
 * Run이 붙은 항목이 사라지면 자동으로 내리지 않고 확인을 띄운다 — 같은 문서의 "사라진 줄 처리".
 */
export function normalizeTopicTitle(title: string): string {
  return stripTopicHints(title).toLowerCase();
}
