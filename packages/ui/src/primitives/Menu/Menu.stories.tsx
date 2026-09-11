// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import type { ReactElement } from 'react';
import { Button } from '../../components/Button';
import { Menu } from './Menu';
import type { MenuEntry } from './Menu';

const meta = {
  title: 'Primitives/Menu',
  component: Menu,
};
export default meta;

const base = {
  trigger: (
    <Button variant="ghost" size="sm" aria-label="메뉴">
      ⋮
    </Button>
  ),
  onSelect: () => {},
};

const items: MenuEntry[] = [
  { id: 'a', label: '첫째' },
  { id: 'b', label: '둘째' },
  { id: 'c', label: '셋째', disabled: true, disabledReason: '사용할 수 없는 사유' },
  { type: 'separator' },
  { id: 'd', label: '넷째' },
];

/** 라벨만 + disabled + 구분선. */
export const Basic = { args: { ...base, items } };

export const WithDescriptionAndMeta = {
  args: {
    ...base,
    items: [
      { id: 'a', label: '첫째', description: '보조 텍스트 A', meta: '⌘1' },
      { id: 'b', label: '둘째', description: '보조 텍스트 B', meta: '⌘2' },
    ],
  },
};

/** 긴 라벨은 두 줄까지, 긴 보조는 한 줄 ellipsis, 공백 없는 경로도 팝업 폭 안에서 꺾인다. */
export const LongLabel = {
  args: {
    ...base,
    items: [
      {
        id: 'a',
        label: '아주 긴 라벨 텍스트가 여기에 들어가면 두 줄까지만 보이고 그 이상은 잘린다 사십자',
        description:
          '보조 텍스트도 길어지면 한 줄에서 말줄임표로 잘린다 · 두 번째 조각 · 세 번째 조각',
      },
      {
        id: 'b',
        label:
          'packages/pipeline/src/evidence/collectors/repository-index/incremental-reindex-job.ts',
      },
    ],
  },
};

/** 팝업을 트리거 왼쪽 끝에 맞춘다. */
export const AlignStart = { args: { ...base, items, align: 'start' } };

/** 화면 하단: 아래 공간이 모자라면 팝업이 위로 뒤집힌다(Base UI 충돌 회피). */
export const AtViewportBottom = {
  args: { ...base, items },
  decorators: [
    (Story: () => ReactElement) => (
      <div
        style={{ height: '100vh', display: 'flex', alignItems: 'flex-end', justifyContent: 'end' }}
      >
        <Story />
      </div>
    ),
  ],
};
