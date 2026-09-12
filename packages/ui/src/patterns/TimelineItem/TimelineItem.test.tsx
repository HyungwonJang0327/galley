import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimelineItem } from './TimelineItem';
import { TimelineItems } from './TimelineItems';

describe('TimelineItem', () => {
  it('title·meta·trailing을 렌더한다', () => {
    render(
      <TimelineItems>
        <TimelineItem status="done" title="제목" meta="보조" trailing={<span>배지</span>} />
      </TimelineItems>,
    );
    expect(screen.getByText('제목')).toBeTruthy();
    expect(screen.getByText('보조')).toBeTruthy();
    expect(screen.getByText('배지')).toBeTruthy();
  });

  it('children이 없으면 토글 버튼을 만들지 않는다', () => {
    render(
      <TimelineItems>
        <TimelineItem status="pending" title="제목" />
      </TimelineItems>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('비제어: 클릭하면 펼쳐지고 다시 클릭하면 닫힌다', () => {
    render(
      <TimelineItems>
        <TimelineItem status="done" title="제목">
          <p>산출물</p>
        </TimelineItem>
      </TimelineItems>,
    );
    const toggle = screen.getByRole('button', { name: '제목' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('산출물').closest('[hidden]')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('산출물').closest('[hidden]')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('defaultOpen이면 처음부터 펼쳐져 있다', () => {
    render(
      <TimelineItems>
        <TimelineItem status="done" title="제목" defaultOpen>
          <p>산출물</p>
        </TimelineItem>
      </TimelineItems>,
    );
    expect(screen.getByRole('button', { name: '제목' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('제어 모드: open prop만 따르고 onOpenChange로 알린다', () => {
    const onOpenChange = vi.fn();
    render(
      <TimelineItems>
        <TimelineItem status="active" title="제목" open={false} onOpenChange={onOpenChange}>
          <p>산출물</p>
        </TimelineItem>
      </TimelineItems>,
    );
    const toggle = screen.getByRole('button', { name: '제목' });
    fireEvent.click(toggle);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // 앱이 open을 안 바꿨으므로 닫힌 채로 남는다.
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('토글 버튼이 펼침 영역을 aria-controls로 가리킨다', () => {
    render(
      <TimelineItems>
        <TimelineItem status="done" title="제목">
          <p>산출물</p>
        </TimelineItem>
      </TimelineItems>,
    );
    const toggle = screen.getByRole('button', { name: '제목' });
    fireEvent.click(toggle);
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(panel?.textContent).toBe('산출물');
  });

  it('statusLabel을 접근성 텍스트로 읽어준다', () => {
    render(
      <TimelineItems>
        <TimelineItem status="failed" statusLabel="실패" title="제목" />
      </TimelineItems>,
    );
    expect(screen.getByText('실패')).toBeTruthy();
  });

  it('status를 data 속성으로 노출한다', () => {
    render(
      <TimelineItems>
        <TimelineItem status="active" title="제목" />
      </TimelineItems>,
    );
    expect(screen.getByRole('listitem').getAttribute('data-status')).toBe('active');
  });
});

describe('TimelineItems', () => {
  it('<ol>로 자식을 감싸고 className을 병합한다', () => {
    render(
      <TimelineItems className="own" data-testid="items">
        <TimelineItem status="done" title="하나" />
        <TimelineItem status="pending" title="둘" />
      </TimelineItems>,
    );
    const el = screen.getByTestId('items');
    expect(el.tagName).toBe('OL');
    expect(el.className).toContain('own');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
