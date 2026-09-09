import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListRow } from './ListRow';
import { ListRows } from './ListRows';

describe('ListRow', () => {
  it('<li>로 title을 렌더한다', () => {
    render(
      <ul>
        <ListRow title="제목" />
      </ul>,
    );
    expect(screen.getByText('제목').closest('li')).toBeTruthy();
  });

  it('leading·meta·trailing·actions 슬롯을 렌더한다', () => {
    render(
      <ul>
        <ListRow
          leading={<span>핸들</span>}
          title="제목"
          meta="보조"
          trailing={<span>배지</span>}
          actions={<button type="button">메뉴</button>}
        />
      </ul>,
    );
    expect(screen.getByText('핸들')).toBeTruthy();
    expect(screen.getByText('보조')).toBeTruthy();
    expect(screen.getByText('배지')).toBeTruthy();
    expect(screen.getByRole('button', { name: '메뉴' })).toBeTruthy();
  });

  it('isActive면 aria-current=true를 붙인다', () => {
    render(
      <ul>
        <ListRow title="제목" isActive />
      </ul>,
    );
    expect(screen.getByText('제목').closest('[aria-current="true"]')).toBeTruthy();
  });

  it('className을 병합하고 나머지 li 속성을 전달한다', () => {
    render(
      <ul>
        <ListRow title="제목" className="own" data-testid="row" />
      </ul>,
    );
    const el = screen.getByTestId('row');
    expect(el.tagName).toBe('LI');
    expect(el.className).toContain('own');
  });
});

describe('ListRows', () => {
  it('<ul>로 자식을 감싸고 className을 병합한다', () => {
    render(
      <ListRows className="own" data-testid="rows">
        <ListRow title="하나" />
        <ListRow title="둘" />
      </ListRows>,
    );
    const el = screen.getByTestId('rows');
    expect(el.tagName).toBe('UL');
    expect(el.className).toContain('own');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
