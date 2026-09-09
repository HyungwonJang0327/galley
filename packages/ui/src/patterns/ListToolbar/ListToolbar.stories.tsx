// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { ListToolbar } from './ListToolbar';
import { ListToolbarTab } from './ListToolbarTab';

const meta = {
  title: 'Patterns/ListToolbar',
  component: ListToolbar,
};
export default meta;

const tabs = (
  <>
    <ListToolbarTab label="첫째" count={3} isActive />
    <ListToolbarTab label="둘째" count={12} />
    <ListToolbarTab label="셋째" />
  </>
);

export const TabsOnly = { args: { tabs } };
export const WithSearch = {
  args: { tabs, search: <input placeholder="검색" aria-label="검색" /> },
};
export const WithSearchAndFilters = {
  args: {
    tabs,
    search: <input placeholder="검색" aria-label="검색" />,
    filters: (
      <select aria-label="필터">
        <option>전체</option>
      </select>
    ),
  },
};
