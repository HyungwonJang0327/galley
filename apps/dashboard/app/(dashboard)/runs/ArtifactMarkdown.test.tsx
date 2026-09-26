import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArtifactMarkdown } from './ArtifactMarkdown';

describe('ArtifactMarkdown', () => {
  it('제목·목록·코드 블록을 렌더한다', () => {
    render(<ArtifactMarkdown text={'# 제목\n\n- 하나\n- 둘\n\n```ts\nconst a = 1;\n```'} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('제목');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(document.querySelector('pre code')?.textContent).toBe('const a = 1;\n');
  });

  it('GFM 표·체크리스트·취소선을 렌더한다(기존 글 21/49편이 표를 쓴다)', () => {
    render(<ArtifactMarkdown text={'| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] 됨\n\n~~취소~~'} />);

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '2']);
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(document.querySelector('del')?.textContent).toBe('취소');
  });

  it('raw HTML은 렌더하지 않고 글자로 보여 준다(sanitize 불필요)', () => {
    render(<ArtifactMarkdown text={'앞 <script>alert(1)</script> <b>굵게</b> 뒤'} />);

    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect(document.body.textContent).toContain('<b>굵게</b>');
  });
});
