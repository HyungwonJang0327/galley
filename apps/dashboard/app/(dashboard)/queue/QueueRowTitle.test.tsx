import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueueRowTitle } from './QueueRowTitle';

describe('QueueRowTitle', () => {
  it('시리즈가 아니면 제목만', () => {
    const { container } = render(<QueueRowTitle title="일반 주제" series={undefined} />);
    expect(container.textContent).toBe('일반 주제');
    expect(screen.queryByLabelText(/^시리즈 /)).toBeNull();
  });

  it('시리즈 편이면 배지 뒤에 제목 — 태그는 제목 텍스트에 섞이지 않는다', () => {
    render(
      <QueueRowTitle
        title="둘째 편"
        series={{ label: 'A-2', tooltip: '앱 만들기 · 2/3편', alreadyPublished: false }}
      />,
    );
    const badge = screen.getByLabelText('시리즈 A-2');
    expect(badge.textContent).toBe('A-2');
    expect(badge.nextSibling?.textContent).toBe('둘째 편');
  });

  it('툴팁이 있으면 배지에 포커스했을 때 시리즈명 · N/M편', async () => {
    render(
      <QueueRowTitle
        title="둘째 편"
        series={{ label: 'A-2', tooltip: '앱 만들기 · 2/3편', alreadyPublished: false }}
      />,
    );
    fireEvent.focus(screen.getByLabelText('시리즈 A-2'));
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('앱 만들기 · 2/3편'));
  });

  it('정의 줄이 없어 툴팁이 없으면 배지만', () => {
    render(
      <QueueRowTitle
        title="둘째 편"
        series={{ label: 'Z-1', tooltip: undefined, alreadyPublished: false }}
      />,
    );
    const badge = screen.getByLabelText('시리즈 Z-1');
    fireEvent.focus(badge);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
