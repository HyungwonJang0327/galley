// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Badge } from '../../components/Badge';
import { ListRow } from './ListRow';
import { ListRows } from './ListRows';

const meta = {
  title: 'Patterns/ListRow',
  component: ListRow,
};
export default meta;

export const Default = {
  render: () => (
    <ListRows>
      <ListRow
        title="첫 번째 항목"
        meta="보조 · 텍스트"
        trailing={<Badge variant="info">상태</Badge>}
      />
      <ListRow title="두 번째 항목" meta="보조 · 텍스트" trailing={<Badge>상태</Badge>} />
    </ListRows>
  ),
};

export const WithSlots = {
  render: () => (
    <ListRows>
      <ListRow
        leading={<span aria-hidden="true">⋮⋮</span>}
        title="핸들·배지·시간·액션이 있는 행"
        meta="보조 · 텍스트"
        trailing={
          <>
            <Badge variant="warning">상태</Badge>
            <span>3분 전</span>
          </>
        }
        actions={
          <button type="button" aria-label="메뉴">
            ⋮
          </button>
        }
      />
    </ListRows>
  ),
};

export const Active = {
  render: () => (
    <ListRows>
      <ListRow title="선택된 행" isActive />
      <ListRow title="보통 행" />
    </ListRows>
  ),
};
