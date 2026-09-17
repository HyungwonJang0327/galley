import { describe, it, expect } from 'vitest';
import { Form as BaseForm } from '@base-ui/react/form';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('error가 생겼다 사라지면 invalid와 오류 문구도 따라 사라진다', () => {
    const field = (error?: string) => (
      <FormField label="이름" error={error}>
        <Input />
      </FormField>
    );
    const { rerender } = render(field());
    rerender(field('이름을 입력하세요'));
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
    expect(descriptionsOf(screen.getByRole('textbox'))).toEqual(['이름을 입력하세요']);
    rerender(field());
    expect(screen.getByRole('textbox').hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByText('이름을 입력하세요')).toBeNull();
    expect(descriptionsOf(screen.getByRole('textbox'))).toEqual([]);
  });

  // 클릭 → 포커스 자체는 브라우저 동작이라 verify:layout이 본다. 여기선 for 연결만 고정한다.
  it('라벨이 컨트롤을 for로 가리킨다(라벨 클릭 포커스의 전제)', () => {
    const { container } = render(
      <FormField label="이름">
        <Input />
      </FormField>,
    );
    const label = container.querySelector('label') as HTMLLabelElement;
    const input = screen.getByRole('textbox');
    expect(label.getAttribute('for')).toBe(input.id);
    expect(label.control).toBe(input);
  });

  it('오류 문구는 처음부터 마운트된 polite live 영역 안에 나타난다', () => {
    const field = (error?: string) => (
      <FormField label="이름" error={error}>
        <Input />
      </FormField>
    );
    const { container, rerender } = render(field());
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe('');
    rerender(field('이름을 입력하세요'));
    // 같은 요소가 유지돼야 스크린리더가 변화를 알린다.
    expect(container.querySelector('[aria-live="polite"]')).toBe(region);
    expect(region?.textContent).toBe('이름을 입력하세요');
  });

  it('빈 문자열 error는 오류가 아니다', () => {
    const { container } = render(
      <FormField label="이름" error="">
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

  it('Textarea에 준 id·aria-describedby가 필드 연결을 끊지 않는다(Input과 같게)', () => {
    const { container } = render(
      <FormField label="메모" description="필드 설명" error="필드 오류">
        <Textarea id="mine" aria-describedby="hint" />
      </FormField>,
    );
    const el = screen.getByRole('textbox', { name: '메모' });
    expect(el.id).toBe('mine');
    // 라벨의 for가 소비자 id를 가리켜야 라벨 클릭이 포커스를 옮긴다.
    expect(container.querySelector('label')?.getAttribute('for')).toBe('mine');
    const ids = (el.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain('hint');
    expect(descriptionsOf(el).filter(Boolean)).toEqual(['필드 설명', '필드 오류']);
    expect(el.getAttribute('aria-invalid')).toBe('true');
  });

  it('required면 *는 장식(aria-hidden)이고 컨트롤이 native required를 물려받는다', () => {
    render(
      <FormField label="이름" required>
        <Input />
      </FormField>,
    );
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
    const input = screen.getByRole('textbox', { name: '이름' }) as HTMLInputElement;
    expect(input.required).toBe(true);
  });

  it('required가 없으면 컨트롤도 required가 아니다', () => {
    render(
      <FormField label="이름">
        <Input />
      </FormField>,
    );
    expect((screen.getByRole('textbox') as HTMLInputElement).required).toBe(false);
  });

  it('컨트롤에 직접 준 required가 필드 값보다 우선한다', () => {
    render(
      <FormField label="이름" required>
        <Input required={false} />
      </FormField>,
    );
    expect((screen.getByRole('textbox') as HTMLInputElement).required).toBe(false);
  });

  it('Base UI Form 아래에서는 error가 없어도 네이티브 검증 문구가 오류 자리에 뜬다', async () => {
    const { container } = render(
      <BaseForm onSubmit={(event) => event.preventDefault()}>
        <FormField label="이름" required>
          <Input name="name" />
        </FormField>
      </BaseForm>,
    );
    const region = container.querySelector('[aria-live="polite"]');
    expect(region?.textContent).toBe('');
    await act(async () => {
      fireEvent.submit(container.querySelector('form') as HTMLFormElement);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // 문구 자체는 브라우저(여기선 happy-dom) 것이라 내용은 단언하지 않는다.
    expect(region?.textContent).not.toBe('');
    expect(descriptionsOf(input)).toEqual([region?.textContent]);
  });

  it('앱이 넘긴 error가 네이티브 문구보다 우선한다', async () => {
    const { container } = render(
      <BaseForm onSubmit={(event) => event.preventDefault()}>
        <FormField label="이름" required error="이름을 입력하세요">
          <Input name="name" />
        </FormField>
      </BaseForm>,
    );
    await act(async () => {
      fireEvent.submit(container.querySelector('form') as HTMLFormElement);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('이름을 입력하세요');
  });

  describe('required 전달 — 컨트롤 종류별로 폼 검증에 참여한다', () => {
    const controls = [
      ['Input', <Input key="c" name="f" />],
      ['Textarea', <Textarea key="c" name="f" />],
      [
        'Select',
        <Select
          key="c"
          name="f"
          value={null}
          onValueChange={() => {}}
          items={[{ value: 'a', label: '가' }]}
        />,
      ],
      ['Switch', <Switch key="c" name="f" checked={false} onCheckedChange={() => {}} />],
      ['Checkbox', <Checkbox key="c" name="f" checked={false} onCheckedChange={() => {}} />],
      [
        'RadioGroup',
        <RadioGroup
          key="c"
          name="f"
          value={null}
          onValueChange={() => {}}
          items={[{ value: 'a', label: '가' }]}
          aria-label="필드 라벨"
        />,
      ],
    ] as const;

    it.each(controls)('%s', (_name, control) => {
      const { container, rerender } = render(
        <form>
          <FormField label="필드 라벨" required>
            {control}
          </FormField>
        </form>,
      );
      // 값이 비어 있으니 required인 폼 컨트롤(native 또는 Base UI hidden input)이 폼을 무효로 만든다.
      const form = container.querySelector('form') as HTMLFormElement;
      expect(container.querySelector('[required]')).not.toBeNull();
      expect(form.checkValidity()).toBe(false);

      rerender(
        <form>
          <FormField label="필드 라벨">{control}</FormField>
        </form>,
      );
      expect(container.querySelector('[required]')).toBeNull();
      expect(form.checkValidity()).toBe(true);
    });
  });

  it('Switch의 안쪽 라벨은 이름에서 빠진다 — 필드 라벨이 이름이다(children 없이 쓰라는 이유)', () => {
    render(
      <FormField label="알림">
        <Switch checked={false} onCheckedChange={() => {}}>
          안쪽 글자
        </Switch>
      </FormField>,
    );
    expect(screen.getByRole('switch', { name: '알림' })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: /안쪽 글자/ })).toBeNull();
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
