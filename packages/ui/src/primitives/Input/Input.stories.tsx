// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Input } from './Input';

const meta = {
  title: 'Primitives/Input',
  component: Input,
};
export default meta;

export const Placeholder = { args: { 'aria-label': '입력', placeholder: '입력하세요' } };
export const Filled = { args: { 'aria-label': '입력', defaultValue: '입력된 값' } };
export const Disabled = {
  args: { 'aria-label': '입력', placeholder: '입력하세요', disabled: true },
};
export const Invalid = { args: { 'aria-label': '입력', defaultValue: '잘못된 값', invalid: true } };
