// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import type { ReactElement } from 'react';
import { Select } from './Select';
import type { SelectItem } from './Select';

const meta = {
  title: 'Primitives/Select',
  component: Select,
};
export default meta;

const base = { onValueChange: () => {}, 'aria-label': '옵션' };

const items: SelectItem[] = [
  { value: 'a', label: '첫째', description: '보조 텍스트', meta: '1 / 5' },
  { value: 'b', label: '둘째', description: '보조 텍스트', meta: '2 / 10' },
  { value: 'c', label: '셋째', disabled: true, disabledReason: '사용할 수 없는 사유' },
];

export const Placeholder = { args: { ...base, value: null, items, placeholder: '선택' } };
export const Selected = { args: { ...base, value: 'b', items } };
export const Disabled = { args: { ...base, value: 'a', items, disabled: true } };

/** 아이템 레이아웃 4케이스 — 어떤 경우에도 글자가 세로로 떨어지지 않는다. */
export const ItemsLabelOnly = {
  args: {
    ...base,
    value: 'a',
    items: [
      { value: 'a', label: '첫째' },
      { value: 'b', label: '둘째' },
    ],
  },
};
export const ItemsWithDescription = {
  args: {
    ...base,
    value: 'a',
    items: [
      { value: 'a', label: '첫째', description: '보조 텍스트 A' },
      { value: 'b', label: '둘째', description: '보조 텍스트 B' },
    ],
  },
};
export const ItemsWithDescriptionAndMeta = {
  args: {
    ...base,
    value: 'a',
    items: [
      { value: 'a', label: '첫째', description: '보조 텍스트 A', meta: '1.25 / 10' },
      { value: 'b', label: '둘째', description: '보조 텍스트 B', meta: '5 / 25' },
    ],
  },
};
export const ItemsLongLabelAndDescription = {
  args: {
    ...base,
    value: 'a',
    items: [
      {
        value: 'a',
        label: '아주 긴 라벨 텍스트가 여기에 들어가면 두 줄까지만 보이고 그 이상은 잘린다 사십자',
        description:
          '보조 텍스트도 길어지면 한 줄에서 말줄임표로 잘린다 · 두 번째 조각 · 세 번째 조각',
        meta: '10 / 50',
      },
      { value: 'b', label: '둘째', description: '짧은 보조', meta: '1 / 5' },
    ],
  },
};

/** 공백 없는 80자 경로 라벨: overflow-wrap anywhere로 팝업 폭 안에서 꺾이고 두 줄까지만. */
export const ItemsPathLabelNoSpaces = {
  args: {
    ...base,
    value: 'a',
    items: [
      {
        value: 'a',
        label:
          'packages/pipeline/src/evidence/collectors/repository-index/incremental-reindex-job.ts',
        description: '공백이 없는 긴 경로',
      },
      { value: 'b', label: '짧은 라벨' },
    ],
  },
};

/** 항목 40개: 팝업은 max-height 안에서 스크롤하고, 열릴 때 선택 항목(35번째)이 보인다. */
export const ItemsForty = {
  args: {
    ...base,
    value: 'item-35',
    items: Array.from({ length: 40 }, (_, i) => ({
      value: `item-${i + 1}`,
      label: `항목 ${i + 1}`,
      description: `보조 ${i + 1}`,
    })),
  },
};

/** 트리거에 긴 선택값: 트리거 폭은 부모(200px)가 정하고 값은 ellipsis. */
export const TriggerLongValue = {
  args: {
    ...base,
    value: 'a',
    items: [
      { value: 'a', label: '선택된 값이 아주 길어서 트리거 폭을 넘어가면 말줄임표로 잘린다' },
      { value: 'b', label: '짧은 값' },
    ],
  },
  decorators: [
    (Story: () => ReactElement) => (
      <div style={{ width: 200 }}>
        <Story />
      </div>
    ),
  ],
};

/** 화면 하단: 아래 공간이 모자라면 팝업이 위로 뒤집힌다(Base UI 충돌 회피). */
export const AtViewportBottom = {
  args: { ...base, value: 'a', items },
  decorators: [
    (Story: () => ReactElement) => (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'flex-end' }}>
        <Story />
      </div>
    ),
  ],
};
