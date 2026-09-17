// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Popover } from './Popover';

const meta = {
  title: 'Primitives/Popover',
  component: Popover,
};
export default meta;

const trigger = <Button variant="secondary">자세히</Button>;

export const Basic = {
  args: { trigger, title: '제목', children: '트리거를 누르면 열리고 Esc·바깥 클릭으로 닫힌다.' },
};
export const WithoutTitle = {
  args: { trigger, 'aria-label': '도움말', children: '제목 없이 본문만 있는 팝오버.' },
};
export const SideAndAlign = {
  args: { trigger, title: '오른쪽 · 위 맞춤', side: 'right', align: 'start', children: '본문' },
};
// open을 고정하고 onOpenChange를 no-op으로 두면 영영 안 닫힌다 — 상태를 들고 실제로 닫는다.
function ControlledExample() {
  const [open, setOpen] = useState(true);
  return (
    <Popover trigger={trigger} title="제어형" open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(false)}>
        닫기
      </Button>
    </Popover>
  );
}
export const Controlled = { render: () => <ControlledExample /> };
