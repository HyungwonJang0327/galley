// 삽화 단계의 순수 부분 — 본문에서 삽화 자리 읽기, 장수 규칙, 프롬프트, 모델 출력 파싱, 목록 파일(decisions/illustrations.md).
// 규칙의 출처는 데스크톱 스케줄 프롬프트 3-1(한국어 삽화)·3-2(일본어 캡션판)와 blog 폴더 `tools/make_illust.py`의 설명이다.
import { cleanIllustrationSvg } from '../publish/illustration.ts';
import { toFileStem } from '../publish/postFiles.ts';

/** 한 글의 삽화 수 상한(분량 규칙의 최댓값). 본문 자리 주석이 더 많아도 앞에서 이만큼만 그린다. */
export const ILLUSTRATIONS_MAX = 3;
/** 삽화 목록 파일(DATA_DIR) — 승인·미리보기·발행정보가 이 파일로 장수와 이름을 안다. */
export const ILLUSTRATIONS_MANIFEST = 'illustrations.json';

/** DATA_DIR 산출물 이름 — 번호만 쓴다(설명이 바뀌어도 discard·미리보기가 고정 이름으로 찾는다). posts 이름은 목록의 `name`. */
export const illustrationArtifact = (n: number, lang: 'ko' | 'ja', ext: 'svg' | 'png'): string =>
  `illust${n}${lang === 'ja' ? '_ja' : ''}.${ext}`;

/** 그릴 삽화 한 장. */
export interface IllustrationSlot {
  /** 1부터. */
  n: number;
  /** 파일 이름 줄기(`illust1_post_table_split`) — 본문 자리 주석의 이름. 주석이 없던 글이면 모델이 설명을 정한 뒤 채운다. */
  name?: string;
  /** 본문 자리 주석의 위치 설명("표 다음, \"## 2.\" 앞"). */
  where?: string;
}

/** 본문에서 찾은 삽화 자리 — 그 주석이 시작하는 줄(1부터)과 함께. */
export interface LocatedIllustrationSlot extends IllustrationSlot {
  name: string;
  line: number;
}

/**
 * 벨로그 본문의 삽화 자리 주석(`<!-- [삽화] illustN_<설명>.png — 여기: … -->`)을 줄 번호와 함께 읽는다. 번호는 본문에 나온 순서로
 * 다시 매기고(모델이 번호를 건너뛰어도 1·2·3), 이름은 주석의 것을 파일 이름으로 안전하게 다듬어 쓴다. 같은 이름은 한 번만. 최대 3장.
 */
export function locateIllustrationSlots(body: string): LocatedIllustrationSlot[] {
  const text = body.replace(/\r\n/g, '\n');
  const slots: LocatedIllustrationSlot[] = [];
  const seen = new Set<string>();
  const pattern = /<!--\s*\[삽화\]\s*([^\s>]+?)\.png\b([\s\S]*?)-->/g;
  for (const match of text.matchAll(pattern)) {
    const stem = toFileStem(match[1]!);
    if (!/^illust\d+/i.test(stem) || seen.has(stem)) continue;
    seen.add(stem);
    const where = match[2]!
      .replace(/^[\s—–-]+/, '')
      .replace(/^여기\s*:\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    slots.push({
      n: slots.length + 1,
      name: stem,
      ...(where === '' ? {} : { where }),
      line: text.slice(0, match.index).split('\n').length,
    });
    if (slots.length === ILLUSTRATIONS_MAX) break;
  }
  return slots;
}

/** 삽화 자리 주석 목록(줄 번호 없이) — 삽화 단계가 그릴 목록으로 쓴다. 규칙은 `locateIllustrationSlots`와 같다. */
export function parseIllustrationSlots(body: string): IllustrationSlot[] {
  return locateIllustrationSlots(body).map(({ n, name, where }) => ({
    n,
    name,
    ...(where === undefined ? {} : { where }),
  }));
}

/** 본문 분량 — 코드 블록·HTML 주석을 빼고 공백을 뺀 글자 수(스케줄 3-1 "코드 제외, 공백 제외 글자 수"). */
export function countBodyChars(body: string): number {
  const prose = body
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, '');
  return Array.from(prose).length;
}

/** 분량 규칙: 2,000자 미만 1장 / 2,000~3,000자 2장 / 3,000자 초과 3장. */
export function illustrationCountFor(chars: number): number {
  if (chars < 2000) return 1;
  return chars <= 3000 ? 2 : 3;
}

/** 그릴 목록 — 본문에 자리 주석이 있으면 그것(이름·개수·위치), 없으면 분량 규칙으로 장수만 정하고 장면·이름은 모델이. */
export function planIllustrations(body: string): IllustrationSlot[] {
  const slots = parseIllustrationSlots(body);
  if (slots.length > 0) return slots;
  return Array.from({ length: illustrationCountFor(countBodyChars(body)) }, (_, i) => ({
    n: i + 1,
  }));
}

