'use client';

import { useState } from 'react';
import {
  ActionBar,
  Badge,
  Button,
  Dialog,
  ListRow,
  ListRows,
  Menu,
  Select,
  SplitPane,
  TimelineItem,
  TimelineItems,
} from '@galley/ui';
import type { MenuEntry, SelectItem } from '@galley/ui';
import styles from './page.module.css';

// 갤러리용 상태 있는 데모. 서버 컴포넌트(page.tsx)는 함수 prop을 넘길 수 없어 여기서 상태를 갖는다.

const ITEMS: SelectItem[] = [
  { value: 'a', label: '첫째 옵션', description: '보조 텍스트', meta: '1 / 5' },
  { value: 'b', label: '둘째 옵션', description: '보조 텍스트', meta: '2 / 10' },
  { value: 'c', label: '셋째 옵션', disabled: true, disabledReason: '사용할 수 없는 항목' },
];

// 아이템 레이아웃 4케이스 — 어떤 경우에도 글자가 세로로 떨어지지 않아야 한다.
const LABEL_ONLY: SelectItem[] = [
  { value: 'a', label: '첫째' },
  { value: 'b', label: '둘째' },
];
const WITH_DESCRIPTION: SelectItem[] = [
  { value: 'a', label: '첫째', description: '보조 텍스트 A' },
  { value: 'b', label: '둘째', description: '보조 텍스트 B' },
];
const WITH_DESCRIPTION_META: SelectItem[] = [
  { value: 'a', label: '첫째', description: '보조 텍스트 A', meta: '1.25 / 10' },
  { value: 'b', label: '둘째', description: '보조 텍스트 B', meta: '5 / 25' },
];
const LONG: SelectItem[] = [
  {
    value: 'a',
    label: '아주 긴 라벨 텍스트가 여기에 들어가면 두 줄까지만 보이고 그 이상은 잘린다 사십자',
    description: '보조 텍스트도 길어지면 한 줄에서 말줄임표로 잘린다 · 두 번째 조각 · 세 번째 조각',
    meta: '10 / 50',
  },
  { value: 'b', label: '둘째', description: '짧은 보조', meta: '1 / 5' },
];

export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="제목 예시"
      description="한 줄 설명 텍스트."
      trigger={<Button variant="secondary">Dialog 열기</Button>}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={() => setOpen(false)}>확인</Button>
        </>
      }
    >
      본문 내용. Esc·바깥 클릭·닫기 버튼으로 닫힌다.
    </Dialog>
  );
}

function StatefulSelect({ items, label }: { items: SelectItem[]; label: string }) {
  const [value, setValue] = useState<string | null>(items[0]?.value ?? null);
  return <Select value={value} onValueChange={setValue} items={items} aria-label={label} />;
}

export function SelectDemo() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Select
      value={value}
      onValueChange={setValue}
      items={ITEMS}
      placeholder="선택"
      aria-label="옵션 선택"
    />
  );
}

export function SelectDisabledDemo() {
  return (
    <Select value="a" onValueChange={() => {}} items={ITEMS} aria-label="비활성 옵션" disabled />
  );
}

export function SelectLabelOnlyDemo() {
  return <StatefulSelect items={LABEL_ONLY} label="라벨만" />;
}
export function SelectWithDescriptionDemo() {
  return <StatefulSelect items={WITH_DESCRIPTION} label="라벨과 보조" />;
}
export function SelectWithDescriptionMetaDemo() {
  return <StatefulSelect items={WITH_DESCRIPTION_META} label="라벨과 보조와 메타" />;
}
export function SelectLongDemo() {
  return <StatefulSelect items={LONG} label="긴 라벨" />;
}
const PATH_LABEL: SelectItem[] = [
  {
    value: 'a',
    label: 'packages/pipeline/src/evidence/collectors/repository-index/incremental-reindex-job.ts',
    description: '공백이 없는 긴 경로',
  },
  { value: 'b', label: '짧은 라벨' },
];
const FORTY: SelectItem[] = Array.from({ length: 40 }, (_, i) => ({
  value: `item-${i + 1}`,
  label: `항목 ${i + 1}`,
  description: `보조 ${i + 1}`,
}));
const LONG_VALUE: SelectItem[] = [
  { value: 'a', label: '선택된 값이 아주 길어서 트리거 폭을 넘어가면 말줄임표로 잘린다' },
  { value: 'b', label: '짧은 값' },
];

/** 공백 없는 80자 경로 라벨. */
export function SelectPathLabelDemo() {
  return <StatefulSelect items={PATH_LABEL} label="경로 라벨" />;
}
/** 항목 40개, 35번째 선택 — 열릴 때 선택 항목이 보여야 한다. */
export function SelectFortyDemo() {
  const [value, setValue] = useState<string | null>('item-35');
  return <Select value={value} onValueChange={setValue} items={FORTY} aria-label="항목 40개" />;
}
/** 트리거에 긴 선택값 — 폭은 부모가 정한다. */
export function SelectLongValueDemo() {
  return <StatefulSelect items={LONG_VALUE} label="긴 선택값" />;
}
/** 화면 하단: 아래 공간이 모자라면 팝업이 위로 뒤집힌다. */
export function SelectAtBottomDemo() {
  return <StatefulSelect items={WITH_DESCRIPTION_META} label="화면 하단" />;
}

