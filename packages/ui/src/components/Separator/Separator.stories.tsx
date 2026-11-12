// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
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
