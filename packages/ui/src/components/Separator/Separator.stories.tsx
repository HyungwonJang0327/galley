// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Separator } from './Separator';
import type { SeparatorProps } from './Separator';

const meta = {
  title: 'Components/Separator',
  component: Separator,
};
export default meta;

export const Horizontal = { args: { orientation: 'horizontal' } };
export const Vertical = {
  args: { orientation: 'vertical' },
  render: (args: SeparatorProps) => (
    <div style={{ display: 'flex', height: 'var(--ui-space-5)' }}>
      <Separator {...args} />
    </div>
  ),
};
export const Decorative = { args: { decorative: true } };
