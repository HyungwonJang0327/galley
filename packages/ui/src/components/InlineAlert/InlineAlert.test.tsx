import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineAlert } from './InlineAlert';

describe('InlineAlert', () => {
  it('본문을 렌더하고 기본 tone(info)은 role="status"다', () => {
    render(<InlineAlert>참고 문구</InlineAlert>);
    expect(screen.getByRole('status').textContent).toBe('참고 문구');
  });

  it.each([
    ['info', 'status'],
    ['success', 'status'],
    ['warning', 'alert'],
    ['danger', 'alert'],
  ] as const)('tone=%s → role=%s', (tone, role) => {
    render(<InlineAlert tone={tone}>문구</InlineAlert>);
    expect(screen.getByRole(role)).toBeTruthy();
  });

  it('tone마다 클래스가 다르다', () => {
    const classes = (['info', 'success', 'warning', 'danger'] as const).map((tone) => {
      const { container, unmount } = render(<InlineAlert tone={tone}>문구</InlineAlert>);
      const name = (container.firstElementChild as HTMLElement).className;
      unmount();
      return name;
    });
    expect(new Set(classes).size).toBe(4);
  });

  it('title이 있으면 본문 앞에 보이고, null·false·빈 문자열이면 그리지 않는다', () => {
    const { rerender } = render(
      <InlineAlert tone="danger" title="제목">
        본문
      </InlineAlert>,
    );
    expect(screen.getByRole('alert').textContent).toBe('제목본문');
    for (const empty of [null, false, ''] as const) {
      rerender(
        <InlineAlert tone="danger" title={empty}>
          본문
        </InlineAlert>,
      );
      expect(screen.getByRole('alert').textContent).toBe('본문');
    }
  });

  it('action은 live 영역 밖에 렌더한다 — 버튼 라벨이 알림 낭독에 섞이지 않게', () => {
    render(
      <InlineAlert tone="danger" title="제목" action={<button type="button">다시 시도</button>}>
        실패
      </InlineAlert>,
    );
    const button = screen.getByRole('button', { name: '다시 시도' });
    const live = screen.getByRole('alert');
    expect(live.contains(button)).toBe(false);
    expect(live.textContent).toBe('제목실패');
  });

  it('아이콘은 장식이다(aria-hidden)', () => {
    const { container } = render(<InlineAlert tone="warning">문구</InlineAlert>);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('className·나머지 props는 상자(루트)에 간다 — 루트에는 role이 없고, 넘어온 role도 지운다', () => {
    const smuggled = { role: 'button' } as object;
    const { container } = render(
      <InlineAlert tone="danger" className="extra" id="a1" {...smuggled}>
        문구
      </InlineAlert>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('extra');
    expect(root.className).not.toBe('extra');
    expect(root.id).toBe('a1');
    expect(root.hasAttribute('role')).toBe(false);
    expect(screen.queryByRole('button')).toBeNull();
    expect(root.contains(screen.getByRole('alert'))).toBe(true);
  });
});
