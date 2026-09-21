// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
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
