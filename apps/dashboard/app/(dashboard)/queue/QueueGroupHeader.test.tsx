import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueGroupHeader } from './QueueGroupHeader';

describe('QueueGroupHeader', () => {
  it('키 배지(시리즈 D로 읽힘)와 이름, 편이 있으면 안내 없음', () => {
    render(
      <ul>
        <QueueGroupHeader group={{ key: 'A', name: '앱 만들기', hint: undefined, position: 1 }} />
      </ul>,
    );
    expect(screen.getByRole('img', { name: '시리즈 A' }).textContent).toBe('A');
    expect(screen.getByRole('listitem').textContent).toBe('A앱 만들기');
  });

  it('후보에 편이 없으면 안내를 붙인다', () => {
    render(
      <ul>
        <QueueGroupHeader
          group={{ key: 'D', name: '정의만 남음', hint: '편 없음 · 대기 4편', position: 2 }}
        />
      </ul>,
    );
    expect(screen.getByRole('listitem').textContent).toBe('D정의만 남음편 없음 · 대기 4편');
  });
});
