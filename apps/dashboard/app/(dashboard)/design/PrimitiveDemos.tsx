'use client';

import { useState } from 'react';
import { Button, Dialog, Select } from '@galley/ui';
import type { SelectItem } from '@galley/ui';

// 갤러리용 상태 있는 데모. 서버 컴포넌트(page.tsx)는 함수 prop을 넘길 수 없어 여기서 상태를 갖는다.

const ITEMS: SelectItem[] = [
  { value: 'a', label: '첫째 옵션', description: '보조 텍스트', trailing: '1 / 5' },
  { value: 'b', label: '둘째 옵션', description: '보조 텍스트', trailing: '2 / 10' },
  { value: 'c', label: '셋째 옵션', disabled: true, disabledReason: '사용할 수 없는 항목' },
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
