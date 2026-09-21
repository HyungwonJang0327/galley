// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Skeleton } from './Skeleton';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
};
export default meta;

export const Text = { args: { width: 240 } };
export const Lines = { args: { lines: 3 } };
export const Circle = { args: { radius: 'pill', width: 40, height: 40 } };
export const Block = { args: { radius: 'md', width: '100%', height: 120 } };

/**
 * 규칙: Skeleton은 aria-hidden(기본)이라 보조 기술에는 아무것도 아니다. 로딩 상태는 밖에서 알린다 —
 * 내용을 담는 부모에 aria-busy="true"(그 안의 변화 낭독 보류 힌트, 이것만으로는 안 읽힘) +
 * 그 밖에 상시 role="status" 텍스트(시각 숨김)로 "불러오는 중"을 넣는다. 내용이 오면 aria-busy를 내리고
 * status 문구를 비우고 Skeleton을 내용으로 바꾼다.
 */
export const LoadingCard = {
  render: () => (
    <div>
      <span role="status" style={VISUALLY_HIDDEN}>
        불러오는 중
      </span>
      <div aria-busy="true" style={{ display: 'flex', gap: 'var(--ui-space-3)' }}>
        <Skeleton radius="pill" width={40} height={40} />
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
    </div>
  ),
};

// 시각 숨김(스크린리더만). 스토리용 — 앱은 자기 유틸 클래스를 쓴다.
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;
