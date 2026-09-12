// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Button } from '../Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
};
export default meta;

export const MessageOnly = { args: { message: '검수할 초안이 없습니다.' } };

export const WithAction = {
  args: {
    message: '대기 중인 주제가 없습니다. 후보에서 골라 주세요.',
    action: <Button variant="secondary">후보 보기</Button>,
  },
};
