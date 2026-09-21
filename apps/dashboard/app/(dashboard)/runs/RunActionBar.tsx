'use client';
// 실행 상세 하단 바: 단계 Select + 수정 지시 Textarea + 재실행(확인) / 승인(확인).
// 판정("승인 대기인가")·단계 라벨은 서버가 props로 넘긴다 — 클라이언트는 pipeline·run-labels를
// import하지 않는다(decisions/server-only-boundary.md). 명령은 Route Handler(B2b)로 보낸다.
// 확인 Dialog 둘은 useConfirm 하나로(decisions/confirm-dialog-usage.md): 확인을 누르면 즉시 닫히고,
// API가 도는 동안은 바의 컨트롤 비활성 + role=status의 "요청 중" 문구가 진행 표시다.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ActionBar, Button, Select, Textarea, useConfirm } from 'galley-ui';
import { approveRun, planRerun, reviseRun } from '../../../lib/run-api-client';
import {
  describeRerunPlan,
  validateInstruction,
  type StepOption,
} from '../../../lib/run-action-bar';
import { runsHref } from '../../../lib/run-view';
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
  const { confirm, element: confirmElement } = useConfirm();
  const [instruction, setInstruction] = useState('');
  const [startStep, setStartStep] = useState<string>(AUTO_STEP);
  /** 오류·안내 한 줄. */
  const [message, setMessage] = useState<string | null>(null);
  /** API가 도는 동안의 진행 문구. null이면 유휴. */
  const [busy, setBusy] = useState<string | null>(null);
  const rerunButton = useRef<HTMLButtonElement | null>(null);
  const approveButton = useRef<HTMLButtonElement | null>(null);
  /** busy가 풀린 다음 렌더에서 포커스를 되돌릴 버튼. Dialog가 닫히며 돌려준 포커스는 버튼이
   *  disabled인 동안 body로 떨어지므로(Base UI는 tabbable에만 복귀) 여기서 다시 잡는다. */
  const focusAfterBusy = useRef<HTMLButtonElement | null>(null);
  /** 요청 중 다른 실행을 고르면(page.tsx의 key) 이 바는 언마운트된다 — 그 뒤 push·refresh 금지. */
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (busy === null && focusAfterBusy.current !== null) {
      focusAfterBusy.current.focus();
      focusAfterBusy.current = null;
    }
  }, [busy]);

  /** API 호출 하나를 감싼다: 진행 문구 → 호출 → (마운트돼 있으면) 문구 해제 + 포커스 복귀 예약. */
  const runBusy = async <T,>(
    text: string,
    call: () => Promise<T>,
    focusTarget: HTMLButtonElement | null,
  ): Promise<T | null> => {
    setBusy(text);
    const result = await call();
    if (!mounted.current) return null;
    focusAfterBusy.current = focusTarget;
    setBusy(null);
    return result;
  };

  const disabled = !enabled || busy !== null;
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

  // 재실행: 먼저 계획(다시 도는 단계)을 받아 확인 Dialog로 보여주고, 확인해야 실제로 보낸다.
  const onRerunClick = async () => {
    const invalid = validateInstruction(instruction, maxLength);
    if (invalid !== null) {
      setMessage(invalid);
      return;
    }
    setMessage(null);
    const planned = await runBusy(
      '재실행 계획을 확인하는 중…',
      () => planRerun(runId, request()),
      null,
    );
    if (planned === null) return;
    if (!planned.ok) {
      setMessage(planned.error.message);
      return;
    }
    const planText = describeRerunPlan(planned.data, steps);
    const ok = await confirm({
      title: '다시 실행할까요?',
      description: '비용이 드는 작업입니다. 시작 단계와 그 뒤 단계가 전부 다시 돕니다.',
      confirmLabel: '재실행',
      children: (
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
      ),
    });
    if (!ok) return;
    const result = await runBusy(
      '재실행을 요청하는 중…',
      () => reviseRun(runId, request()),
      rerunButton.current,
    );
    if (result === null) return;
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    // 이 실행은 revised로 종결됐다. 새로 대기열에 오른 다음 시도를 연다.
    setInstruction('');
    router.push(runsHref({ tab: 'active', selectedId: result.data.run.id }));
  };

  // 승인: 되돌릴 수 없는 종결이라 확인을 거친다(decisions/layout.md "승인(주요, Dialog 확인)").
  // 승인은 Run 상태 변경일 뿐 공개 발행이 아니다(decisions/publish-gate.md) — 문구도 그렇게.
  const onApproveClick = async () => {
    setMessage(null);
    const ok = await confirm({
      title: '승인할까요?',
      description:
        '이 초안을 검수 완료로 종결합니다. 공개 발행은 일어나지 않고, 발행 준비 화면에서 채널별로 이어집니다.',
      confirmLabel: '승인',
    });
    if (!ok) return;
    const result = await runBusy(
      '승인을 요청하는 중…',
      () => approveRun(runId),
      approveButton.current,
    );
    if (result === null) return;
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    router.refresh();
  };

  return (
    <>
      <ActionBar
        label="수정 지시"
        actions={
          <>
            <Button
              ref={rerunButton}
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => void onRerunClick()}
            >
              재실행
            </Button>
            <Button
              ref={approveButton}
              size="sm"
              disabled={disabled}
              onClick={() => void onApproveClick()}
            >
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
          {/* 오류(빨강)와 진행 문구(회색)는 같은 live 영역 하나를 쓴다 — 오류가 있으면 오류 우선. */}
          <p role="status" className={message !== null ? styles.message : styles.busy}>
            {message ?? busy ?? ''}
          </p>
        </div>
      </ActionBar>
      {confirmElement}
    </>
  );
}
