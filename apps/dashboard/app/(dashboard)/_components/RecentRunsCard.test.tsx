import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RecentRunRow } from '../../../lib/home-runs';
import { RecentRunsCard } from './RecentRunsCard';

const row = (id: string, overrides: Partial<RecentRunRow> = {}): RecentRunRow => ({
  id,
  title: `주제 ${id}`,
  badge: { label: '완료', tone: 'success', pulse: false },
  model: 'Claude X',
  time: '11. 5. 02:00',
  href: `/runs?tab=done&id=${id}`,
  ...overrides,
});

describe('RecentRunsCard', () => {
  it('행을 제목 링크·모델·시간·결과 배지로 보여 주고, 헤더에 이력 전체 링크', () => {
    render(
      <RecentRunsCard
        rows={[row('a'), row('b', { badge: { label: '실패', tone: 'danger', pulse: false } })]}
        error={undefined}
      />,
    );

    expect(screen.getByRole('heading', { name: '최근 실행' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '주제 a' }).getAttribute('href')).toBe(
      '/runs?tab=done&id=a',
    );
    expect(screen.getAllByText('Claude X · 11. 5. 02:00')).toHaveLength(2);
    expect(screen.getByText('완료')).toBeTruthy();
    expect(screen.getByText('실패')).toBeTruthy();
    expect(screen.getByRole('link', { name: '이력 전체 →' }).getAttribute('href')).toBe(
      '/runs/history',
    );
  });

  it('실행이 없으면 빈 상태(이력 링크는 그대로)', () => {
    render(<RecentRunsCard rows={[]} error={undefined} />);

    expect(screen.getByText('아직 실행한 기록이 없습니다.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '이력 전체 →' })).toBeTruthy();
  });

  it('조회 실패면 문구를 alert로', () => {
    render(<RecentRunsCard rows={undefined} error="실행 현황을 불러오지 못했습니다" />);

    expect(screen.getByRole('alert').textContent).toContain('불러오지 못했습니다');
  });
});
