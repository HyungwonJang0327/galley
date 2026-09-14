// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Tabs } from './Tabs';
import type { TabItem } from './Tabs';

const meta = {
  title: 'Primitives/Tabs',
  component: Tabs,
};
export default meta;

const items: TabItem[] = [
  { value: 'a', label: '첫째', count: 3, content: '첫째 내용' },
  { value: 'b', label: '둘째', content: '둘째 내용' },
  { value: 'c', label: '셋째', disabled: true },
];
const base = { onValueChange: () => {}, items, 'aria-label': '구역' };

export const First = { args: { ...base, value: 'a' } };
export const Second = { args: { ...base, value: 'b' } };
export const ListOnly = {
  args: {
    ...base,
    value: 'a',
    items: items.map((item) => ({ value: item.value, label: item.label, count: item.count })),
  },
};