/** 출력에서 삽화를 가르는 줄 — `===ILLUST 1: 설명===`. SVG를 JSON 문자열에 넣게 하지 않는다(따옴표 이스케이프에서 깨진다). */
const MARKER = /^[ \t]*===ILLUST[ \t]+(\d+)[ \t]*(?::[ \t]*(.*?))?[ \t]*===[ \t]*$/gm;

const STYLE_RULES = `[그림 규칙 — 소프트 UI]
- 캔버스는 1200×520. 각 삽화는 <svg width="1200" height="520" viewBox="0 0 1200 520" xmlns="http://www.w3.org/2000/svg"> … </svg> 하나입니다.
- 배경은 그리지 않습니다(연한 복숭아색 배경은 렌더러가 입힙니다. 캔버스 전체를 덮는 rect 금지).
- 흰 둥근 카드(rect fill="#FFFFFF" rx 18~22 filter="url(#soft)") + 회색 단순 도형 아이콘 + 빨간 포인트 하나가 기본입니다. 작은 칩·버튼의 그림자는 filter="url(#softSm)". 그림자는 이 두 공용 필터만 씁니다(직접 blur·필터 정의 금지).
- 화살표는 선 끝에 marker-end="url(#arr)"(회색, 선 색 #C9CDD4) 또는 marker-end="url(#arrRed)"(빨강, 선 색 #EC3B24). 점선은 stroke-dasharray="6 8".
- 팔레트: 카드 #FFFFFF / 카드 안 회색 타일·헤더 #F2F2F4 / 코드 박스 #F7F7F9 + 테두리 #E6E7EA / 구분선 #ECE4E0 / 흐린 바(텍스트 자리) #E6E7EA / 화살표·연결선 #C9CDD4 / 글자 #15171A / 보조 글자 #5A5F68 / 캡션 #8A8F98 / 아이콘 #5B6472 / 진한 선 #3A3E45 / 강조 #EC3B24 · 연한 강조 배경 #FFE9E6. 보조 의미색은 꼭 필요할 때만: 성공 #14855A·#E6F6EE, 정보 #2563EB·#E8F1FF, 경고 #B45309·#FFF3D6.
- 한 장면에 강조는 빨강 하나가 원칙입니다.
- 글자: 본문 글자는 font-weight 700~900, 코드·라벨은 font-family="monospace". 글자가 카드 밖으로 나가거나 서로 겹치지 않게 font-size와 카드 폭을 맞춥니다(한글 한 글자 폭 ≈ font-size, 영문·숫자 ≈ font-size × 0.6).
- 하단 y≈490에 캡션 한 줄: <text x="600" y="490" text-anchor="middle" font-size="16" fill="#8A8F98" letter-spacing="1">…</text>. 그림 요소는 y 40~450 안에 둡니다.
- 구도: 도형·선·짧은 글자로 개념을 은유하는 한 장면입니다. 흐름·구조·비교가 더 잘 맞는 자리는 다이어그램(상자와 화살표)으로 그려도 됩니다.
- 쓸 수 있는 요소: svg, g, rect, circle, ellipse, line, polyline, polygon, path, text, tspan. 속성은 도형·글자 속성과 transform, filter, marker-end. style 태그, image, use, foreignObject, 그라데이션·필터 정의, 외부 주소는 쓰지 않습니다(걸러져 사라집니다).
- 사람 얼굴·손 같은 유기적 형태, 질감, 로고, 실제 서비스 화면은 그리지 않습니다. 회사명·서비스명·실제 도메인·키·실제 고객 문구는 넣지 않고 화면 예시는 "몰 A", "PG사", mall-a.example 같은 일반 이름으로 씁니다.`;

