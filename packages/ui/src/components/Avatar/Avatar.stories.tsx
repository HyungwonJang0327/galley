// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Avatar } from './Avatar';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
};
export default meta;

export const Initials = { args: { name: '홍길동' } };
export const TwoLatinWords = { args: { name: 'Ada Lovelace' } };
export const Small = { args: { name: 'Ada Lovelace', size: 'sm' } };
export const Large = { args: { name: 'Ada Lovelace', size: 'lg' } };
export const Image = {
  args: {
    name: 'Ada Lovelace',
    src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='%2360a5fa'/></svg>",
  },
};
export const BrokenImage = { args: { name: 'Ada Lovelace', src: '/nope.png' } };
