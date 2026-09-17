// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Button } from '../Button';
import { InlineAlert } from './InlineAlert';

const meta = {
  title: 'Components/InlineAlert',
  component: InlineAlert,
};
export default meta;

export const Info = { args: { tone: 'info', children: '참고할 내용이 있습니다.' } };
export const Success = { args: { tone: 'success', children: '저장했습니다.' } };
export const Warning = {
  args: { tone: 'warning', title: '확인이 필요합니다', children: '일부 항목이 비어 있습니다.' },
};
export const Danger = {
  args: {
    tone: 'danger',
    title: '불러오지 못했습니다',
    children: '잠시 뒤 다시 시도해 주세요.',
    action: (
      <Button variant="secondary" size="sm">
        다시 시도
      </Button>
    ),
  },
};
export const Plain = {
  args: { tone: 'danger', variant: 'plain', children: '저장하지 못했습니다.' },
};
