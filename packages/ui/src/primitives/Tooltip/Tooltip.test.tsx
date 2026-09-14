import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Tooltip } from './Tooltip';

const TRIGGER = <button type="button">아이콘</button>;

/**
 * 실제 마우스 순서: pointerenter(포인터 종류) → mouseenter. Base UI는 트리거에 native
 * mouseenter 리스너를 건다 — testing-library의 fireEvent.mouseEnter는 React용 mouseover를 쏘므로
 * 직접 만든다.
 */
function hover(element: HTMLElement) {
  fireEvent.pointerEnter(element, { pointerType: 'mouse' });
  fireEvent(element, new MouseEvent('mouseenter', { bubbles: false }));
}

function unhover(element: HTMLElement) {
  fireEvent(element, new MouseEvent('mouseleave', { bubbles: false }));
}

describe('Tooltip', () => {
  it('닫힌 상태에서는 트리거만 있고 tooltip은 없다', () => {
    render(<Tooltip trigger={TRIGGER} content="설명" />);
    expect(screen.getByRole('button', { name: '아이콘' })).toBeTruthy();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('마우스를 올리면 delay 뒤 tooltip이 열리고 내용이 보인다', async () => {
    render(<Tooltip trigger={TRIGGER} content="설명" delay={0} />);
    const trigger = screen.getByRole('button', { name: '아이콘' });
    await act(async () => {
      hover(trigger);
    });
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy());
    expect(screen.getByRole('tooltip').textContent).toBe('설명');
  });

  it('마우스가 떠나면 닫힌다', async () => {
    render(<Tooltip trigger={TRIGGER} content="설명" delay={0} />);
    const trigger = screen.getByRole('button', { name: '아이콘' });
    await act(async () => {
      hover(trigger);
    });
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy());
    await act(async () => {
      unhover(trigger);
    });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('트리거의 접근성 이름은 그대로다(툴팁이 이름을 대신하지 않는다)', () => {
    render(<Tooltip trigger={<button type="button" aria-label="메뉴 열기" />} content="설명" />);
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toBeTruthy();
  });
});
