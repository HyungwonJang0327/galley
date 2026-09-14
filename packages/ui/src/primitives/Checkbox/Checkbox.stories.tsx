// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
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
