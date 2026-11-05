import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TodoRunRow } from '../../../lib/home-runs';
import { TodoCard } from './TodoCard';

const row = (id: string, overrides: Partial<TodoRunRow> = {}): TodoRunRow => ({
  id,
  title: `주제 ${id}`,
  meta: '근거 검증 완료 · 11. 6. 01:30',
  flag: undefined,
  badge: { label: '승인 대기', tone: 'warning', pulse: false },
  href: `/runs?tab=active&id=${id}`,
  ...overrides,
});

describe('TodoCard', () => {
  it('승인 대기 행을 제목·메타·배지·검수 링크로 보여 준다', () => {
    render(
      <TodoCard
        view={{ rows: [row('a'), row('b')], moreCount: 0, moreHref: '/runs?pending=1' }}
        error={undefined}
      />,
    );

    expect(screen.getByRole('heading', { name: '지금 할 일' })).toBeTruthy();
    expect(screen.getByText('주제 a')).toBeTruthy();
    expect(screen.getAllByText('근거 검증 완료 · 11. 6. 01:30')).toHaveLength(2);
    expect(screen.getAllByText('승인 대기')).toHaveLength(2);
    expect(screen.getByRole('link', { name: '주제 a 검수' }).getAttribute('href')).toBe(
      '/runs?tab=active&id=a',
    );
    expect(screen.queryByText(/더 보기/)).toBeNull();
  });

  it('근거 없는 주장이 있는 행만 "근거 없음 n"', () => {
    render(
      <TodoCard
        view={{
          rows: [row('a', { flag: '근거 없음 2' }), row('b')],
          moreCount: 0,
          moreHref: '/runs',
        }}
        error={undefined}
      />,
    );

    expect(screen.getAllByText(/근거 없음/)).toHaveLength(1);
    expect(screen.getByText('근거 없음 2')).toBeTruthy();
  });

  it('넘치면 "n개 더 보기" 링크', () => {
    render(
      <TodoCard
        view={{ rows: [row('a')], moreCount: 3, moreHref: '/runs?tab=active&pending=1' }}
        error={undefined}
      />,
    );

    expect(screen.getByRole('link', { name: '3개 더 보기' }).getAttribute('href')).toBe(
      '/runs?tab=active&pending=1',
    );
  });

  it('승인 대기가 없으면 빈 상태', () => {
    render(<TodoCard view={{ rows: [], moreCount: 0, moreHref: '/runs' }} error={undefined} />);

    expect(screen.getByText('검수할 초안이 없습니다.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('조회 실패면 문구를 alert로', () => {
    render(<TodoCard view={undefined} error="실행 현황을 불러오지 못했습니다" />);

    expect(screen.getByRole('alert').textContent).toContain('불러오지 못했습니다');
    expect(screen.queryByText('검수할 초안이 없습니다.')).toBeNull();
  });
});
