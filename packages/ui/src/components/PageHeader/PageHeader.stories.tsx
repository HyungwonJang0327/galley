// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { PageHeader } from './PageHeader';

const meta = {
  title: 'Components/PageHeader',
  component: PageHeader,
};
export default meta;

export const Default = { args: { title: '페이지 제목' } };
