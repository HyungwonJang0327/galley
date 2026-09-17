// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
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
