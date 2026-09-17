import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
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

  it('보조가 없는 항목의 라벨에만 굵기 클래스가 붙는다', () => {
    setup();
    // 보조가 있으면 ItemContent 기본 굵기, 없으면 Checkbox·Switch 라벨과 같은 regular.
    expect(screen.getByText('첫째').className).toBe('');
    expect(screen.getByText('둘째').className).not.toBe('');
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

  it('방향키는 이동하면서 선택한다 — disabled 항목은 건너뛰고 끝에서 처음으로 돈다', async () => {
    const four: RadioItem[] = [
      { value: 'a', label: '가' },
      { value: 'b', label: '나' },
      { value: 'c', label: '다', disabled: true },
      { value: 'd', label: '라' },
    ];
    const seen: string[] = [];
    function Host() {
      const [value, setValue] = useState<string | null>('a');
      return (
        <RadioGroup
          value={value}
          onValueChange={(next) => {
            seen.push(next);
            setValue(next);
          }}
          items={four}
          aria-label="방향키"
        />
      );
    }
    render(<Host />);
    act(() => screen.getByRole('radio', { name: '가' }).focus());
    // Base UI는 포커스를 옮긴 뒤 비동기로 선택한다 — 동기 fireEvent만으로는 콜백이 아직 안 불린다.
    const arrowDown = () =>
      act(async () => {
        fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    await arrowDown();
    await arrowDown();
    await arrowDown();
    expect(seen).toEqual(['b', 'd', 'a']);
    expect(screen.getByRole('radio', { name: '가' }).getAttribute('aria-checked')).toBe('true');
  });

  it('roving tabindex — 선택된 항목만 탭 순서에 든다', () => {
    setup({ value: 'b' });
    expect(screen.getByRole('radio', { name: '첫째' }).tabIndex).toBe(-1);
    expect(screen.getByRole('radio', { name: '둘째' }).tabIndex).toBe(0);
  });

  it('roving tabindex — 미선택(value=null)이면 첫 항목이 탭 정지점이다', () => {
    setup({ value: null });
    expect(screen.getAllByRole('radio').map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
  });

  it('roving tabindex — 선택값이 disabled 항목이면 그 항목이 탭 정지점으로 남는다', () => {
    // 의도된 동작(Base UI): 비활성이어도 선택된 항목이 그룹의 유일한 탭 정지점이다. 실제 Chrome에서
    // Tab으로 들어온 뒤 방향키로 활성 항목에 나갈 수 있음을 확인했다(갇히지 않는다). 단, 맨 끝의
    // disabled 항목에서 ArrowDown은 순환하지 않고 제자리 — ArrowUp으로 나간다.
    setup({ value: 'c' });
    expect(screen.getAllByRole('radio').map((radio) => radio.tabIndex)).toEqual([-1, -1, 0]);
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
