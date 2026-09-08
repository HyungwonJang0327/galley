// 주제_큐.md 파서·라이터. 파일이 큐의 진실(SoT) — decisions/queue-sync-direction.md.
// 라운드트립 기준은 "구조상 동일"(섹션 구조·줄 순서·완료 날짜 유지). 빈 줄 등 표기는 정규화한다.

export type QueueStatus = '대기' | '후보' | '보류' | '완료';

export interface QueueTopic {
  title: string;
  /** 후보 섹션 ### 소제목(있을 때만). */
  category?: string;
  /** 완료 섹션 날짜 접두 YYYY-MM-DD(완료 항목만). */
  completedOn?: string;
}

export interface ParsedQueue {
  /** 첫 '## ' 헤더 이전 원문(H1+안내). 그대로 보존. */
  preamble: string;
  sections: Record<QueueStatus, QueueTopic[]>;
}

const STATUS_ORDER: QueueStatus[] = ['대기', '후보', '보류', '완료'];
const H2 = /^##\s+(대기|후보|보류|완료)\s*$/;
const H3 = /^###\s+(.*\S)\s*$/;
const ITEM = /^-\s+(.*)$/;
const COMPLETED = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/;

export function parseQueue(raw: string): ParsedQueue {
  const sections: Record<QueueStatus, QueueTopic[]> = { 대기: [], 후보: [], 보류: [], 완료: [] };
  const preambleLines: string[] = [];
  let current: QueueStatus | null = null;
  let category: string | undefined;

  for (const line of raw.split('\n')) {
    const h2 = line.match(H2);
    if (h2) {
      current = h2[1] as QueueStatus;
      category = undefined;
      continue;
    }
    if (current === null) {
      preambleLines.push(line);
      continue;
    }
    const h3 = line.match(H3);
    if (h3) {
      category = h3[1];
      continue;
    }
    const item = line.match(ITEM);
    if (!item) continue; // 빈 줄 등은 무시(정규화)

    const text = item[1] ?? '';
    if (current === '완료') {
      const c = text.match(COMPLETED);
      sections.완료.push(c ? { title: c[2] ?? '', completedOn: c[1] ?? '' } : { title: text });
    } else if (current === '후보' && category !== undefined) {
      sections.후보.push({ title: text, category });
    } else {
      sections[current].push({ title: text });
    }
  }

  return { preamble: preambleLines.join('\n').replace(/\s+$/, ''), sections };
}

export function serializeQueue(queue: ParsedQueue): string {
  const blocks: string[] = [];
  const preamble = queue.preamble.replace(/\s+$/, '');
  if (preamble) blocks.push(preamble);

  for (const status of STATUS_ORDER) {
    const lines: string[] = [`## ${status}`, ''];
    let category: string | undefined;
    for (const topic of queue.sections[status]) {
      if (status === '후보' && topic.category !== category) {
        category = topic.category;
        if (category !== undefined) {
          if (lines[lines.length - 1] !== '') lines.push('');
          lines.push(`### ${category}`, '');
        }
      }
      const prefix = topic.completedOn ? `${topic.completedOn} ` : '';
      lines.push(`- ${prefix}${topic.title}`);
    }
    blocks.push(lines.join('\n').replace(/\n+$/, ''));
  }

  return blocks.join('\n\n') + '\n';
}
