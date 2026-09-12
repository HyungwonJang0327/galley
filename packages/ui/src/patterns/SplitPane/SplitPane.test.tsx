import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitPane } from './SplitPane';

describe('SplitPane', () => {
  it('list·children을 함께 렌더한다', () => {
    render(<SplitPane list={<span>목록</span>}>본문</SplitPane>);
    expect(screen.getByText('목록')).toBeTruthy();
    expect(screen.getByText('본문')).toBeTruthy();
  });

  it('header·footer를 주면 렌더한다', () => {
    render(
      <SplitPane list="목록" header={<span>머리</span>} footer={<span>바닥</span>}>
        본문
      </SplitPane>,
    );
    expect(screen.getByText('머리')).toBeTruthy();
    expect(screen.getByText('바닥')).toBeTruthy();
  });

  it('라벨을 주면 두 영역을 region으로 노출한다', () => {
    render(
      <SplitPane list="목록" listLabel="좌" detailLabel="우">
        본문
      </SplitPane>,
    );
    expect(screen.getByRole('region', { name: '좌' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '우' })).toBeTruthy();
  });

  it('라벨이 없으면 region으로 노출하지 않는다', () => {
    render(<SplitPane list="목록">본문</SplitPane>);
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });

  it('className을 병합한다', () => {
    const { container } = render(
      <SplitPane list="목록" className="own">
        본문
      </SplitPane>,
    );
    expect(container.firstElementChild?.className).toContain('own');
  });
});
