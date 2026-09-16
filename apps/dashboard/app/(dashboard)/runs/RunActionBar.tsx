'use client';
// 실행 상세 하단 바: 단계 Select + 수정 지시 Textarea + 재실행(확인 Dialog) / 승인(확인 Dialog).
// 판정("승인 대기인가")·단계 라벨은 서버가 props로 넘긴다 — 클라이언트는 pipeline·run-labels를
// import하지 않는다(decisions/server-only-boundary.md). 명령은 Route Handler(B2b)로 보낸다.
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ActionBar, Button, Dialog, Select, Textarea } from 'galley-ui';
import { approveRun, planRerun, reviseRun } from '../../../lib/run-api-client';
import {
  describeRerunPlan,
  validateInstruction,
  type StepOption,
} from '../../../lib/run-action-bar';
import { runsHref } from '../../../lib/run-view';
import type { RerunPlanView } from '../../../lib/run-commands';
import styles from './RunActionBar.module.css';

export interface RunActionBarProps {
  runId: string;
  /** 승인 대기일 때만 true. 아니면 컨트롤 전부 비활성. */
  enabled: boolean;
  /** 파이프라인 순서의 (이름, 라벨). Select 항목과 확인 Dialog 문구에 쓴다. */
  steps: readonly StepOption[];
  maxLength: number;
}

const AUTO_STEP = '__auto__';

export function RunActionBar({ runId, enabled, steps, maxLength }: RunActionBarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [instruction, setInstruction] = useState('');
  const [startStep, setStartStep] = useState<string>(AUTO_STEP);
  const [message, setMessage] = useState<string | null>(null);
  const [plan, setPlan] = useState<RerunPlanView | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);

  const disabled = !enabled || pending;
  const request = () => ({
    instruction: instruction.trim(),
    ...(startStep === AUTO_STEP ? {} : { startStep }),
  });

  const stepItems = [
    {
      value: AUTO_STEP,
      label: '단계 자동',
      description: '지시에 근거·커밋·코드가 있으면 근거 수집부터',
    },
    ...steps.map((s) => ({ value: s.name, label: s.label })),
  ];

  // 재실행: 먼저 계획(다시 도는 단계)을 받아 Dialog로 보여주고, 확인해야 실제로 보낸다.
  const onRerunClick = () => {
    const invalid = validateInstruction(instruction, maxLength);
    if (invalid !== null) {
      setMessage(invalid);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await planRerun(runId, request());
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setPlan(result.data);
    });
  };

  const onRerunConfirm = () => {
    startTransition(async () => {
      const result = await reviseRun(runId, request());
      setPlan(null);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      // 이 실행은 revised로 종결됐다. 새로 대기열에 오른 다음 시도를 연다.
      setInstruction('');
      router.push(runsHref({ tab: 'active', selectedId: result.data.run.id }));
    });
  };

  // 승인: 되돌릴 수 없는 종결이라 확인 Dialog를 거친다(decisions/layout.md "승인(주요, Dialog 확인)").
  // 승인은 Run 상태 변경일 뿐 공개 발행이 아니다(decisions/publish-gate.md) — 문구도 그렇게.
  const onApproveClick = () => {
    setMessage(null);
    setApproveOpen(true);
  };

  const onApproveConfirm = () => {
    startTransition(async () => {
      const result = await approveRun(runId);
      setApproveOpen(false);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  const planText = plan === null ? null : describeRerunPlan(plan, steps);

  return (
    <>
      <ActionBar
        label="수정 지시"
        actions={
          <>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={onRerunClick}>
              재실행
            </Button>
            <Button size="sm" disabled={disabled} onClick={onApproveClick}>
              승인
            </Button>
          </>
        }
      >
        <div className={styles.fields}>
          <div className={styles.row}>
            <div className={styles.step}>
              <Select
                value={startStep}
                onValueChange={setStartStep}
                items={stepItems}
                disabled={disabled}
                aria-label="시작 단계"
              />
            </div>
            <Textarea
              className={styles.instruction}
              aria-label="수정 지시 입력"
              placeholder={
                enabled
                  ? '수정 지시를 입력하세요.'
                  : '승인 대기 상태에서만 지시·승인할 수 있습니다.'
              }
              rows={2}
              maxLength={maxLength}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={disabled}
            />
          </div>
          <p role="status" className={styles.message}>
            {message ?? ''}
          </p>
        </div>
      </ActionBar>

      <Dialog
        open={plan !== null}
        onOpenChange={(open) => {
          if (!open) setPlan(null);
        }}
        title="다시 실행할까요?"
        description="비용이 드는 작업입니다. 시작 단계와 그 뒤 단계가 전부 다시 돕니다."
        footer={
          <>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setPlan(null)}>
              취소
            </Button>
            <Button size="sm" disabled={pending} onClick={onRerunConfirm}>
              재실행
            </Button>
          </>
        }
      >
        {planText !== null ? (
          <dl className={styles.plan}>
            <dt>다시 도는 단계</dt>
            <dd>{planText.fresh}</dd>
            {planText.carried !== null ? (
              <>
                <dt>이전 결과 유지</dt>
                <dd>{planText.carried}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </Dialog>

      <Dialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="승인할까요?"
        description="이 초안을 검수 완료로 종결합니다. 공개 발행은 일어나지 않고, 발행 준비 화면에서 채널별로 이어집니다."
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setApproveOpen(false)}
            >
              취소
            </Button>
            <Button size="sm" disabled={pending} onClick={onApproveConfirm}>
              승인
            </Button>
          </>
        }
      />
    </>
  );
}
