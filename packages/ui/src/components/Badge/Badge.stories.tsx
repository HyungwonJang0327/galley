// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Badge } from './Badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
};
export default meta;

export const Neutral = { args: { children: 'Neutral', tone: 'neutral' } };
export const Info = { args: { children: 'Info', tone: 'info' } };
export const Running = { args: { children: 'Running', tone: 'info', pulse: true } };
export const Warning = { args: { children: 'Warning', tone: 'warning' } };
export const Success = { args: { children: 'Success', tone: 'success' } };
export const Danger = { args: { children: 'Danger', tone: 'danger' } };
