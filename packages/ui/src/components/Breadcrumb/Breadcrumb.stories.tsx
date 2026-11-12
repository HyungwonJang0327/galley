// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
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