const EXAMPLE = `예시(다른 글의 삽화 — 구도와 요소 쓰는 법만 참고하고 내용은 이 글에 맞게 새로 그립니다):
===ILLUST 1: 세션은_있는데_401===
<svg width="1200" height="520" viewBox="0 0 1200 520" xmlns="http://www.w3.org/2000/svg">
  <rect x="150" y="110" width="360" height="270" rx="20" fill="#FFFFFF" filter="url(#soft)"/>
  <rect x="150" y="110" width="360" height="56" rx="20" fill="#F2F2F4"/>
  <text x="178" y="146" font-family="monospace" font-size="20" fill="#15171A">browser</text>
  <rect x="182" y="196" width="296" height="54" rx="12" fill="#F7F7F9" stroke="#E6E7EA"/>
  <text x="200" y="230" font-family="monospace" font-size="18" fill="#5A5F68">session = "abc…"</text>
  <rect x="182" y="272" width="180" height="12" rx="6" fill="#E6E7EA"/>
  <rect x="182" y="298" width="120" height="12" rx="6" fill="#E6E7EA"/>
  <text x="182" y="350" font-size="20" font-weight="800" fill="#15171A">로그인된 화면</text>
  <line x1="530" y1="245" x2="668" y2="245" stroke="#EC3B24" stroke-width="3" stroke-dasharray="6 8" marker-end="url(#arrRed)"/>
  <rect x="690" y="110" width="360" height="270" rx="20" fill="#FFFFFF" filter="url(#soft)"/>
  <rect x="690" y="110" width="360" height="56" rx="20" fill="#F2F2F4"/>
  <text x="718" y="146" font-family="monospace" font-size="20" fill="#15171A">api</text>
  <rect x="722" y="196" width="296" height="54" rx="12" fill="#FFE9E6"/>
  <text x="740" y="230" font-family="monospace" font-size="18" fill="#EC3B24">401 Unauthorized</text>
  <rect x="722" y="272" width="200" height="12" rx="6" fill="#E6E7EA"/>
  <text x="722" y="350" font-size="20" font-weight="800" fill="#15171A">세션을 모르는 서버</text>
  <text x="600" y="490" text-anchor="middle" font-size="16" fill="#8A8F98" letter-spacing="1">세션은 있는데 401 — 브라우저와 서버가 서로 다른 것을 믿는다</text>
</svg>`;

const KO_SYSTEM = `당신은 기술 블로그 글의 본문 삽화를 SVG로 그리는 일러스트 담당자입니다. 아래 벨로그 글을 읽고 지정된 삽화를 그립니다.

${STYLE_RULES}

[출력 형식]
- 삽화마다 먼저 \`===ILLUST 번호: 설명===\` 한 줄, 그 아래에 SVG 하나. 설명은 파일 이름에 들어갈 짧은 이름입니다(한글·영문·숫자, 공백 대신 _, 20자 이내). 목록에 이름이 정해져 있으면 그 이름을 그대로 씁니다.
- 지정된 번호를 모두, 번호 순서대로 씁니다. 코드 펜스나 설명 문장을 붙이지 않습니다.

${EXAMPLE}`;

const JA_SYSTEM = `당신은 기술 블로그 삽화의 일본어 캡션판을 만드는 담당자입니다. 아래 한국어 삽화 SVG의 **글자만** 일본어로 바꿉니다.

- 구도·좌표·도형·색은 그대로 둡니다. <text>·<tspan> 안의 글자만 바꿉니다.
- font-family="monospace" 글자(코드·식별자·영문 라벨·숫자)는 그대로 둡니다.
- 용어는 아래 Zenn 기사에서 쓴 표현에 맞춥니다. 문체는 간결한 체언止め·である体로, 캡션은 한 줄입니다.
- 일본어가 길어져 카드 밖으로 나가거나 겹치면 font-size를 줄이거나 줄을 나누거나(tspan) 카드 폭을 넓혀 맞춥니다. 그 밖의 도형은 건드리지 않습니다.
- 회사명·서비스명·실제 도메인은 넣지 않습니다.

[출력 형식]
- 입력과 같은 \`===ILLUST 번호: 설명===\` 줄(그대로 복사), 그 아래에 바꾼 SVG 하나. 입력의 삽화를 모두, 같은 순서로 씁니다. 코드 펜스나 설명 문장을 붙이지 않습니다.`;

