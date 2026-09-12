import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextRunCard } from './NextRunCard';

describe('NextRunCard', () => {
  it('맨 위 주제를 제목·카테고리와 함께 크게 보여 준다', () => {
    render(<NextRunCard view={{ top: { title: '첫 주제', category: '프론트' }, rest: [] }} />);

    expect(screen.getByText('첫 주제')).toBeTruthy();
    expect(screen.getByText('프론트')).toBeTruthy();
  });

  it('2~4위는 작은 행으로 보여 준다', () => {
    render(
      <NextRunCard
        view={{
          top: { title: '첫 주제', category: undefined },
          rest: [
            { title: '둘째', category: undefined },
            { title: '셋째', category: '백엔드' },
          ],
        }}
      />,
    );

    expect(screen.getByText('둘째')).toBeTruthy();
    expect(screen.getByText('셋째')).toBeTruthy();
  });

  it('"지금 실행"은 사유와 함께 비활성(실행 화면 전)', () => {
    render(<NextRunCard view={{ top: { title: '첫 주제', category: undefined }, rest: [] }} />);

    const run = screen.getByRole('button', { name: '지금 실행' });
    expect(run.hasAttribute('disabled')).toBe(true);
    expect(run.getAttribute('title')).toContain('준비 중');
  });

  it('"큐 편집"은 대기 탭 링크다', () => {
    render(<NextRunCard view={{ top: { title: '첫 주제', category: undefined }, rest: [] }} />);

    expect(screen.getByRole('link', { name: '큐 편집' }).getAttribute('href')).toBe(
      '/queue?tab=waiting',
    );
  });

  it('대기가 비면 안내와 후보 보기 링크를 보여 준다', () => {
    render(<NextRunCard view={{ top: undefined, rest: [] }} />);

    expect(screen.getByText(/대기 중인 주제가 없습니다/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '후보 보기' }).getAttribute('href')).toBe(
      '/queue?tab=candidates',
    );
    expect(screen.queryByRole('button', { name: '지금 실행' })).toBeNull();
  });
});
