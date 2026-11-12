// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Button } from '../Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
};
export default meta;

export const MessageOnly = { args: { message: '항목이 없습니다.' } };

export const WithAction = {
  args: {
    message: '표시할 항목이 없습니다. 필터를 바꿔 보세요.',
    action: <Button variant="secondary">후보 보기</Button>,
  },
};
