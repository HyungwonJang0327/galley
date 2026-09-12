// 큐 줄 ↔ QueueItem 매칭 키. 적재는 전체 리셋이 아니라 이 값으로 기존 항목을 찾는 upsert다
// (decisions/queue-sync-direction.md) — id가 안정적이어야 Run 이력이 끊기지 않는다.

/**
 * 매칭용 정규화 제목: **괄호 힌트를 뺀 제목 본문**.
 *
 * 힌트(`(spacehome, react-router)`)는 근거 수집이 쓰는 메모라 자주 손댄다 — 힌트만 고쳤을 때
 * 다른 항목으로 갈라지면 그 주제의 시도 기록이 끊긴다. 앞뒤 공백·연속 공백·대소문자도 무시한다.
 *
 * 제목 본문 자체를 고치면 다른 항목이 된다(파서에게는 "줄 삭제 + 줄 추가"로 보인다). 그래서
 * Run이 붙은 항목이 사라지면 자동으로 내리지 않고 확인을 띄운다 — 같은 문서의 "사라진 줄 처리".
 */
export function normalizeTopicTitle(title: string): string {
  return title
    .normalize('NFC')
    .replace(/[(（][^)）]*[)）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
