// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
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
      aria-label="하단 액션 바"
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
