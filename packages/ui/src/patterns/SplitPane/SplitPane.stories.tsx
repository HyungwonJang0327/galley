// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { ListRow, ListRows } from '../ListRow';
import { SplitPane } from './SplitPane';

const meta = {
  title: 'Patterns/SplitPane',
  component: SplitPane,
};
export default meta;

export const Default = {
  render: () => (
    <SplitPane
      listLabel="목록 영역"
      detailLabel="상세 영역"
      list={
        <ListRows>
          <ListRow title="첫 번째 항목" meta="보조 · 텍스트" isActive />
          <ListRow title="두 번째 항목" meta="보조 · 텍스트" />
        </ListRows>
      }
      header={<div style={{ padding: 16 }}>헤더</div>}
      footer={<div style={{ padding: 16 }}>하단 고정 영역</div>}
    >
      <div style={{ padding: 16 }}>본문</div>
    </SplitPane>
  ),
};
