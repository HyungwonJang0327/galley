// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { RadioGroup } from './RadioGroup';

const meta = {
  title: 'Primitives/RadioGroup',
  component: RadioGroup,
};
export default meta;

const items = [
  { value: 'a', label: '첫째', description: '첫째 항목의 보조 설명' },
  { value: 'b', label: '둘째', description: '둘째 항목의 보조 설명' },
  { value: 'c', label: '셋째(비활성)', disabled: true },
];
const base = { onValueChange: () => {}, items, 'aria-label': '예시 그룹' };

export const Vertical = { args: { ...base, value: 'a' } };
export const Horizontal = { args: { ...base, value: 'b', orientation: 'horizontal' } };
export const Unselected = { args: { ...base, value: null } };
export const Disabled = { args: { ...base, value: 'a', disabled: true } };
