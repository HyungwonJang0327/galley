// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Card } from './Card';

const meta = {
  title: 'Components/Card',
  component: Card,
};
export default meta;

export const Default = { args: { children: 'Card content' } };
