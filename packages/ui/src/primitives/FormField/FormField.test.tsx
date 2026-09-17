import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from './FormField';
import { Checkbox } from '../Checkbox';
import { Input } from '../Input';
import { RadioGroup } from '../RadioGroup';
import { Select } from '../Select';
import { Switch } from '../Switch';
import { Textarea } from '../Textarea';

/** aria-describedby가 가리키는 요소들의 글자. */
function descriptionsOf(el: HTMLElement): string[] {
  return (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '');
}

describe('FormField', () => {
  it('라벨이 컨트롤의 접근성 이름이 된다', () => {
    render(
      <FormField label="이름">
        <Input />
      </FormField>,
    );
    expect(screen.getByRole('textbox', { name: '이름' })).toBeTruthy();
  });

  it('description이 컨트롤의 설명으로 연결된다', () => {
    render(
      <FormField label="이름" description="보이는 이름">
        <Input />
      </FormField>,
    );
    expect(descriptionsOf(screen.getByRole('textbox'))).toEqual(['보이는 이름']);
  });

  it('error가 있으면 컨트롤이 invalid가 되고 오류 문구가 설명에 더해진다', () => {
    render(
      <FormField label="이름" description="보이는 이름" error="이름을 입력하세요">
        <Input />
      </FormField>,
    );
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(descriptionsOf(input)).toEqual(['보이는 이름', '이름을 입력하세요']);
    expect(screen.getByText('이름을 입력하세요')).toBeTruthy();
  });

  it('error가 없으면 invalid가 아니고 오류 요소도 없다', () => {
    const { container } = render(
      <FormField label="이름">
        <Input />
      </FormField>,
    );
    expect(screen.getByRole('textbox').hasAttribute('aria-invalid')).toBe(false);
    expect(container.querySelector('[data-invalid]')).toBeNull();
  });

  it('error가 없어도 컨트롤에 직접 준 invalid는 살아 있다', () => {
    render(
      <FormField label="이름">
        <Input invalid />
      </FormField>,
    );
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  });

  it('required는 장식용 * 만 그린다 — 이름에 섞이지 않고 컨트롤 required는 건드리지 않는다', () => {
    render(
      <FormField label="이름" required>
        <Input />
      </FormField>,
    );
    const star = screen.getByText('*');
    expect(star.getAttribute('aria-hidden')).toBe('true');
    const input = screen.getByRole('textbox', { name: '이름' });
    expect((input as HTMLInputElement).required).toBe(false);
  });

  it('className을 필드 루트에 병합한다', () => {
    const { container } = render(
      <FormField label="이름" className="extra">
        <Input />
      </FormField>,
    );
    const root = container.firstElementChild;
    expect(root?.className).toContain('extra');
    expect(root?.className).not.toBe('extra');
  });

  describe('컨트롤 종류별 연결(이름 · 설명 · invalid)', () => {
    const cases = [
      ['Input', <Input key="c" />, 'textbox'],
      ['Textarea', <Textarea key="c" />, 'textbox'],
      [
        'Select',
        <Select
          key="c"
          value={null}
          onValueChange={() => {}}
          items={[{ value: 'a', label: '가' }]}
        />,
        'combobox',
      ],
      ['Switch', <Switch key="c" checked={false} onCheckedChange={() => {}} />, 'switch'],
      ['Checkbox', <Checkbox key="c" checked={false} onCheckedChange={() => {}} />, 'checkbox'],
      [
        'RadioGroup',
        <RadioGroup
          key="c"
          value={null}
          onValueChange={() => {}}
          items={[{ value: 'a', label: '가' }]}
          aria-label="필드 라벨"
        />,
        'radiogroup',
      ],
    ] as const;

    it.each(cases)('%s', (_name, control, role) => {
      render(
        <FormField label="필드 라벨" description="필드 설명" error="필드 오류">
          {control}
        </FormField>,
      );
      const el = screen.getByRole(role, { name: '필드 라벨' });
      expect(el.getAttribute('aria-invalid')).toBe('true');
      expect(descriptionsOf(el)).toEqual(['필드 설명', '필드 오류']);
    });
  });
});
