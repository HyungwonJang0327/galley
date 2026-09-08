// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Badge } from './Badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
};
export default meta;

export const Neutral = { args: { children: 'Neutral', variant: 'neutral' } };
export const Info = { args: { children: 'Info', variant: 'info' } };
export const Running = { args: { children: 'Running', variant: 'info', pulse: true } };
export const Warning = { args: { children: 'Warning', variant: 'warning' } };
export const Success = { args: { children: 'Success', variant: 'success' } };
export const Danger = { args: { children: 'Danger', variant: 'danger' } };
