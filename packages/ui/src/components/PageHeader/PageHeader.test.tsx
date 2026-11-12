import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('title을 h1으로 렌더한다', () => {
    render(<PageHeader title="제목" />);
    expect(screen.getByRole('heading', { level: 1, name: '제목' })).toBeTruthy();
  });

  it('actions를 렌더한다', () => {
    render(<PageHeader title="제목" actions={<button>액션</button>} />);
    expect(screen.getByRole('button', { name: '액션' })).toBeTruthy();
  });

  it('eyebrow를 제목 위에 렌더한다(제목은 그대로 h1)', () => {
    render(<PageHeader title="모델·비용" eyebrow={<span>설정 › 모델·비용</span>} />);
    const header = screen.getByRole('banner');
    const h1 = screen.getByRole('heading', { level: 1, name: '모델·비용' });
    const eyebrow = screen.getByText('설정 › 모델·비용');
    expect(header.contains(eyebrow)).toBe(true);
    // DOM 순서: eyebrow가 h1보다 앞
    expect(eyebrow.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('className을 루트 header에 병합한다', () => {
    render(<PageHeader title="제목" className="own" />);
    expect(screen.getByRole('banner').className).toContain('own');
  });
});
