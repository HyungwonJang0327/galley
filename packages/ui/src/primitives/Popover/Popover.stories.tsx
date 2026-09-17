// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
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
export const Controlled = {
  args: { trigger, title: '제어형', open: true, onOpenChange: () => {}, children: '항상 열림' },
};
