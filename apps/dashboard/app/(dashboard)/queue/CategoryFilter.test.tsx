import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { queueHref } from '../../../lib/queue-tabs';
import { CategoryFilter } from './CategoryFilter';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

// 라우터 컨텍스트 대신 push만 본다. 선택 결과는 URL 이동으로만 나타난다.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

async function pick(name: RegExp) {
  const trigger = screen.getByRole('combobox', { name: '카테고리' });
  fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
  const option = screen.getByRole('option', { name });
  fireEvent.pointerDown(option, { pointerType: 'mouse', button: 0 });
  fireEvent.click(option);
}

afterEach(() => {
  push.mockReset();
});

describe('CategoryFilter', () => {
  it('선택이 없으면 "전체 카테고리"', () => {
    render(<CategoryFilter categories={['프론트', '백엔드']} value={undefined} />);
    expect(screen.getByRole('combobox', { name: '카테고리' }).textContent).toContain(
      '전체 카테고리',
    );
  });

  it('카테고리를 고르면 후보 탭 ?category=로 이동', async () => {
    render(<CategoryFilter categories={['프론트', '백엔드']} value={undefined} />);
    await pick(/백엔드/);
    expect(push).toHaveBeenCalledWith(queueHref('candidates', '백엔드'));
  });

  it('"전체 카테고리"를 고르면 ?category= 없이 이동', async () => {
    render(<CategoryFilter categories={['프론트', '백엔드']} value="프론트" />);
    await pick(/전체 카테고리/);
    expect(push).toHaveBeenCalledWith(queueHref('candidates'));
  });
});
