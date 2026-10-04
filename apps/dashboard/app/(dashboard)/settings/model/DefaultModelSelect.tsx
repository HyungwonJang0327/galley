'use client';
// 기본 모델 Select — 고르자마자 저장한다(저장 버튼 없음). 선택지·현재 값은 서버가 props로 넘기고,
// change는 Server Action(테스트에선 가짜). 클라이언트는 pipeline을 모른다(decisions/server-only-boundary.md).
import { useState, useTransition } from 'react';
import { FormField, Select } from 'galley-ui';
import type { DefaultModelChangeResult } from '../../../../lib/default-model-setting';
import type { RunModelOption } from '../../../../lib/run-model-options';
import styles from './DefaultModelSelect.module.css';

export function DefaultModelSelect({
  options,
  currentId,
  change,
}: {
  options: RunModelOption[];
  currentId: string;
  change: (modelId: string) => Promise<DefaultModelChangeResult>;
}) {
  const [value, setValue] = useState(currentId);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = (next: string) => {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      let result: DefaultModelChangeResult;
      try {
        result = await change(next);
      } catch {
        result = {
          ok: false,
          error: {
            code: 'SETTING_SAVE_FAILED',
            message: '저장 요청이 실패했습니다. 다시 시도해 주세요.',
          },
        };
      }
      if (result.ok) {
        setSaved(true);
        return;
      }
      // 저장되지 않았으니 화면도 이전 값으로 — 보이는 값이 곧 저장된 값이어야 한다.
      setValue(previous);
      setError(result.error.message);
    });
  };

  return (
    <div className={styles.field}>
      <FormField
        label="기본 모델"
        description="실행 시작 창이 이 모델을 고른 채로 열립니다. 이미 시작한 실행에는 영향이 없습니다."
      >
        <Select value={value} onValueChange={onChange} items={options} disabled={pending} />
      </FormField>
      {/* live 영역은 비어 있어도 트리에 남긴다 — 문구가 생기기 전에 있어야 낭독이 안정적이다. */}
      <p role="status" className={styles.note}>
        {pending ? '저장하는 중…' : saved ? '저장했습니다.' : null}
      </p>
      {error !== null ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
