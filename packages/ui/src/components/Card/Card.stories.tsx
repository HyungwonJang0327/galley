// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Card } from './Card';

const meta = {
  title: 'Components/Card',
  component: Card,
};
export default meta;

export const Default = { args: { children: 'Card content' } };
