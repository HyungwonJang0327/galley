import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Popover } from './Popover';

const TRIGGER = <button type="button">자세히</button>;

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

describe('Popover', () => {
  it('닫힌 상태에서는 트리거만 있고 팝업은 없다', () => {
    render(
      <Popover trigger={TRIGGER} title="제목">
        본문
      </Popover>,
    );
    const trigger = screen.getByRole('button', { name: '자세히' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('비제어 — open을 주지 않아도 트리거를 누르면 열리고 다시 누르면 닫힌다', async () => {
    render(
      <Popover trigger={TRIGGER} title="제목">
        본문
      </Popover>,
    );
    const trigger = screen.getByRole('button', { name: '자세히' });
    await click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '제목' });
    expect(dialog.textContent).toContain('본문');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await click(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Esc로 닫힌다', async () => {
    render(
      <Popover trigger={TRIGGER} title="제목">
        본문
      </Popover>,
    );
    await click(screen.getByRole('button', { name: '자세히' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('title이 없으면 aria-label이 팝업 이름이 된다', async () => {
    render(
      <Popover trigger={TRIGGER} aria-label="도움말">
        본문
      </Popover>,
    );
    await click(screen.getByRole('button', { name: '자세히' }));
    expect(await screen.findByRole('dialog', { name: '도움말' })).toBeTruthy();
  });

  it('제어형 — open을 따르고, 누르면 onOpenChange만 부른다(부모가 안 바꾸면 그대로)', async () => {
    const onOpenChange = vi.fn();
    render(
      <Popover trigger={TRIGGER} title="제목" open={false} onOpenChange={onOpenChange}>
        본문
      </Popover>,
    );
    await click(screen.getByRole('button', { name: '자세히' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('제어형 — 부모가 밖에서 닫을 수 있다', async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Popover trigger={TRIGGER} title="제목" open={open} onOpenChange={setOpen}>
          <button type="button" onClick={() => setOpen(false)}>
            닫기
          </button>
        </Popover>
      );
    }
    render(<Host />);
    await click(await screen.findByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('본문에 상호작용 요소를 넣을 수 있다', async () => {
    const onAction = vi.fn();
    render(
      <Popover trigger={TRIGGER} title="제목">
        <button type="button" onClick={onAction}>
          실행
        </button>
      </Popover>,
    );
    await click(screen.getByRole('button', { name: '자세히' }));
    await click(await screen.findByRole('button', { name: '실행' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('side·align을 positioner에 반영한다(기본 bottom·center)', async () => {
    const { rerender } = render(
      <Popover trigger={TRIGGER} title="제목" open onOpenChange={() => {}}>
        본문
      </Popover>,
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('data-side')).toBe('bottom');
    expect(dialog.getAttribute('data-align')).toBe('center');
    rerender(
      <Popover
        trigger={TRIGGER}
        title="제목"
        open
        onOpenChange={() => {}}
        side="right"
        align="start"
      >
        본문
      </Popover>,
    );
    await waitFor(() => expect(screen.getByRole('dialog').getAttribute('data-side')).toBe('right'));
    expect(screen.getByRole('dialog').getAttribute('data-align')).toBe('start');
  });

  it('className을 popup에 병합한다', async () => {
    render(
      <Popover trigger={TRIGGER} title="제목" open onOpenChange={() => {}} className="extra">
        본문
      </Popover>,
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('extra');
    expect(dialog.className).not.toBe('extra');
  });
});
