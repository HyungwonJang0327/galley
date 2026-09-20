// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { ToastProvider } from './Toast';
import type { ToastProviderProps } from './Toast';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/Button';

const meta = {
  title: 'Primitives/Toast',
  component: ToastProvider,
};
export default meta;

function Buttons() {
  const { toast } = useToast();
  return (
    <div style={{ display: 'flex', gap: 'var(--ui-space-2)' }}>
      <Button variant="secondary" onClick={() => toast({ title: '저장했습니다', tone: 'success' })}>
        success
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            title: '저장하지 못했습니다',
            description: '잠시 뒤 다시 시도하세요.',
            tone: 'danger',
          })
        }
      >
        danger
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: '남아 있는 안내', duration: 0 })}>
        duration 0
      </Button>
    </div>
  );
}

export const TopRight = {
  args: { position: 'top-right' },
  render: (args: ToastProviderProps) => (
    <ToastProvider {...args}>
      <Buttons />
    </ToastProvider>
  ),
};

export const BottomRight = {
  ...TopRight,
  args: { position: 'bottom-right' },
};

export const Limit = {
  ...TopRight,
  args: { limit: 2, timeout: 0 },
};
