// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Select } from './Select';
import type { SelectItem } from './Select';

const meta = {
  title: 'Primitives/Select',
  component: Select,
};
export default meta;

const items: SelectItem[] = [
  { value: 'a', label: '첫째', description: '보조 텍스트', trailing: '1 / 5' },
  { value: 'b', label: '둘째', description: '보조 텍스트', trailing: '2 / 10' },
  { value: 'c', label: '셋째', disabled: true, disabledReason: '사용할 수 없는 사유' },
];

export const Placeholder = {
  args: { value: null, onValueChange: () => {}, items, placeholder: '선택', 'aria-label': '옵션' },
};
export const Selected = {
  args: { value: 'b', onValueChange: () => {}, items, 'aria-label': '옵션' },
};
export const Disabled = {
  args: { value: 'a', onValueChange: () => {}, items, 'aria-label': '옵션', disabled: true },
};
