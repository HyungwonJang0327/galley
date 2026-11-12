// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Tooltip } from './Tooltip';

const meta = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
};
export default meta;

const trigger = <button type="button">올려 보기</button>;

export const Top = { args: { trigger, content: '위에 뜨는 설명' } };
export const Right = { args: { trigger, content: '오른쪽에 뜨는 설명', side: 'right' } };
export const Long = {
  args: { trigger, content: '최대 폭 토큰에서 줄바꿈되는 조금 더 긴 보조 설명 문구입니다.' },
};
