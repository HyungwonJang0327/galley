// 주제 키(슬러그). 파일이 진실인 큐와 DB가 진실인 실행 이력을 잇는 유일한 안정 키다
// — decisions/queue-sync-direction.md "주제 키는 id가 아니라 슬러그".
//
// 규칙: 같은 제목이면 언제나 같은 슬러그. 제목이 한국어라 로마자 변환은 하지 않는다
// (변환하면 서로 다른 제목이 같은 슬러그로 뭉개진다). 한글·영숫자만 남기고 나머지는 구분자로 본다.

const MAX_LENGTH = 80;

/**
 * 제목 → 슬러그. 소문자화 → 한글/영숫자 외 문자는 하이픈 → 중복·양끝 하이픈 정리 → 길이 상한.
 * 남는 글자가 없으면(기호만 있는 제목) 빈 문자열이 아니라 'topic'을 돌려준다.
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
