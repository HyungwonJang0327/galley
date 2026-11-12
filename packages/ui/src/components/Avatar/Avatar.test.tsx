import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Avatar, initialsOf } from './Avatar';

describe('initialsOf', () => {
  it('한글·한 단어는 첫 글자, 라틴 두 단어는 앞 두 단어의 첫 글자(대문자)', () => {
    expect(initialsOf('홍길동')).toBe('홍');
    expect(initialsOf('  장형원 ')).toBe('장');
    expect(initialsOf('ada lovelace')).toBe('AL');
    expect(initialsOf('Ada Byron Lovelace')).toBe('AB');
    expect(initialsOf('galley')).toBe('G');
    // 한글 이름 뒤 라틴 별칭은 첫 단어만
    expect(initialsOf('홍길동 hong')).toBe('홍');
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });

  it('결합 문자·서로게이트는 grapheme 하나로', () => {
    expect(initialsOf('👩‍💻 dev')).toBe('👩‍💻');
  });
});

/**
 * happy-dom은 이미지를 로드하지 않아 `complete`·`naturalWidth`가 브라우저와 다르다. 마운트 검사(이미 실패한 이미지 감지)가
 * 테스트마다 다르게 보이도록 둘을 흉내 낸다 — 기본은 "아직 로딩 중"(complete=false).
 */
function stubImage(state: { complete: boolean; naturalWidth: number }) {
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => state.complete,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => state.naturalWidth,
  });
}
const originalComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
const originalNatural = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth');
const restore = (name: 'complete' | 'naturalWidth', original: PropertyDescriptor | undefined) => {
  if (original) Object.defineProperty(HTMLImageElement.prototype, name, original);
  else delete (HTMLImageElement.prototype as unknown as Record<string, unknown>)[name];
};

describe('Avatar', () => {
  beforeEach(() => stubImage({ complete: false, naturalWidth: 0 }));
  afterEach(() => {
    restore('complete', originalComplete);
    restore('naturalWidth', originalNatural);
  });

  it('루트는 role=img + aria-label=name, 머리글자는 장식(aria-hidden)', () => {
    render(<Avatar name="홍길동" />);
    const root = screen.getByRole('img', { name: '홍길동' });
    expect(root.textContent).toBe('홍');
    expect(root.querySelector('[aria-hidden="true"]')?.textContent).toBe('홍');
  });

  it('src가 있으면 alt 없는 이미지(장식), 이름은 루트가 든다', () => {
    render(<Avatar name="Ada Lovelace" src="/a.png" />);
    const root = screen.getByRole('img', { name: 'Ada Lovelace' });
    const img = root.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/a.png');
    expect(img?.getAttribute('alt')).toBe('');
    expect(root.textContent).toBe('');
  });

  it('이미지 로드에 실패하면 머리글자로 바뀌고, src가 바뀌면 다시 시도한다', () => {
    const { rerender } = render(<Avatar name="Ada Lovelace" src="/broken.png" />);
    const root = screen.getByRole('img', { name: 'Ada Lovelace' });
    fireEvent.error(root.querySelector('img')!);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toBe('AL');

    rerender(<Avatar name="Ada Lovelace" src="/other.png" />);
    expect(root.querySelector('img')?.getAttribute('src')).toBe('/other.png');
  });

  it('마운트 시점에 이미 실패한 이미지(complete·naturalWidth 0)도 머리글자로 — 하이드레이션 전 오류 유실 대비', () => {
    stubImage({ complete: true, naturalWidth: 0 });
    render(<Avatar name="Ada Lovelace" src="/already-broken.png" />);
    const root = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toBe('AL');
  });

  it('마운트 시점에 이미 로드된 이미지(complete·naturalWidth > 0)는 그대로 둔다', () => {
    stubImage({ complete: true, naturalWidth: 40 });
    render(<Avatar name="Ada Lovelace" src="/ok.png" />);
    expect(screen.getByRole('img', { name: 'Ada Lovelace' }).querySelector('img')).not.toBeNull();
  });

  it('size마다 클래스가 다르고 className을 병합한다', () => {
    const { rerender } = render(<Avatar name="x" className="own" />);
    const root = screen.getByRole('img', { name: 'x' });
    expect(root.className).toContain('own');
    const md = root.className;
    rerender(<Avatar name="x" className="own" size="sm" />);
    expect(root.className).not.toBe(md);
    rerender(<Avatar name="x" className="own" size="lg" />);
    expect(root.className).not.toBe(md);
  });

  it('빈 이름은 빈 원(머리글자 없음)', () => {
    render(<Avatar name="" data-testid="empty" />);
    expect(screen.getByTestId('empty').textContent).toBe('');
  });
});
