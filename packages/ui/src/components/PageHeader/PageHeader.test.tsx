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
});
