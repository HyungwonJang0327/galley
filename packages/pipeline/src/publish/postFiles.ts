// posts/<슬러그>/ 파일 이름 규칙 — blog 폴더의 기존 산출물 관례(스케줄 실행 결과)를 따른다(2026-09-26 사용자 결정, B3a):
// `<제목>.md`(벨로그) · `<제목>_링크드인.md` · `<제목>_zenn.md` · `<제목>_발행정보.md` · `<제목>_썸네일.png` + Galley가 더한
// `evidence.json`(포인터만) · `verification.json`. 제목의 공백은 `_`. 순수 함수만.

/** 파일 이름에 못 쓰는 문자(경로 구분자·Windows 금지 문자·제어 문자). 경로 구분자는 폴더 밖으로 새는 것을 막는다. */
const UNSAFE = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;
/** 파일 이름 길이 상한(바이트가 아니라 글자 — macOS·Linux 255바이트에 한글 3바이트를 감안해 넉넉히 아래). */
const STEM_MAX_CHARS = 60;

/**
 * 글 제목 → 파일 이름 줄기. NFC 정규화, 못 쓰는 문자는 뗀 뒤 공백을 `_`로, 연속 `_`는 하나로, 앞뒤 `_`·`.`은 뗀다(숨김 파일·
 * `..` 방지). 비면 `post`. 60자를 넘으면 자른다(뒤 접미사 `_발행정보.md`까지 더해도 파일시스템 한도 안).
 */
export function toFileStem(title: string): string {
  const stem = title
    .normalize('NFC')
    .replace(UNSAFE, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, STEM_MAX_CHARS)
    .replace(/[_.]+$/g, '');
  return stem === '' ? 'post' : stem;
}

export interface PostFileNames {
  velog: string;
  linkedin: string;
  zenn: string;
  publishInfo: string;
  /** 썸네일 단계(B3b) 전까지는 이름만 정해 둔다 — 발행정보가 이 이름을 적는다. */
  thumbnail: string;
  evidence: 'evidence.json';
  verification: 'verification.json';
}

/** 글 제목으로 7개 파일 이름 전부(썸네일 포함). 제목이 같으면 같은 이름 — 재승인이 같은 파일을 덮어쓴다. */
export function postFileNames(articleTitle: string): PostFileNames {
  const stem = toFileStem(articleTitle);
  return {
    velog: `${stem}.md`,
    linkedin: `${stem}_링크드인.md`,
    zenn: `${stem}_zenn.md`,
    publishInfo: `${stem}_발행정보.md`,
    thumbnail: `${stem}_썸네일.png`,
    evidence: 'evidence.json',
    verification: 'verification.json',
  };
}
