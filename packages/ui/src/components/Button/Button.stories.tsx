// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
};
export default meta;

export const Primary = { args: { children: '저장', variant: 'primary' } };
export const Secondary = { args: { children: '취소', variant: 'secondary' } };
export const Ghost = { args: { children: '더보기', variant: 'ghost' } };
export const Danger = { args: { children: '삭제', variant: 'danger' } };
export const Small = { args: { children: '작게', size: 'sm' } };
export const Disabled = { args: { children: '비활성', disabled: true } };
