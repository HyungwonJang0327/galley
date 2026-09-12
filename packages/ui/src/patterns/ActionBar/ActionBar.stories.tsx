// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Button } from '../../components/Button';
import { ActionBar } from './ActionBar';

const meta = {
  title: 'Patterns/ActionBar',
  component: ActionBar,
};
export default meta;

export const Default = {
  render: () => (
    <ActionBar
      label="하단 액션 바"
      actions={
        <>
          <Button variant="secondary" size="sm">
            보조
          </Button>
          <Button size="sm">주요</Button>
        </>
      }
    >
      <input aria-label="입력" placeholder="입력" />
    </ActionBar>
  ),
};
