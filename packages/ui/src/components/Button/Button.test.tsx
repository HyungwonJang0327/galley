import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('children을 버튼으로 렌더한다', () => {
    render(<Button>저장</Button>);
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy();
  });

  it('onClick을 호출한다', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>클릭</Button>);
    fireEvent.click(screen.getByRole('button', { name: '클릭' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('type 기본값은 button (실수 submit 방지)', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('disabled를 전달한다', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        x
      </Button>,
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(btn.disabled).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost'] as const)('variant=%s 렌더', (variant) => {
    render(<Button variant={variant}>{variant}</Button>);
    expect(screen.getByRole('button', { name: variant })).toBeTruthy();
  });

  it('render를 주면 그 요소로 렌더하고 children을 넣는다(버튼 모양 링크)', () => {
    render(<Button render={<a href="/queue" />}>큐 편집</Button>);

    const link = screen.getByRole('link', { name: '큐 편집' });
    expect(link.getAttribute('href')).toBe('/queue');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('render 요소의 className을 병합한다', () => {
    render(
      <Button render={<a href="/queue" data-testid="link" className="own" />}>큐 편집</Button>,
    );

    expect(screen.getByTestId('link').className).toContain('own');
  });
});
