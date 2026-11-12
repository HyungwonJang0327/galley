// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { TopBarChip } from './TopBarChip';

const meta = {
  title: 'Patterns/TopBarChip',
  component: TopBarChip,
};
export default meta;

export const Default = { args: { children: '글' } };
export const Active = { args: { children: '글', isActive: true } };
export const WithTrailing = { args: { children: 'Opus', trailing: '▾' } };
