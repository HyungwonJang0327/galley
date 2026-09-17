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

  it('action 슬롯을 렌더한다', () => {
    render(
      <InlineAlert tone="danger" action={<button type="button">다시 시도</button>}>
        실패
      </InlineAlert>,
    );
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('아이콘은 장식이다(aria-hidden)', () => {
    const { container } = render(<InlineAlert tone="warning">문구</InlineAlert>);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('className을 병합하고 나머지 props를 넘기되, role은 tone이 정한다', () => {
    const smuggled = { role: 'button' } as object;
    render(
      <InlineAlert tone="danger" className="extra" id="a1" {...smuggled}>
        문구
      </InlineAlert>,
    );
    const el = screen.getByRole('alert');
    expect(el.className).toContain('extra');
    expect(el.className).not.toBe('extra');
    expect(el.id).toBe('a1');
  });
});