/** 본문 → 프롬프트용(상한에서 자른다). */
const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}\n\n(이하 생략)` : text;

/** 한국어 삽화 프롬프트 — 테스트용으로 공개. 입력은 벨로그 본문과 그릴 목록(+수정 지시)뿐이다. */
export function buildIllustrationPrompt(
  input: { body: string; slots: readonly IllustrationSlot[]; instruction?: string },
  limits: { illustrationBodyChars: number },
): { system: string; prompt: string } {
  const preset = input.slots.some((slot) => slot.name !== undefined);
  const lines = [
    '# 그릴 삽화',
    preset
      ? '본문의 삽화 자리 주석(<!-- [삽화] … -->)에 맞춰 아래 삽화를 그립니다. 그 자리의 앞뒤 내용을 한 장면으로 옮깁니다.'
      : `삽화 ${input.slots.length}장을 그립니다. 위치 원칙: 1장이면 서론의 사건 장면. 2장이면 서론 + 핵심 설계 결정(보통 "## 1."). 3장이면 서론 + 핵심 결정 + 삽질·결과 중 하나. 코드 블록 바로 뒤의 내용이면 "코드에서 본 것을 그림으로 다시 짚는" 장면이 됩니다.`,
    ...input.slots.map((slot) =>
      slot.name === undefined
        ? `- ${slot.n}번`
        : `- ${slot.n}번: ${slot.name}${slot.where === undefined ? '' : ` — 자리: ${slot.where}`}`,
    ),
    '',
  ];
  if (input.instruction !== undefined && input.instruction.trim() !== '')
    lines.push('# 수정 지시(재실행)', input.instruction.trim(), '');
  lines.push('# 벨로그 본문', clip(input.body, limits.illustrationBodyChars), '');
  return { system: KO_SYSTEM, prompt: lines.join('\n') };
}

export interface IllustrationDrawing {
  n: number;
  /** 파일 이름 줄기 — `illust1_post_table_split`. */
  name: string;
  /** 거른 SVG(저장·렌더용). */
  svg: string;
}

/** 삽화들을 출력 형식 그대로 다시 쓴다 — 일본어판 프롬프트의 입력. 이름에서 `illustN_`은 떼고 설명만. */
export function renderIllustrationBlocks(drawings: readonly IllustrationDrawing[]): string {
  return drawings
    .map((d) => `===ILLUST ${d.n}: ${d.name.replace(/^illust\d+_?/i, '')}===\n${d.svg}`)
    .join('\n\n');
}

/** 일본어 캡션판 프롬프트 — 한국어 삽화 SVG + 용어를 맞출 Zenn 기사. */
export function buildIllustrationJaPrompt(
  input: { drawings: readonly IllustrationDrawing[]; zenn: string },
  limits: { illustrationZennChars: number },
): { system: string; prompt: string } {
  return {
    system: JA_SYSTEM,
    prompt: [
      '# 한국어 삽화',
      renderIllustrationBlocks(input.drawings),
      '',
      '# Zenn 기사(용어 참고)',
      clip(input.zenn, limits.illustrationZennChars),
      '',
    ].join('\n'),
  };
}

/**
 * 모델 출력 → 삽화 목록. 구분 줄로 나눠 번호별 SVG를 거른다. **목록의 번호가 전부 있고 각각 svg 요소가 있어야** 한다 —
 * 하나라도 빠지면 undefined(호출부가 재시도 가능 실패로). 목록에 없는 번호·같은 번호의 두 번째 블록은 버린다.
 * 이름은 목록에 정해져 있으면 그것, 없으면 구분 줄의 설명으로 `illustN_<설명>`(설명이 비면 `illustN`).
 */
export function parseIllustrationOutput(
  text: string,
  slots: readonly IllustrationSlot[],
): IllustrationDrawing[] | undefined {
  const marks = [...text.matchAll(MARKER)];
  const blocks = new Map<number, { label: string; svg: string }>();
  marks.forEach((mark, i) => {
    const n = Number(mark[1]);
    if (blocks.has(n)) return;
    const start = mark.index + mark[0].length;
    const end = i + 1 < marks.length ? marks[i + 1]!.index : text.length;
    const svg = cleanIllustrationSvg(text.slice(start, end));
    if (svg !== undefined) blocks.set(n, { label: (mark[2] ?? '').trim(), svg });
  });
  const drawings: IllustrationDrawing[] = [];
  for (const slot of slots) {
    const block = blocks.get(slot.n);
    if (block === undefined) return undefined;
    const label = toFileStem(
      block.label.replace(/\.(?:png|svg)$/i, '').replace(/^illust\d+_?/i, ''),
    );
    const name = slot.name ?? (block.label === '' ? `illust${slot.n}` : `illust${slot.n}_${label}`);
    drawings.push({ n: slot.n, name, svg: block.svg });
  }
  return drawings;
}

export interface IllustrationManifest {
  version: 1;
  items: { n: number; name: string; where?: string }[];
}

export function renderIllustrationManifest(
  drawings: readonly IllustrationDrawing[],
  slots: readonly IllustrationSlot[],
): string {
  const manifest: IllustrationManifest = {
    version: 1,
    items: drawings.map((d) => {
      const where = slots.find((slot) => slot.n === d.n)?.where;
      return { n: d.n, name: d.name, ...(where === undefined ? {} : { where }) };
    }),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** 목록 파일 읽기 — 형태가 어긋나면 undefined. 이름은 파일 이름으로 다시 다듬는다(파일이 손으로 고쳐졌어도 경로 밖으로 못 나간다). */
export function parseIllustrationManifest(text: string): IllustrationManifest | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof json !== 'object' || json === null) return undefined;
  const { items } = json as Record<string, unknown>;
  if (!Array.isArray(items)) return undefined;
  const out: IllustrationManifest['items'] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) return undefined;
    const { n, name, where } = item as Record<string, unknown>;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > ILLUSTRATIONS_MAX)
      return undefined;
    if (typeof name !== 'string' || name.trim() === '') return undefined;
    out.push({ n, name: toFileStem(name), ...(typeof where === 'string' ? { where } : {}) });
  }
  return { version: 1, items: out };
}
