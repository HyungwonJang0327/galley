// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { ItemContent } from './ItemContent';

const meta = {
  title: 'Primitives/ItemContent',
  component: ItemContent,
};
export default meta;

export const LabelOnly = { args: { label: '짧은 라벨' } };
export const WithDescription = { args: { label: '라벨', description: '보조 텍스트' } };
export const WithDescriptionAndMeta = {
  args: { label: '라벨', description: '보조 텍스트', meta: '1.25 / 10' },
};
export const LongLabelAndDescription = {
  args: {
    label: '아주 긴 라벨 텍스트가 여기에 들어가면 두 줄까지만 보이고 그 이상은 잘린다 사십자',
    description: '보조 텍스트도 길어지면 한 줄에서 말줄임표로 잘린다 · 두 번째 조각 · 세 번째 조각',
    meta: '10 / 50',
  },
};
