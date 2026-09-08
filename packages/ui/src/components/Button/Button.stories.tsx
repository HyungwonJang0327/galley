// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
};
export default meta;

export const Primary = { args: { children: '실행', variant: 'primary' } };
export const Secondary = { args: { children: '취소', variant: 'secondary' } };
export const Ghost = { args: { children: '더보기', variant: 'ghost' } };
export const Small = { args: { children: '작게', size: 'sm' } };
export const Disabled = { args: { children: '비활성', disabled: true } };
