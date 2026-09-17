import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Form } from './Form';
import type { FormErrors } from './Form';
import { FormField } from '../FormField';
import { Input } from '../Input';
import { Select } from '../Select';
import { Switch } from '../Switch';

/** Base UI는 제출 검증·포커스 이동을 비동기로 한다 — 제출하고 한 박자 기다린다. */
async function submit(form: HTMLFormElement) {
  await act(async () => {
    fireEvent.submit(form);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function type(el: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(el, { target: { value } });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const errorOf = (el: HTMLElement) =>
  el.closest('[class*="field"]')?.querySelector('[aria-live]')?.textContent ?? null;

describe('Form', () => {
  it('이름 있는 form으로 렌더되고 브라우저 말풍선을 끈다(noValidate)', () => {
    render(<Form aria-label="예시 폼" />);
    const form = screen.getByRole('form', { name: '예시 폼' }) as HTMLFormElement;
    expect(form.noValidate).toBe(true);
  });

  it('필수 칸을 비운 채 제출하면 핸들러를 부르지 않고, 오류를 필드 아래에 띄우고, 그 칸으로 포커스를 옮긴다', async () => {
    const onFormSubmit = vi.fn();
    const onSubmit = vi.fn();
    render(
      <Form aria-label="폼" onFormSubmit={onFormSubmit} onSubmit={onSubmit}>
        <FormField label="메모">
          <Input name="memo" />
        </FormField>
        <FormField label="이름" required>
          <Input name="name" />
        </FormField>
      </Form>,
    );
    await submit(screen.getByRole('form') as HTMLFormElement);
    const name = screen.getByRole('textbox', { name: '이름' });
    expect(onFormSubmit).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    // 문구는 브라우저 것이라 내용은 단언하지 않는다.
    expect(errorOf(name)).not.toBe('');
    expect(document.activeElement).toBe(name);
    // 멀쩡한 필드는 그대로.
    expect(screen.getByRole('textbox', { name: '메모' }).hasAttribute('aria-invalid')).toBe(false);
  });

  it('값을 채우면 오류가 지워지고, 제출하면 name으로 모은 값을 받는다', async () => {
    const onFormSubmit = vi.fn();
    function Host() {
      const [on, setOn] = useState(true);
      const [choice, setChoice] = useState<string | null>('b');
      return (
        <Form aria-label="폼" onFormSubmit={onFormSubmit}>
          <FormField label="이름" required>
            <Input name="name" />
          </FormField>
          <FormField label="켜기">
            <Switch name="on" checked={on} onCheckedChange={setOn} />
          </FormField>
          <FormField label="선택">
            <Select
              name="choice"
              value={choice}
              onValueChange={setChoice}
              items={[
                { value: 'a', label: '가' },
                { value: 'b', label: '나' },
              ]}
            />
          </FormField>
        </Form>
      );
    }
    render(<Host />);
    const form = screen.getByRole('form') as HTMLFormElement;
    await submit(form);
    const name = screen.getByRole('textbox', { name: '이름' });
    expect(errorOf(name)).not.toBe('');

    await type(name, '홍길동');
    expect(errorOf(name)).toBe('');
    expect(name.hasAttribute('aria-invalid')).toBe(false);

    await submit(form);
    expect(onFormSubmit).toHaveBeenCalledTimes(1);
    expect(onFormSubmit).toHaveBeenCalledWith({ name: '홍길동', on: true, choice: 'b' });
  });

  it('errors를 컨트롤 name으로 필드에 꽂고, 그 필드 값을 바꾸면 지운다', async () => {
    const errors: FormErrors = { email: '이미 쓰고 있는 주소' };
    render(
      <Form aria-label="폼" errors={errors}>
        <FormField label="이메일">
          <Input name="email" defaultValue="a@b.c" />
        </FormField>
        <FormField label="이름">
          <Input name="name" />
        </FormField>
      </Form>,
    );
    const email = screen.getByRole('textbox', { name: '이메일' });
    expect(errorOf(email)).toBe('이미 쓰고 있는 주소');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(errorOf(screen.getByRole('textbox', { name: '이름' }))).toBe('');

    await type(email, 'x@y.z');
    expect(errorOf(email)).toBe('');
    expect(email.hasAttribute('aria-invalid')).toBe(false);
  });

  it('FormField에 직접 준 error가 errors보다 우선한다', () => {
    render(
      <Form aria-label="폼" errors={{ email: '서버 오류' }}>
        <FormField label="이메일" error="앱 오류">
          <Input name="email" />
        </FormField>
      </Form>,
    );
    expect(errorOf(screen.getByRole('textbox'))).toBe('앱 오류');
  });

  it('오류가 남은 필드는 제출을 막는다 — 앱 error는 앱이 지워야, errors는 값을 바꾸면 풀린다', async () => {
    const onFormSubmit = vi.fn();
    const fields = (memoError?: string) => (
      <Form aria-label="폼" errors={{ email: '서버 오류' }} onFormSubmit={onFormSubmit}>
        <FormField label="메모" error={memoError}>
          <Input name="memo" defaultValue="값" />
        </FormField>
        <FormField label="이메일">
          <Input name="email" defaultValue="a@b.c" />
        </FormField>
      </Form>
    );
    const { rerender } = render(fields('앱 오류'));
    const form = screen.getByRole('form') as HTMLFormElement;
    await submit(form);
    expect(onFormSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '메모' }));

    // 앱이 error를 지워도 아직 서버 오류가 남았다.
    rerender(fields());
    await submit(form);
    expect(onFormSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '이메일' }));

    await type(screen.getByRole('textbox', { name: '이메일' }), 'x@y.z');
    await submit(form);
    expect(onFormSubmit).toHaveBeenCalledWith({ memo: '값', email: 'x@y.z' });
  });

  it('className을 병합하고 나머지 props를 form에 넘긴다', () => {
    render(<Form aria-label="폼" className="extra" id="f" />);
    const form = screen.getByRole('form');
    expect(form.className).toContain('extra');
    expect(form.className).not.toBe('extra');
    expect(form.id).toBe('f');
  });
});
