// 발행정보(`publish.md`) 렌더러 — 순수 함수. 사람이 발행하면서 읽는 파일이라 형식은 blog 폴더의 기존 발행정보 파일을 따른다
// (`# 발행 정보 — <제목>` 아래 소개·슬러그·썸네일·태그·Zenn 절). 여기에 근거 목록(`## 근거`, EvidenceBundle 포인터 — 조각 없음,
// decisions/evidence-collection.md BE11)·시리즈 절(decisions/series.md)·발행 체크리스트를 더한다. 모델이 쓰는 것은 소개·태그뿐이고
// 나머지는 코드가 조립한다(decisions/run-execution-model.md "발행정보는 상당 부분 EvidenceBundle 조립").
import type { EvidencePointerItem, EvidencePointers } from '../evidence/bundle.ts';
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from '../publish/thumbnail.ts';
import { seriesChecklist, type PublishChecklistItem } from './publishChecklist.ts';
import { renderSeriesPublishSection, type SeriesStepInfo } from './series.ts';

/** 소개 글자 수 상한 — 기존 발행정보 파일의 절 제목 "포스트 소개 (150자 이내)"와 같은 값. */
export const PUBLISH_INTRO_MAX_CHARS = 150;
/** 태그 개수 상한(벨로그는 태그가 많아도 되지만 모델 출력을 묶는 기준). */
export const PUBLISH_TAGS_MAX = 10;

export interface PublishInfoInput {
  /** 발행 글 제목(벨로그 H1, 시리즈 표기 뗀 것)과 posts 슬러그. */
  title: string;
  slug: string;
  /** 모델이 쓴 소개(150자 이내)·태그 — 없으면(자리표시자) 사람이 채운다. */
  intro: string;
  tags: readonly string[];
  /** Zenn 원고 frontmatter에서 옮긴 값. topics는 검수 때 사람이 채운다(BS4 ④). */
  zenn: { title: string; emoji: string; type: string; topics: readonly string[] };
  /** 근거 포인터(조각 없음). `## 근거` 목록의 출처. */
  evidence: EvidencePointers;
  /** 썸네일 파일명(postFileNames.thumbnail) — 같은 단계가 만든 PNG를 승인 시 이 이름으로 복사한다. */
  thumbnailFile: string;
  series?: SeriesStepInfo;
}

/** 파일 첫 줄 — 승인 시 posts로 옮길 때 글 제목을 여기서 다시 읽는다(`parsePublishTitle`). */
const TITLE_PREFIX = '# 발행 정보 — ';

/** 발행정보 첫 줄에서 글 제목을 읽는다. 형식이 다르면 undefined. */
export function parsePublishTitle(text: string): string | undefined {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  if (!first.startsWith(TITLE_PREFIX)) return undefined;
  const title = first.slice(TITLE_PREFIX.length).trim();
  return title === '' ? undefined : title;
}

/** 커밋 해시는 7자(git 관례), 날짜는 ISO의 날짜 부분만(시간대 표기는 사람이 읽는 목록에 필요 없다). */
function renderEvidenceLine(item: EvidencePointerItem): string {
  const sha = item.commit.slice(0, 7);
  const { start, end } = item.lineRange;
  const range = start === end ? `L${start}` : `L${start}-${end}`;
  const date = item.date.slice(0, 10);
  const note = item.note === undefined || item.note.trim() === '' ? '' : ` — ${item.note.trim()}`;
  return `- ${sha} ${item.path}:${range} (${date})${note}`;
}

/**
 * `## 근거` 절 본문 — 포인터 한 줄씩(수집 순서 그대로: manual → auto, decisions/evidence-collection.md). 같은 커밋·경로·범위는
 * 번들이 이미 한 번만 담는다. 0건이면 "근거 없음" 한 줄(근거 0개는 본문 단계가 이미 거부하지만, 파일은 스스로 설명해야 한다).
 * 못 읽은 포인터가 있으면 마지막에 한 줄로 센다.
 */
export function renderEvidenceSection(evidence: EvidencePointers): string {
  const lines = ['## 근거', ''];
  if (evidence.items.length === 0) lines.push('근거 없음');
  else lines.push(...evidence.items.map(renderEvidenceLine));
  if (evidence.unreadable > 0) lines.push('', `읽지 못한 포인터 ${evidence.unreadable}개`);
  return `${lines.join('\n')}\n`;
}

/** 체크리스트 id → 파일에 적는 한국어 문구(사람이 읽는 산출물이라 여기서 붙인다 — DB 값이 아니다). */
function checklistLine(item: PublishChecklistItem): string {
  switch (item.id) {
    case 'velog-series-add':
      return `- [ ] 벨로그에서 이 글을 "${item.params.seriesName}" 시리즈에 추가`;
    case 'velog-previous-link':
      return `- [ ] 본문의 이전 편 링크 자리표시자를 "${item.params.previousTitle}" 글 URL로 채움`;
  }
}

/** `## 발행 체크리스트` 절 — 항목이 없으면 빈 문자열(절 없음). */
export function renderChecklistSection(items: readonly PublishChecklistItem[]): string {
  if (items.length === 0) return '';
  return `## 발행 체크리스트\n\n${items.map(checklistLine).join('\n')}\n`;
}

/** `## Zenn (일본어판)` 절 — 기존 파일 표기(タイトル·emoji·type·topics). topics가 비면 검수 때 채우라고 적는다. */
function renderZennSection(zenn: PublishInfoInput['zenn']): string {
  const topics = zenn.topics.length === 0 ? '(검수 때 채움)' : zenn.topics.join(', ');
  return [
    '## Zenn (일본어판)',
    '',
    `タイトル: ${zenn.title}`,
    `emoji: ${zenn.emoji}`,
    `type: ${zenn.type}`,
    `topics: ${topics}`,
    '',
  ].join('\n');
}

/**
 * 발행정보 전체. 절 순서는 기존 파일(소개 → 슬러그 → 썸네일 → 태그 → Zenn)을 지키고 시리즈·근거·체크리스트를 뒤에 붙인다.
 * 절 사이는 빈 줄 하나, 마지막은 개행 하나로 끝난다.
 */
export function renderPublishInfo(input: PublishInfoInput): string {
  const intro = input.intro.trim() === '' ? '(작성 필요)' : input.intro.trim();
  const tags = input.tags.length === 0 ? '(작성 필요)' : input.tags.join('\n');
  const sections = [
    `${TITLE_PREFIX}${input.title}\n`,
    `## 포스트 소개 (${PUBLISH_INTRO_MAX_CHARS}자 이내)\n\n${intro}\n`,
    `## URL 슬러그\n\n${input.slug}\n`,
    `## 썸네일\n\n${input.thumbnailFile} (${THUMBNAIL_WIDTH}×${THUMBNAIL_HEIGHT}, 텍스트 전용)\n`,
    `## 태그\n\n${tags}\n`,
    renderSeriesPublishSection(input.series),
    renderZennSection(input.zenn),
    renderEvidenceSection(input.evidence),
    renderChecklistSection(seriesChecklist(input.series)),
  ].filter((section) => section !== '');
  return sections.join('\n');
}
