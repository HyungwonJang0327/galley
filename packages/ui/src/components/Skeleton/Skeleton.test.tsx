import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('기본은 aria-hidden이고 role이 없다', () => {
    render(<Skeleton data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('role')).toBeNull();
  });

  it('aria-hidden={false}로 숨김을 풀 수 있다(단일·여러 줄 모두)', () => {
    const { rerender } = render(<Skeleton data-testid="s" aria-hidden={false} />);
    expect(screen.getByTestId('s').getAttribute('aria-hidden')).toBe('false');
    rerender(<Skeleton data-testid="s" lines={2} aria-hidden={false} />);
    expect(screen.getByTestId('s').getAttribute('aria-hidden')).toBe('false');
  });

  it('aria-hidden={undefined}를 명시로 넘겨도 기본 숨김이 지워지지 않는다', () => {
    const { rerender } = render(<Skeleton data-testid="s" aria-hidden={undefined} />);
    expect(screen.getByTestId('s').getAttribute('aria-hidden')).toBe('true');
    rerender(<Skeleton data-testid="s" lines={2} aria-hidden={undefined} />);
    expect(screen.getByTestId('s').getAttribute('aria-hidden')).toBe('true');
  });

  it('숫자 width·height는 px, 문자열은 그대로 인라인 스타일이 된다', () => {
    const { rerender } = render(<Skeleton data-testid="s" width={120} height={16} />);
    let el = screen.getByTestId('s');
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('16px');

    rerender(<Skeleton data-testid="s" width="60%" height="var(--ui-space-5)" />);
    el = screen.getByTestId('s');
    expect(el.style.width).toBe('60%');
    expect(el.style.height).toBe('var(--ui-space-5)');
  });

  it('width를 주면 flex 행에서 눌리지 않게 flexShrink 0을 함께 넣는다(없으면 안 넣음)', () => {
    const { rerender } = render(<Skeleton data-testid="s" width={40} />);
    expect(screen.getByTestId('s').style.flexShrink).toBe('0');
    rerender(<Skeleton data-testid="s" height={40} />);
    expect(screen.getByTestId('s').style.flexShrink).toBe('');
  });

  it('width·height를 안 주면 인라인 스타일을 만들지 않는다(CSS 기본값에 맡김)', () => {
    render(<Skeleton data-testid="s" />);
    expect(screen.getByTestId('s').getAttribute('style')).toBeNull();
  });

  it('소비자 style을 유지하고 width·height만 덧붙인다', () => {
    render(<Skeleton data-testid="s" width={40} style={{ marginTop: 4 }} />);
    const el = screen.getByTestId('s');
    expect(el.style.marginTop).toBe('4px');
    expect(el.style.width).toBe('40px');
  });

  it('radius에 따라 클래스가 달라진다', () => {
    const { rerender } = render(<Skeleton data-testid="s" />);
    const sm = screen.getByTestId('s').className;
    rerender(<Skeleton data-testid="s" radius="md" />);
    const md = screen.getByTestId('s').className;
    rerender(<Skeleton data-testid="s" radius="pill" />);
    const pill = screen.getByTestId('s').className;
    rerender(<Skeleton data-testid="s" radius="lg" />);
    const lg = screen.getByTestId('s').className;
    expect(new Set([sm, md, lg, pill]).size).toBe(4);
  });

  it('lines가 2 이상이면 줄 수만큼 막대를 쌓고 마지막만 짧은 클래스를 받는다', () => {
    render(<Skeleton data-testid="s" lines={3} />);
    const root = screen.getByTestId('s');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    const bars = Array.from(root.children);
    expect(bars).toHaveLength(3);
    const first = bars[0]!;
    const last = bars[2]!;
    expect(first.className).not.toBe(last.className);
    expect(last.className).toContain(first.className);
  });

  it('lines가 있을 때 width는 각 줄에, 마지막 줄은 그 폭의 60%(calc)', () => {
    render(<Skeleton data-testid="s" lines={2} width={200} height={12} />);
    const bars = Array.from(screen.getByTestId('s').children) as HTMLElement[];
    const first = bars[0]!;
    const last = bars[1]!;
    expect(first.style.width).toBe('200px');
    expect(first.style.height).toBe('12px');
    expect(last.style.width).toBe('calc(200px * 0.6)');
    expect(last.style.height).toBe('12px');
  });

  it('여러 줄 모드에서 radius 클래스는 각 막대에 붙고 루트에는 안 붙는다', () => {
    const { rerender } = render(<Skeleton data-testid="s" lines={2} />);
    const root = screen.getByTestId('s');
    const smBar = root.children[0]!.className;
    rerender(<Skeleton data-testid="s" lines={2} radius="pill" />);
    const pillBar = root.children[0]!.className;
    expect(pillBar).not.toBe(smBar);
    expect(root.children[1]!.className).toContain(pillBar.split(' ')[1]!);
    expect(root.className).not.toContain(pillBar.split(' ')[1]!);
  });

  it('여러 줄 루트에는 width·height 인라인이 없다(각 줄에만)', () => {
    render(<Skeleton data-testid="s" lines={2} width={200} height={12} style={{ marginTop: 4 }} />);
    const root = screen.getByTestId('s');
    expect(root.style.width).toBe('');
    expect(root.style.height).toBe('');
    expect(root.style.marginTop).toBe('4px');
  });

  it('문자열 width + lines는 마지막 줄을 calc로 줄인다(%·var 모두)', () => {
    const { rerender } = render(<Skeleton data-testid="s" lines={2} width="60%" />);
    expect((screen.getByTestId('s').children[1] as HTMLElement).style.width).toBe(
      'calc(60% * 0.6)',
    );
    rerender(<Skeleton data-testid="s" lines={2} width="var(--ui-space-6)" />);
    expect((screen.getByTestId('s').children[1] as HTMLElement).style.width).toBe(
      'calc(var(--ui-space-6) * 0.6)',
    );
  });

  it('lines가 1 이하면 막대 하나다(lines 없음과 같음)', () => {
    const { rerender } = render(<Skeleton data-testid="s" lines={1} />);
    expect(screen.getByTestId('s').children).toHaveLength(0);
    rerender(<Skeleton data-testid="s" lines={0} />);
    expect(screen.getByTestId('s').children).toHaveLength(0);
  });

  it('소수 lines는 내림한다', () => {
    render(<Skeleton data-testid="s" lines={2.7} />);
    expect(screen.getByTestId('s').children).toHaveLength(2);
  });

  it('루트는 span이고 ref를 넘긴다(단일·여러 줄 모두) — 텍스트 안에 놓아도 유효한 중첩', () => {
    const ref = createRef<HTMLSpanElement>();
    const { rerender } = render(<Skeleton ref={ref} data-testid="s" />);
    expect(ref.current).toBe(screen.getByTestId('s'));
    expect(screen.getByTestId('s').tagName).toBe('SPAN');
    rerender(<Skeleton ref={ref} lines={2} data-testid="s" />);
    expect(screen.getByTestId('s').tagName).toBe('SPAN');
  });

  it('className을 병합하고 나머지 props를 루트에 넘긴다(단일·여러 줄 모두)', () => {
    const { rerender } = render(<Skeleton className="extra" id="one" data-testid="s" />);
    let el = screen.getByTestId('s');
    expect(el.className).toContain('extra');
    expect(el.className).not.toBe('extra');
    expect(el.id).toBe('one');

    rerender(<Skeleton className="extra" id="two" lines={2} data-testid="s" />);
    el = screen.getByTestId('s');
    expect(el.className).toContain('extra');
    expect(el.id).toBe('two');
  });
});
