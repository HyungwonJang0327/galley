// Storybook 스토리(CSF3). 훅은 소비자 예시로 보인다. 실행 환경은 Phase 2.
import { useState } from 'react';
import { useAwaitDialog } from './useAwaitDialog';
import { useConfirm } from './useConfirm';
import { useAlert } from './useAlert';
import { Button } from '../../components/Button';
import { Dialog } from '../../primitives/Dialog';
import { Input } from '../../primitives/Input';

const meta = {
  title: 'Hooks/useAwaitDialog',
};
export default meta;

// 삭제 확인(danger) — await 한 줄로 분기한다.
function DeleteButton() {
  const { confirm, element } = useConfirm();
  const [result, setResult] = useState('');
  return (
    <>
      <Button
        variant="danger"
        onClick={async () => {
          const ok = await confirm({
            title: '삭제할까요?',
            description: '되돌릴 수 없습니다.',
            confirmLabel: '삭제',
            tone: 'danger',
          });
          setResult(ok ? '삭제함' : '취소');
        }}
      >
        삭제
      </Button>
      <span>{result}</span>
      {element}
    </>
  );
}

export const ConfirmDanger = { render: () => <DeleteButton /> };

// 이름 입력 후 반환 — 값 있는 결과. 취소·Esc·닫기는 null.
function RenameButton() {
  const { open, element } = useAwaitDialog<string | null>(null);
  const [name, setName] = useState('초안');
  return (
    <>
      <Button
        variant="secondary"
        onClick={async () => {
          const next = await open((dialog) => <RenameDialog initial={name} {...dialog} />);
          if (next !== null) setName(next);
        }}
      >
        이름 바꾸기
      </Button>
      <span>{name}</span>
      {element}
    </>
  );
}

function RenameDialog({
  initial,
  open,
  onOpenChange,
  resolve,
  cancel,
}: {
  initial: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolve: (value: string | null) => void;
  cancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="새 이름"
      footer={
        <>
          <Button variant="secondary" onClick={cancel}>
            취소
          </Button>
          <Button onClick={() => resolve(value.trim())} disabled={value.trim() === ''}>
            저장
          </Button>
        </>
      }
    >
      <Input aria-label="이름" value={value} onChange={(e) => setValue(e.target.value)} />
    </Dialog>
  );
}

export const AwaitValue = { render: () => <RenameButton /> };

// 안내 — 확인 버튼 하나. 어떻게 닫아도 끝난다.
function SavedButton() {
  const { alert, element } = useAlert();
  return (
    <>
      <Button
        variant="secondary"
        onClick={async () => {
          await alert({ title: '저장했습니다', description: '큐로 돌아갑니다.' });
        }}
      >
        저장 안내
      </Button>
      {element}
    </>
  );
}

export const Alert = { render: () => <SavedButton /> };