// Menu 데모 — 트리거 aria-label은 verify:layout(menu.mjs)이 찾는 이름이다.
const MENU_BASIC: MenuEntry[] = [
  { id: 'first', label: '첫째' },
  { id: 'second', label: '둘째' },
  { id: 'third', label: '셋째', disabled: true, disabledReason: '사용할 수 없는 항목' },
  { type: 'separator' },
  { id: 'fourth', label: '넷째' },
];
const MENU_DESCRIPTION_META: MenuEntry[] = [
  { id: 'first', label: '첫째', description: '보조 텍스트 A', meta: '⌘1' },
  { id: 'second', label: '둘째', description: '보조 텍스트 B', meta: '⌘2' },
];
const MENU_LONG: MenuEntry[] = [
  {
    id: 'long',
    label: '아주 긴 라벨 텍스트가 여기에 들어가면 두 줄까지만 보이고 그 이상은 잘린다 사십자',
    description: '보조 텍스트도 길어지면 한 줄에서 말줄임표로 잘린다 · 두 번째 조각 · 세 번째 조각',
  },
  {
    id: 'path',
    label: 'packages/pipeline/src/evidence/collectors/repository-index/incremental-reindex-job.ts',
  },
];

function labelOf(items: MenuEntry[], id: string): string {
  const item = items.find((entry) => !('type' in entry) && entry.id === id);
  return item && !('type' in item) ? item.label : id;
}

// 요소를 직접 넘긴다 — Menu가 트리거 props·ref를 병합하므로 props를 버리는 래퍼 컴포넌트는 안 된다.
function menuTrigger(label: string) {
  return (
    <Button variant="ghost" size="sm" aria-label={label}>
      ⋮
    </Button>
  );
}

/** 행 끝 ⋮ 메뉴. 고른 항목을 행 보조 텍스트에 보여준다. */
function MenuRow({ title, label, items }: { title: string; label: string; items: MenuEntry[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ListRow
      title={title}
      meta={selected ? `선택: ${selected}` : '⋮를 눌러 메뉴 열기'}
      actions={
        <Menu
          trigger={menuTrigger(label)}
          items={items}
          onSelect={(id) => setSelected(labelOf(items, id))}
        />
      }
    />
  );
}

export function MenuRowsDemo() {
  return (
    <ListRows>
      <MenuRow title="라벨만 · disabled · 구분선" label="메뉴 기본" items={MENU_BASIC} />
      <MenuRow title="라벨 + 보조 + 메타" label="메뉴 보조와 메타" items={MENU_DESCRIPTION_META} />
      <MenuRow
        title="긴 라벨(40자) · 긴 보조 · 공백 없는 경로"
        label="메뉴 긴 라벨"
        items={MENU_LONG}
      />
    </ListRows>
  );
}

/** 화면 하단: 아래 공간이 모자라면 팝업이 위로 뒤집힌다. */
export function MenuAtBottomDemo() {
  return <Menu trigger={menuTrigger('메뉴 화면 하단')} items={MENU_BASIC} onSelect={() => {}} />;
}

/**
 * 2분할 상세형(B) 골격 데모. TimelineItem 펼침이 클라이언트 상태라 여기에 둔다.
 * verify:layout이 aria-label과 data-demo에 결합해 실측한다 — 바꾸면 split-pane.mjs도 맞춘다.
 */
export function SplitPaneDemo() {
  return (
    <div className={styles.splitPaneBox}>
      <SplitPane
        listLabel="목록 영역"
        detailLabel="상세 영역"
        header={
          <div className={styles.pad}>
            <strong>항목 제목</strong> <Badge variant="warning">상태</Badge>
          </div>
        }
        footer={
          <ActionBar
            label="하단 액션 바"
            actions={
              <>
                <Button variant="secondary" size="sm">
                  보조
                </Button>
                <Button size="sm">주요</Button>
              </>
            }
          >
            <input aria-label="지시 입력" placeholder="지시 입력" />
          </ActionBar>
        }
        list={
          <ListRows>
            {Array.from({ length: 10 }, (_, i) => (
              <ListRow
                key={i}
                title={`항목 ${i + 1}`}
                meta="보조 · 텍스트"
                trailing={<Badge variant={i === 0 ? 'info' : 'neutral'}>상태</Badge>}
                isActive={i === 0}
              />
            ))}
          </ListRows>
        }
      >
        <TimelineItems data-demo="상세 본문">
          <TimelineItem
            status="done"
            statusLabel="완료"
            title="첫째 줄(펼침 있음)"
            meta="12초 · 1.2k 토큰"
            trailing={
              <Button variant="ghost" size="sm">
                보기
              </Button>
            }
          >
            펼침 영역. 내용은 앱이 넣는다.
          </TimelineItem>
          <TimelineItem
            status="done"
            statusLabel="완료"
            title="둘째 줄"
            meta="8초 · 900 토큰"
            trailing={<Badge variant="success">완료</Badge>}
          />
          <TimelineItem
            status="active"
            statusLabel="진행 중"
            title="셋째 줄"
            meta="진행 중"
            trailing={
              <Badge variant="info" pulse>
                진행
              </Badge>
            }
          />
          <TimelineItem
            status="failed"
            statusLabel="실패"
            title="넷째 줄"
            meta="3초 · 오류"
            trailing={<Badge variant="danger">실패</Badge>}
          />
          <TimelineItem status="pending" statusLabel="대기" title="다섯째 줄" meta="대기" />
          <TimelineItem status="pending" statusLabel="대기" title="여섯째 줄" meta="대기" />
          <TimelineItem status="pending" statusLabel="대기" title="일곱째 줄" meta="대기" />
          <TimelineItem
            status="pending"
            statusLabel="대기"
            title="여덟째 줄(마지막 — 세로선 끊김)"
            meta="대기"
            isLast
          />
        </TimelineItems>
      </SplitPane>
    </div>
  );
}
