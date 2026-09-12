// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { StatTile } from './StatTile';

const meta = {
  title: 'Components/StatTile',
  component: StatTile,
};
export default meta;

export const Default = { args: { label: '대기', value: 3 } };
export const Link = { args: { label: '대기', value: 3, href: '/queue' } };
export const Muted = { args: { label: '대기', value: 0, tone: 'muted', href: '/queue' } };
export const Warning = { args: { label: '승인 대기', value: 2, tone: 'warning', href: '/runs' } };
export const Placeholder = { args: { label: '이번 달 비용', value: '—', tone: 'muted' } };
export const LongLabel = {
  args: { label: '아주 긴 라벨은 한 줄에서 말줄임표로 잘린다', value: 12, href: '/queue' },
};
