import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from './Switch';

describe('Switch', () => {
  it('라벨이 접근성 이름이 되고 checked 상태를 읽어준다', () => {
    render(
      <Switch checked onCheckedChange={() => {}}>
        알림 받기
      </Switch>,
    );
    const el = screen.getByRole('switch', { name: '알림 받기' });
    expect(el.getAttribute('aria-checked')).toBe('true');
    expect(el.hasAttribute('data-checked')).toBe(true);
  });

  it('꺼진 상태는 aria-checked=false', () => {
    render(
      <Switch checked={false} onCheckedChange={() => {}}>
        항목
      </Switch>,
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('트랙을 누르면 반대 값으로 onCheckedChange', () => {
    const onChange = vi.fn();
    render(
      <Switch checked={false} onCheckedChange={onChange}>
        항목
      </Switch>,
    );
    fireEvent.click(screen.getByRole('switch'));
    // 횟수는 단언하지 않는다 — happy-dom은 label 활성화를 버블 단계에서 처리해 React 루트의
    // preventDefault보다 먼저 돌고, 그래서 두 번 불린다(Checkbox도 같다). 실제 브라우저는 한 번.
    expect(onChange).toHaveBeenCalledWith(true);
    expect(onChange).not.toHaveBeenCalledWith(false);
  });

  it('라벨 텍스트를 눌러도 토글된다', () => {
    const onChange = vi.fn();
    render(
      <Switch checked onCheckedChange={onChange}>
        항목
      </Switch>,
    );
    fireEvent.click(screen.getByText('항목'));
    // 여기도 횟수는 보지 않는다(위 주석) — happy-dom의 호출 횟수는 브라우저와 다르다.
    expect(onChange).toHaveBeenCalledWith(false);
    expect(onChange).not.toHaveBeenCalledWith(true);
  });

  it('제어형 — 부모가 값을 안 바꾸면 눌러도 상태가 그대로다', () => {
    render(
      <Switch checked={false} onCheckedChange={() => {}}>
        항목
      </Switch>,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('disabled면 눌러도 바뀌지 않는다', () => {
    const onChange = vi.fn();
    render(
      <Switch checked={false} onCheckedChange={onChange} disabled>
        항목
      </Switch>,
    );
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('항목'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch').hasAttribute('data-disabled')).toBe(true);
  });

  it('라벨 없이 aria-label만으로도 이름이 잡힌다', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} aria-label="이름만" />);
    expect(screen.getByRole('switch', { name: '이름만' })).toBeTruthy();
  });

  it('name을 주면 폼 제출용 hidden input이 그 이름을 갖는다', () => {
    const { container } = render(
      <Switch checked onCheckedChange={() => {}} name="notify">
        항목
      </Switch>,
    );
    const input = container.querySelector('input[name="notify"]');
    expect(input).not.toBeNull();
    expect((input as HTMLInputElement).checked).toBe(true);
  });

  it('className을 라벨 요소에 병합한다', () => {
    const { container } = render(
      <Switch checked={false} onCheckedChange={() => {}} className="extra">
        항목
      </Switch>,
    );
    const label = container.querySelector('label');
    expect(label?.className).toContain('extra');
    expect(label?.className).not.toBe('extra');
  });
});
