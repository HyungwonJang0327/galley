// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Badge } from '../../components/Badge';
import { TimelineItem } from './TimelineItem';
import { TimelineItems } from './TimelineItems';

const meta = {
  title: 'Patterns/TimelineItem',
  component: TimelineItem,
};
export default meta;

export const Default = {
  render: () => (
    <TimelineItems>
      <TimelineItem status="done" statusLabel="완료" title="첫 단계" meta="12초 · 1.2k 토큰" />
      <TimelineItem status="active" statusLabel="진행 중" title="둘째 단계" meta="진행 중" />
      <TimelineItem status="pending" statusLabel="대기" title="셋째 단계" isLast />
    </TimelineItems>
  ),
};

export const Expandable = {
  render: () => (
    <TimelineItems>
      <TimelineItem
        status="done"
        statusLabel="완료"
        title="펼치면 내용이 보이는 줄"
        meta="8초 · 900 토큰"
        trailing={<Badge variant="success">완료</Badge>}
        defaultOpen
      >
        펼침 영역. 내용은 소비자가 넣는다.
      </TimelineItem>
      <TimelineItem status="failed" statusLabel="실패" title="실패한 줄" isLast>
        오류 내용.
      </TimelineItem>
    </TimelineItems>
  ),
};
