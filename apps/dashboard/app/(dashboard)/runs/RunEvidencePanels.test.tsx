import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { EvidencePanel } from './RunEvidencePanels';
import type { EvidenceView } from '../../../lib/run-artifacts';

const evidence = (snippetPreview: string[], hasMore: boolean): EvidenceView => ({
  linked: 1,
  discovered: 0,
  unreadable: 0,
  filtered: true,
  items: [
    {
      path: 'prisma/schema.prisma',
      commit: 'abc1234',
      lineRange: { start: 10, end: 14 },
      date: '2026-06-20',
      source: 'linked',
      snippetPreview,
      hasMore,
      redacted: false,
      truncated: false,
    },
  ],
});

describe('EvidencePanel — 조각 미리보기', () => {
  // 브라우저는 <pre> 바로 뒤의 첫 줄바꿈을 버린다. React는 <pre>의 자식이 **문자열 하나**일 때만 줄바꿈을 하나 더 넣어 맞춘다 —
  // 자식이 둘로 나뉘면 서버가 그린 글과 브라우저가 읽은 글이 달라져 hydration 오류가 난다.
  it('빈 줄로 시작하는 조각은 서버 HTML에서 줄바꿈이 하나 더 붙는다(브라우저가 하나를 버려도 글이 같다)', () => {
    const html = renderToString(
      <EvidencePanel evidence={evidence(['', '  @@index([tenantId])'], true)} />,
    );
    expect(html).toContain('aria-label="근거 조각 미리보기">\n\n  @@index([tenantId])\n…</pre>');
  });

  it('보통 조각은 그대로, 더 없으면 말줄임이 없다', () => {
    const html = renderToString(<EvidencePanel evidence={evidence(['const a = 1;'], false)} />);
    expect(html).toContain('aria-label="근거 조각 미리보기">const a = 1;</pre>');
  });
});
