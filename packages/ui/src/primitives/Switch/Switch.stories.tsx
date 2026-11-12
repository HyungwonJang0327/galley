// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Switch } from './Switch';

const meta = {
  title: 'Primitives/Switch',
  component: Switch,
};
export default meta;

const base = { onCheckedChange: () => {}, children: '라벨' };

export const Off = { args: { ...base, checked: false } };
export const On = { args: { ...base, checked: true } };
export const Disabled = { args: { ...base, checked: true, disabled: true } };
export const Unlabeled = {
  args: { onCheckedChange: () => {}, checked: false, 'aria-label': '라벨 없는 스위치' },
};
