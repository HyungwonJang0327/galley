// 모델이 쓴 그림 조각(HTML+인라인 SVG) 거르기 — 썸네일 오른쪽 그림과 본문 삽화가 같이 쓴다(decisions/illustrations.md).
// 허용 목록 방식: 아는 태그·아는 속성만 다시 써서 내보낸다. 스크립트·스타일 시트·외부 주소를 실을 수 있는 것(script·style·
// img·a·iframe·use·image·foreignObject, on* 속성, href·src, url(http…))은 목록에 없어서 빠진다. 파서 라이브러리 없이 손으로
// 읽는다(새 의존성 없음) — 그래서 "모르는 것은 버린다"만 한다. 여닫기도 맞춘다: 짝 없는 닫는 태그는 버리고, 안 닫힌 태그는
// 끝에서 닫는다 — 조각이 바깥 틀을 깨고 나가지 못하게.

/** 안에 다른 요소를 담는 태그 — 여닫기를 스택으로 맞춘다. */
const CONTAINER_TAGS = new Set([
  'div',
  'span',
  'p',
  'b',
  'i',
  'em',
  'strong',
  'small',
  'h3',
  'h4',
  'svg',
  'g',
  'text',
  'tspan',
]);
/** 내용이 없는 태그 — 항상 `<x … />`로 쓰고 닫는 태그는 버린다. */
const LEAF_TAGS = new Set([
  'br',
  'path',
  'circle',
  'rect',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);
/** 내용째로 버리는 태그 — 태그만 지우면 안의 글자(코드·CSS)가 그림에 찍힌다. */
const RAW_TEXT_TAGS = new Set([
  'script',
  'style',
  'title',
  'textarea',
  'noscript',
  'iframe',
  'template',
]);

/** 허용 속성(소문자 비교, 쓸 때는 원래 표기 — `viewBox`). 주소를 받는 속성(href·src·xlink:href)은 없다. */
const ALLOWED_ATTRS = new Set(
  [
    'class',
    'style',
    'xmlns',
    'viewBox',
    'width',
    'height',
    'x',
    'y',
    'x1',
    'y1',
    'x2',
    'y2',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'd',
    'points',
    'dx',
    'dy',
    'transform',
    'fill',
    'fill-opacity',
    'fill-rule',
    'clip-rule',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-opacity',
    'opacity',
    'font-size',
    'font-weight',
    'font-family',
    'font-style',
    'text-anchor',
    'dominant-baseline',
    'letter-spacing',
    'filter',
    'marker-start',
    'marker-end',
  ].map((name) => name.toLowerCase()),
);

/**
 * 속성 값이 안전한가 — 주소·스크립트를 실을 수 있는 꼴을 막는다. `url(#id)`(같은 문서의 필터·마커)만 허용하고 그 밖의 `url(`,
 * 스킴(`javascript:`·`data:`·`http:`…)·프로토콜 상대 주소(`//`)·`@import`·`expression(`은 거절. 역슬래시·`&#`는 CSS/HTML
 * 이스케이프로 위 검사를 돌아가는 길이라 통째로 거절한다(그림 조각에 쓸 일이 없다).
 */
function isSafeAttrValue(value: string): boolean {
  if (/[\\]|&#/.test(value)) return false;
  // 제어 문자를 끼워 검사를 피하는 값("java\u0000script:")을 막는다.
  const compact = value.replace(/[\u0000- \u007f]+/g, '').toLowerCase();
  if (/url\((?!#[a-z0-9_-]+\))/.test(compact)) return false;
  if (/(?:javascript|vbscript|data|file|https?|ftp|blob):/.test(compact)) return false;
  if (compact.includes('//') || compact.includes('@import') || compact.includes('expression(')) {
    return false;
  }
  return true;
}

const escapeText = (text: string): string => text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text: string): string =>
  text.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface ParsedTag {
  name: string;
  closing: boolean;
  attrs: { name: string; value: string }[];
  /** 태그 끝(`>` 다음) 위치. */
  end: number;
}

const isNameStart = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z]/.test(ch);
const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch);

/** `<` 위치에서 태그 하나를 읽는다. 태그 꼴이 아니거나 `>`로 끝나지 않으면 undefined(호출부가 `<`를 글자로). */
function parseTag(input: string, start: number): ParsedTag | undefined {
  let i = start + 1;
  const closing = input[i] === '/';
  if (closing) i += 1;
  if (!isNameStart(input[i])) return undefined;
  const nameStart = i;
  while (i < input.length && /[A-Za-z0-9:-]/.test(input[i]!)) i += 1;
  const name = input.slice(nameStart, i).toLowerCase();
  const attrs: { name: string; value: string }[] = [];
  for (;;) {
    while (isSpace(input[i]) || input[i] === '/') i += 1;
    if (i >= input.length) return undefined;
    if (input[i] === '>') return { name, closing, attrs, end: i + 1 };
    const attrStart = i;
    while (i < input.length && !isSpace(input[i]) && !/[=>/]/.test(input[i]!)) i += 1;
    const attrName = input.slice(attrStart, i);
    if (attrName === '') return undefined; // `=`로 시작하는 등 읽을 수 없는 꼴
    while (isSpace(input[i])) i += 1;
    let value = '';
    if (input[i] === '=') {
      i += 1;
      while (isSpace(input[i])) i += 1;
      const quote = input[i];
      if (quote === '"' || quote === "'") {
        const close = input.indexOf(quote, i + 1);
        if (close === -1) return undefined;
        value = input.slice(i + 1, close);
        i = close + 1;
      } else {
        const valueStart = i;
        while (i < input.length && !isSpace(input[i]) && input[i] !== '>') i += 1;
        value = input.slice(valueStart, i);
      }
    }
    attrs.push({ name: attrName, value });
  }
}

function renderAttrs(attrs: readonly { name: string; value: string }[]): string {
  const seen = new Set<string>();
  let out = '';
  for (const { name, value } of attrs) {
    const key = name.toLowerCase();
    if (!ALLOWED_ATTRS.has(key) || seen.has(key) || !isSafeAttrValue(value)) continue;
    seen.add(key);
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  return out;
}

/**
 * 그림 조각을 허용 목록으로 다시 쓴다. 항상 문자열을 돌려준다(버릴 것만 버림) — 결과가 비면 그릴 게 없다는 뜻. 주석·doctype·
 * 처리 명령은 버리고, 글자는 `<`·`>`를 이스케이프한다(엔티티는 그대로 둔다).
 */
export function sanitizeMarkup(input: string): string {
  let out = '';
  const stack: string[] = [];
  let i = 0;
  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      out += escapeText(input.slice(i));
      break;
    }
    out += escapeText(input.slice(i, lt));
    if (input.startsWith('<!--', lt)) {
      const close = input.indexOf('-->', lt + 4);
      i = close === -1 ? input.length : close + 3;
      continue;
    }
    if (input[lt + 1] === '!' || input[lt + 1] === '?') {
      const close = input.indexOf('>', lt);
      i = close === -1 ? input.length : close + 1;
      continue;
    }
    const tag = parseTag(input, lt);
    if (tag === undefined) {
      out += '&lt;';
      i = lt + 1;
      continue;
    }
    i = tag.end;
    if (RAW_TEXT_TAGS.has(tag.name)) {
      if (!tag.closing) {
        // 닫는 태그까지(없으면 끝까지) 내용째로 버린다.
        const close = input.toLowerCase().indexOf(`</${tag.name}`, i);
        const closeEnd = close === -1 ? -1 : input.indexOf('>', close);
        i = closeEnd === -1 ? input.length : closeEnd + 1;
      }
      continue;
    }
    if (LEAF_TAGS.has(tag.name)) {
      if (!tag.closing) out += `<${tag.name}${renderAttrs(tag.attrs)} />`;
      continue;
    }
    if (!CONTAINER_TAGS.has(tag.name)) continue; // 모르는 태그 — 태그만 버리고 안의 내용은 계속 읽는다
    if (!tag.closing) {
      stack.push(tag.name);
      out += `<${tag.name}${renderAttrs(tag.attrs)}>`;
      continue;
    }
    const open = stack.lastIndexOf(tag.name);
    if (open === -1) continue; // 짝 없는 닫는 태그 — 바깥 틀을 닫지 못하게 버린다
    while (stack.length > open) out += `</${stack.pop()!}>`;
  }
  while (stack.length > 0) out += `</${stack.pop()!}>`;
  return out.trim();
}
