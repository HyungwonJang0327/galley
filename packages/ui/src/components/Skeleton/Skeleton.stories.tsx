// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Skeleton } from './Skeleton';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
};
export default meta;

export const Text = { args: { width: 240 } };
export const Lines = { args: { lines: 3 } };
export const Circle = { args: { radius: 'full', width: 40, height: 40 } };
export const Block = { args: { radius: 'md', width: '100%', height: 120 } };

/**
 * 규칙: "불러오는 중"은 Skeleton이 아니라 내용을 담는 부모가 aria-busy="true"로 알린다.
 * Skeleton은 aria-hidden(기본)이라 보조 기술에는 아무것도 아니다. 내용이 오면 aria-busy를 내리고
 * Skeleton을 내용으로 바꾼다.
 */
export const LoadingCard = {
  render: () => (
    <div
      aria-busy="true"
      style={{ display: 'flex', gap: 'var(--ui-space-3)', width: 'var(--ui-dialog-width)' }}
    >
      <Skeleton radius="full" width={40} height={40} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--ui-space-2)',
        }}
      >
        <Skeleton width="40%" height="var(--ui-text-h2)" />
        <Skeleton lines={2} />
      </div>
    </div>
  ),
};
