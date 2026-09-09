import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('open=false면 dialog를 렌더하지 않는다', () => {
    render(
      <Dialog open={false} onOpenChange={() => {}} title="제목">
        본문
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open=true면 title을 접근성 이름으로 하는 dialog와 description·본문·footer를 렌더한다', () => {
    render(
      <Dialog
        open
        onOpenChange={() => {}}
        title="제목"
        description="설명"
        footer={<button type="button">확인</button>}
      >
        본문
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: '제목' })).toBeTruthy();
    expect(screen.getByText('설명')).toBeTruthy();
    expect(screen.getByText('본문')).toBeTruthy();
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy();
  });

  it('닫기 버튼을 누르면 onOpenChange(false)를 부른다', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="제목">
        본문
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closeLabel로 닫기 버튼 이름을 바꿀 수 있다', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="제목" closeLabel="Close">
        본문
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('trigger 요소를 렌더하고 누르면 onOpenChange(true)를 부른다', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog
        open={false}
        onOpenChange={onOpenChange}
        title="제목"
        trigger={<button type="button">열기</button>}
      >
        본문
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: '열기' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('className을 popup에 병합한다', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="제목" className="own">
        본문
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('own');
  });
});
