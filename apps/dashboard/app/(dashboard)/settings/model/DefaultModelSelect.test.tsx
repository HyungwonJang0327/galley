import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DefaultModelSelect } from './DefaultModelSelect';

const option = (value: string, disabled = false) => ({
  value,
  label: `${value} 이름`,
  description: 'Anthropic',
  meta: '$5 / $25',
  disabled,
  disabledReason: disabled ? 'API 키 없음 (.env ANTHROPIC_API_KEY)' : undefined,
});

const options = [option('anthropic:a'), option('anthropic:b'), option('openai:c', true)];

function press(element: HTMLElement) {
  fireEvent.pointerDown(element, { pointerType: 'mouse', button: 0 });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.click(element);
}

async function choose(name: RegExp) {
  press(screen.getByRole('combobox', { name: '기본 모델' }));
  press(await waitFor(() => screen.getByRole('option', { name })));
}

describe('DefaultModelSelect', () => {
  it('지금의 기본 모델을 보여 준다', () => {
    render(<DefaultModelSelect options={options} currentId="anthropic:b" change={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: '기본 모델' }).textContent).toContain(
      'anthropic:b 이름',
    );
  });

  it('고르자마자 저장하고 결과를 알린다', async () => {
    const change = vi.fn().mockResolvedValue({ ok: true });
    render(<DefaultModelSelect options={options} currentId="anthropic:a" change={change} />);

    await choose(/anthropic:b 이름/);

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('저장했습니다.'));
    expect(change).toHaveBeenCalledWith('anthropic:b');
    expect(screen.getByRole('combobox', { name: '기본 모델' }).textContent).toContain(
      'anthropic:b 이름',
    );
  });

  it('저장이 실패하면 사유를 알리고 이전 값으로 되돌린다', async () => {
    const change = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'SETTING_SAVE_FAILED', message: '기본 모델을 저장하지 못했습니다.' },
    });
    render(<DefaultModelSelect options={options} currentId="anthropic:a" change={change} />);

    await choose(/anthropic:b 이름/);

    expect((await screen.findByRole('alert')).textContent).toBe('기본 모델을 저장하지 못했습니다.');
    expect(screen.getByRole('combobox', { name: '기본 모델' }).textContent).toContain(
      'anthropic:a 이름',
    );
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('요청 자체가 실패해도(던짐) 사유를 알리고 되돌린다', async () => {
    const change = vi.fn().mockRejectedValue(new Error('network'));
    render(<DefaultModelSelect options={options} currentId="anthropic:a" change={change} />);

    await choose(/anthropic:b 이름/);

    expect((await screen.findByRole('alert')).textContent).toContain('저장 요청이 실패했습니다');
    expect(screen.getByRole('combobox', { name: '기본 모델' }).textContent).toContain(
      'anthropic:a 이름',
    );
  });

  it('키 없는 모델은 비활성 + 사유(title)', async () => {
    render(<DefaultModelSelect options={options} currentId="anthropic:a" change={vi.fn()} />);

    press(screen.getByRole('combobox', { name: '기본 모델' }));
    const noKey = await waitFor(() => screen.getByRole('option', { name: /openai:c 이름/ }));

    expect(noKey.getAttribute('aria-disabled')).toBe('true');
    expect(noKey.getAttribute('title')).toBe('API 키 없음 (.env ANTHROPIC_API_KEY)');
  });
});
