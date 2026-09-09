// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Button } from '../../components/Button';
import { Dialog } from './Dialog';

const meta = {
  title: 'Primitives/Dialog',
  component: Dialog,
};
export default meta;

export const Open = {
  args: {
    open: true,
    onOpenChange: () => {},
    title: '제목',
    description: '한 줄 설명입니다.',
    children: '본문 내용',
    footer: (
      <>
        <Button variant="secondary">취소</Button>
        <Button>확인</Button>
      </>
    ),
  },
};

export const WithTrigger = {
  args: {
    open: false,
    onOpenChange: () => {},
    title: '제목',
    trigger: <Button>열기</Button>,
    children: '본문 내용',
  },
};
