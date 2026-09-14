import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunStepDots } from './RunStepDots';

describe('RunStepDots', () => {
  it('점 하나에 status 하나, 전체는 라벨 하나로 읽힌다', () => {
    render(
      <RunStepDots
        label="단계 진행 1/3"
        dots={[
          { name: 'a', status: 'done', label: 'A 완료' },
          { name: 'b', status: 'active', label: 'B 진행 중' },
          { name: 'c', status: 'pending', label: 'C 대기' },
        ]}
      />,
    );

    const group = screen.getByRole('img', { name: '단계 진행 1/3' });
    const dots = [...group.querySelectorAll('[data-status]')];
    expect(dots.map((d) => d.getAttribute('data-status'))).toEqual(['done', 'active', 'pending']);
    expect(dots.map((d) => d.getAttribute('title'))).toEqual(['A 완료', 'B 진행 중', 'C 대기']);
  });
});
