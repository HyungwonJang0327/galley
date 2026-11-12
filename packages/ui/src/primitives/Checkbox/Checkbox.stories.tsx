// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Checkbox } from './Checkbox';

const meta = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
};
export default meta;

const base = { onCheckedChange: () => {}, children: '라벨' };

export const Unchecked = { args: { ...base, checked: false } };
export const Checked = { args: { ...base, checked: true } };
export const Indeterminate = { args: { ...base, checked: false, indeterminate: true } };
export const Disabled = { args: { ...base, checked: true, disabled: true } };
