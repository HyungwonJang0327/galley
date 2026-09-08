// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { TopBarChip } from './TopBarChip';

const meta = {
  title: 'Patterns/TopBarChip',
  component: TopBarChip,
};
export default meta;

export const Default = { args: { children: '글' } };
export const Active = { args: { children: '글', isActive: true } };
export const WithTrailing = { args: { children: 'Opus', trailing: '▾' } };
