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

  it('제목 위계 — h1은 h2보다 크게(토큰 title > h2)', () => {
    render(<ArtifactMarkdown text={'# 글 제목\n\n## 절'} />);

    const h1 = screen.getByRole('heading', { level: 1 });
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h1.textContent).toBe('글 제목');
    expect(h2.textContent).toBe('절');
    // CSS Modules 클래스는 happy-dom이 계산하지 않아 요소 존재까지만 — 크기는 tokens(title 22 > h2 16).
  });

  it('링크는 새 탭(noopener), javascript: 주소는 href에서 사라진다', () => {
    render(<ArtifactMarkdown text={'[문서](https://example.com/a) [나쁨](javascript:alert(1))'} />);

    const doc = screen.getByRole('link', { name: '문서' });
    expect(doc.getAttribute('href')).toBe('https://example.com/a');
    expect(doc.getAttribute('target')).toBe('_blank');
    expect(doc.getAttribute('rel')).toBe('noopener noreferrer');
    // 안전하지 않은 프로토콜은 react-markdown 기본 urlTransform이 href를 비운다 — 링크 role조차 없다.
    const anchors = Array.from(document.querySelectorAll('a'));
    expect(anchors).toHaveLength(2);
    expect(anchors.map((a) => a.getAttribute('href') ?? '').join(' ')).not.toContain('javascript:');
  });

  it('이미지는 렌더하지 않고 자리 글자만(브라우저가 밖으로 요청을 보내지 않는다)', () => {
    render(<ArtifactMarkdown text={'앞 ![스크린샷](https://example.com/x.png) 뒤'} />);

    expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).toContain(
      '이미지 자리: 스크린샷 (https://example.com/x.png)',
    );
  });

  it('raw HTML은 렌더하지 않고 글자로 보여 준다(sanitize 불필요)', () => {
    render(<ArtifactMarkdown text={'앞 <script>alert(1)</script> <b>굵게</b> 뒤'} />);

    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect(document.body.textContent).toContain('<b>굵게</b>');
  });
});
