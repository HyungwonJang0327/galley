import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

const root = () => document.documentElement;

describe('ThemeToggle', () => {
  afterEach(() => {
    cleanup();
    root().removeAttribute('data-theme');
  });

  it('처음엔 라이트(속성 없음)이고 버튼은 다크로 가자고 한다', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: '다크 테마' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('누르면 html에 data-theme="dark"를 켜고 다시 누르면 지운다', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: '다크 테마' }));
    expect(root().getAttribute('data-theme')).toBe('dark');
    const pressed = screen.getByRole('button', { name: '라이트 테마' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(pressed);
    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(screen.getByRole('button', { name: '다크 테마' })).toBeTruthy();
  });

  it('다크인 채 언마운트되면 속성을 지운다(갤러리를 떠나면 앱은 라이트)', () => {
    const { unmount } = render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: '다크 테마' }));
    expect(root().getAttribute('data-theme')).toBe('dark');
    unmount();
    expect(root().hasAttribute('data-theme')).toBe(false);
  });
});
