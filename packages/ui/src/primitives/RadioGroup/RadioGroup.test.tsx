import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup } from './RadioGroup';
import type { RadioItem } from './RadioGroup';

const items: RadioItem[] = [
  { value: 'a', label: '첫째', description: '첫째 설명' },
  { value: 'b', label: '둘째' },
  { value: 'c', label: '셋째', disabled: true },
];

function setup(props: Partial<Parameters<typeof RadioGroup>[0]> = {}) {
  const onValueChange = vi.fn();
  const utils = render(
    <RadioGroup
      value="a"
      onValueChange={onValueChange}
      items={items}
      aria-label="예시 그룹"
      {...props}
    />,
  );
  return { onValueChange, ...utils };
}

describe('RadioGroup', () => {
  it('이름 있는 radiogroup 안에 항목 수만큼 radio를 그린다', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: '예시 그룹' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('value와 같은 항목만 checked', () => {
    setup({ value: 'b' });
    expect(screen.getByRole('radio', { name: '첫째' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: '둘째' }).getAttribute('aria-checked')).toBe('true');
  });

  it('value=null이면 아무것도 선택되지 않는다', () => {
    setup({ value: null });
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    }
  });

  it('이름은 라벨만, 보조 텍스트는 설명(aria-describedby)이 된다', () => {
    setup();
    const radio = screen.getByRole('radio', { name: '첫째' });
    const describedBy = radio.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe('첫째 설명');
    // 보조가 없는 항목에는 설명 연결이 없다.
    expect(screen.getByRole('radio', { name: '둘째' }).hasAttribute('aria-describedby')).toBe(
      false,
    );
  });

  it('원을 누르면 그 value로 onValueChange', () => {
    const { onValueChange } = setup();
    fireEvent.click(screen.getByRole('radio', { name: '둘째' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('라벨 글자를 눌러도 선택된다', () => {
    const { onValueChange } = setup();
    fireEvent.click(screen.getByText('둘째'));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('제어형 — 부모가 값을 안 바꾸면 눌러도 선택이 그대로다', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: '둘째' }));
    expect(screen.getByRole('radio', { name: '첫째' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '둘째' }).getAttribute('aria-checked')).toBe('false');
  });

  it('disabled 항목은 눌러도 바뀌지 않는다', () => {
    const { onValueChange } = setup();
    const radio = screen.getByRole('radio', { name: '셋째' });
    expect(radio.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(radio);
    fireEvent.click(screen.getByText('셋째'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('그룹 disabled면 모든 항목이 비활성이다', () => {
    const { onValueChange } = setup({ disabled: true });
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-disabled')).toBe('true');
    }
    fireEvent.click(screen.getByRole('radio', { name: '둘째' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('orientation을 aria-orientation과 클래스로 반영한다(기본 vertical)', () => {
    const { rerender } = render(
      <RadioGroup value="a" onValueChange={() => {}} items={items} aria-label="방향" />,
    );
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('aria-orientation')).toBe('vertical');
    const vertical = group.className;
    rerender(
      <RadioGroup
        value="a"
        onValueChange={() => {}}
        items={items}
        aria-label="방향"
        orientation="horizontal"
      />,
    );
    expect(screen.getByRole('radiogroup').getAttribute('aria-orientation')).toBe('horizontal');
    expect(screen.getByRole('radiogroup').className).not.toBe(vertical);
  });

  it('roving tabindex — 선택된 항목만 탭 순서에 든다', () => {
    setup({ value: 'b' });
    expect(screen.getByRole('radio', { name: '첫째' }).tabIndex).toBe(-1);
    expect(screen.getByRole('radio', { name: '둘째' }).tabIndex).toBe(0);
  });

  it('name을 주면 폼 제출값이 선택된 value다', () => {
    const { container } = render(
      <form>
        <RadioGroup
          value="b"
          onValueChange={() => {}}
          items={items}
          aria-label="폼"
          name="choice"
        />
      </form>,
    );
    const form = container.querySelector('form') as HTMLFormElement;
    expect(new FormData(form).getAll('choice')).toEqual(['b']);
  });

  it('className을 그룹 요소에 병합한다', () => {
    setup({ className: 'extra' });
    const group = screen.getByRole('radiogroup');
    expect(group.className).toContain('extra');
    expect(group.className).not.toBe('extra');
  });
});
