// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Textarea } from './Textarea';

const meta = {
  title: 'Primitives/Textarea',
  component: Textarea,
};
export default meta;

export const Placeholder = { args: { 'aria-label': '입력', placeholder: '여러 줄을 입력하세요' } };
export const Filled = { args: { 'aria-label': '입력', defaultValue: '첫 줄\n둘째 줄' } };
export const Disabled = {
  args: { 'aria-label': '입력', placeholder: '입력하세요', disabled: true },
};
export const Invalid = { args: { 'aria-label': '입력', defaultValue: '잘못된 값', invalid: true } };
