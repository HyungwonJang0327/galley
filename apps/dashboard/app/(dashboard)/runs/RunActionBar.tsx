'use client';
// 실행 상세 하단 바: 단계 Select + 모델 Select(초기값 = 이 실행의 모델, BM8) + 수정 지시 Textarea + 재실행(확인) / 승인(확인).
// 다른 모델을 고르면 revise 요청에만 modelId를 실어 새 시도의 다시 도는 단계가 그 모델로 돈다(이전 결과를 잇는 단계는
// 원래 모델 그대로 — 타임라인이 Run 모델과 다른 줄에만 label을 붙인다). 같은 모델이면 보내지 않는다(서버가 잇는다).
// 판정("승인 대기인가")·단계 라벨은 서버가 props로 넘긴다 — 클라이언트는 pipeline·run-labels를
// import하지 않는다(decisions/server-only-boundary.md). 명령은 Route Handler(B2b)로 보낸다.
// 확인 Dialog 둘은 useConfirm 하나로(decisions/confirm-dialog-usage.md): 확인을 누르면 즉시 닫히고,
// API가 도는 동안은 바의 컨트롤 비활성 + role=status의 "요청 중" 문구가 진행 표시다.
// 승인 성공 안내(posts 폴더·옮긴 파일·남은 파일)는 응답 기반이라 이 화면을 떠나면 사라진다.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ActionBar, Button, InlineAlert, Select, Textarea, useConfirm } from 'galley-ui';
import { approveRun, planRerun, reviseRun } from '../../../lib/run-api-client';
import {
  describeApproval,
  describeRerunPlan,
  validateInstruction,
  type ApprovalNotice,
  type StepOption,
} from '../../../lib/run-action-bar';
import type { RunModelOption } from '../../../lib/run-model-options';
import { runsHref } from '../../../lib/run-view';
import styles from './RunActionBar.module.css';

export interface RunActionBarProps {
  runId: string;
  /** 재실행(수정 지시)을 내릴 수 있는가 — 승인 대기·실패(서버 canRevise). 아니면 컨트롤 전부 비활성. */
  enabled: boolean;
  /** 승인할 수 있는가 — 승인 대기만. 실패에서는 재실행만 산다(decisions/failed-run-rerun.md). */
  approveEnabled: boolean;
  /**
   * 실패한 실행이면 실패한 단계 이름(서버 firstUnfinishedStep). 있으면 시작 단계 기본값이 이것이고 그 뒤 단계는 고를 수
   * 없으며("단계 자동" 없음), 수정 지시는 비워도 된다. 승인 대기면 undefined.
   */
  failedStep?: string;
  /** 파이프라인 순서의 (이름, 라벨). Select 항목과 확인 Dialog 문구에 쓴다. */
  steps: readonly StepOption[];
  maxLength: number;
  /** 모델 Select 항목(서버 lib/run-model-options가 만든다 — 실행 시작 Dialog와 같은 목록). */
  modelOptions: readonly RunModelOption[];
  /** 이 실행의 모델 id — 모델 Select 초기값. 실행이 없으면 undefined. */
  runModelId: string | undefined;
}

const AUTO_STEP = '__auto__';

