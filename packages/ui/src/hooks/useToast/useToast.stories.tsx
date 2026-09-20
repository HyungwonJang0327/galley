// Storybook 스토리(CSF3). 훅은 Provider 아래 소비자 예시로 보인다. 실행 환경은 Phase 2.
import { useToast } from './useToast';
import { ToastProvider } from '../../primitives/Toast';
import { Button } from '../../components/Button';

const meta = {
  title: 'Hooks/useToast',
};
export default meta;

// 저장 버튼 — 결과에 따라 tone을 고르고, 실패면 자동으로 닫지 않는다.
function SaveButton({ fail }: { fail: boolean }) {
  const { toast } = useToast();
  return (
    <Button
      onClick={() =>
        fail
          ? toast({ title: '저장하지 못했습니다', tone: 'danger', duration: 0 })
          : toast({ title: '저장했습니다', tone: 'success' })
      }
    >
      {fail ? '실패하는 저장' : '저장'}
    </Button>
  );
}

export const Basic = {
  render: () => (
    <ToastProvider>
      <div style={{ display: 'flex', gap: 'var(--ui-space-2)' }}>
        <SaveButton fail={false} />
        <SaveButton fail />
      </div>
    </ToastProvider>
  ),
};
