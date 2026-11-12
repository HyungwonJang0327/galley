// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Breadcrumb } from './Breadcrumb';

const meta = {
  title: 'Components/Breadcrumb',
  component: Breadcrumb,
};
export default meta;

export const TwoLevels = {
  args: { 'aria-label': 'Breadcrumb', items: [{ label: 'Settings' }, { label: 'Models' }] },
};
export const WithLinks = {
  args: {
    'aria-label': 'Breadcrumb',
    items: [
      { label: 'Home', render: <a href="/" /> },
      { label: 'Settings', render: <a href="/settings" /> },
      { label: 'Models' },
    ],
  },
};
export const Single = { args: { 'aria-label': 'Breadcrumb', items: [{ label: 'Home' }] } };