export function RunActionBar({
  runId,
  enabled,
  approveEnabled,
  failedStep,
  steps,
  maxLength,
  modelOptions,
  runModelId,
}: RunActionBarProps) {
  const router = useRouter();
  const { confirm, element: confirmElement } = useConfirm();
  const [instruction, setInstruction] = useState('');
  const failedMode = failedStep !== undefined;
  const [startStep, setStartStep] = useState<string>(failedStep ?? AUTO_STEP);
  const [modelId, setModelId] = useState<string | null>(runModelId ?? null);
  /** 오류·안내 한 줄. */
  const [message, setMessage] = useState<string | null>(null);
  /** API가 도는 동안의 진행 문구. null이면 유휴. */
  const [busy, setBusy] = useState<string | null>(null);
  /** 승인 성공 안내. refresh 뒤에도 key(runId)가 같아 이 바가 유지되므로 상태로 남는다. */
  const [approved, setApproved] = useState<ApprovalNotice | null>(null);
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
  /** 원래 모델과 다를 때만 실어 보낸다 — 같으면 서버가 직전 실행의 모델을 잇는다(기본 경로 불변). */
  const modelChanged = modelId !== null && modelId !== runModelId;
  const reviseRequest = () => ({
    ...request(),
    ...(modelChanged ? { modelId: modelId } : {}),
  });

  /** 모델 Select 항목 — 이 실행의 모델이 목록에 없으면(레지스트리에서 빠진 옛 모델) 그 id를 비활성 항목으로 끼운다. */
  const modelItems =
    runModelId === undefined || modelOptions.some((option) => option.value === runModelId)
      ? modelOptions
      : [
          {
            value: runModelId,
            label: runModelId,
            disabled: true,
            disabledReason: '등록되지 않은 모델입니다. 다른 모델을 고르세요.',
          },
          ...modelOptions,
        ];
  const selectedModel = modelItems.find((option) => option.value === modelId);

  // 실패 실행: "단계 자동" 없이 실패한 단계가 기본값, 그 뒤는 이어받을 성공 결과가 없어 비활성(서버도 같은 규칙으로 거절).
  const failedIndex = failedMode ? steps.findIndex((s) => s.name === failedStep) : -1;
  const stepItems = failedMode
    ? steps.map((s, index) => ({
        value: s.name,
        label: s.label,
        ...(failedIndex !== -1 && index > failedIndex
          ? { disabled: true, disabledReason: '실패한 단계 뒤는 이어받을 결과가 없습니다.' }
          : {}),
      }))
    : [
        {
          value: AUTO_STEP,
          label: '단계 자동',
          description: '지시에 근거·커밋·코드가 있으면 근거 수집부터',
        },
        ...steps.map((s) => ({ value: s.name, label: s.label })),
      ];

  // 재실행: 먼저 계획(다시 도는 단계)을 받아 확인 Dialog로 보여주고, 확인해야 실제로 보낸다.
  const onRerunClick = async () => {
    const invalid = validateInstruction(instruction, maxLength, { optional: failedMode });
    if (invalid !== null) {
      setMessage(invalid);
      return;
    }
    // 모델은 계획과 무관하지만 왕복 전에 거른다 — 비활성(키 없음)·미등록 모델로는 서버가 어차피 거절한다.
    if (modelId === null || selectedModel === undefined) {
      setMessage('다시 돌릴 모델을 고르세요.');
      return;
    }
    if (selectedModel.disabled) {
      setMessage(selectedModel.disabledReason ?? '이 모델은 지금 쓸 수 없습니다.');
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
      cancelLabel: '취소',
      closeLabel: '닫기',
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
          {modelChanged ? (
            <>
              <dt>모델</dt>
              <dd>{selectedModel.label}</dd>
            </>
          ) : null}
        </dl>
      ),
    });
    if (!ok) return;
    const result = await runBusy(
      '재실행을 요청하는 중…',
      () => reviseRun(runId, reviseRequest()),
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
  // 승인은 posts/<슬러그>/ 산출물 쓰기와 큐 완료 이동까지 하지만(B3a) 공개 발행은 아니다(decisions/publish-gate.md) — 문구도 그렇게.
  const onApproveClick = async () => {
    setMessage(null);
    const ok = await confirm({
      title: '승인할까요?',
      description:
        '이 초안을 검수 완료로 종결하고, 산출물을 blog 폴더의 posts/<슬러그>/에 쓰고 주제를 큐 파일의 완료 섹션으로 옮깁니다. 공개 발행은 일어나지 않습니다.',
      confirmLabel: '승인',
      cancelLabel: '취소',
      closeLabel: '닫기',
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
    setApproved(describeApproval(result.data));
    router.refresh();
  };

  return (
    <>
      {approved !== null ? (
        <InlineAlert className={styles.notice} tone={approved.tone} title={approved.title}>
          {approved.lines.map((line) => (
            <p key={line} className={styles.noticeLine}>
              {line}
            </p>
          ))}
        </InlineAlert>
      ) : null}
      <ActionBar
        aria-label="수정 지시"
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
              disabled={disabled || !approveEnabled}
              title={
                enabled && !approveEnabled ? '승인 대기 상태에서만 승인할 수 있습니다.' : undefined
              }
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
            <div className={styles.model}>
              <Select
                value={modelId}
                onValueChange={(value) => {
                  setModelId(value);
                  setMessage(null);
                }}
                items={modelItems}
                placeholder="모델"
                disabled={disabled}
                aria-label="모델"
              />
            </div>
            <Textarea
              className={styles.instruction}
              aria-label="수정 지시 입력"
              placeholder={
                !enabled
                  ? '승인 대기(지시·승인) 또는 실패(재실행) 상태에서만 쓸 수 있습니다.'
                  : failedMode
                    ? '수정 지시(선택). 비우면 실패한 단계부터 그대로 다시 돌립니다.'
                    : '수정 지시를 입력하세요.'
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
