'use server';
// 설정 > 모델·비용의 기본 모델 변경. 성공하면 레이아웃 전체를 다시 그린다 — 큐·홈의 실행 시작 Dialog 초기값이
// 같은 설정을 읽는다(decisions/model-selection.md).
import { revalidatePath } from 'next/cache';
import {
  changeDefaultModel,
  type DefaultModelChangeResult,
} from '../../../../lib/default-model-setting';

export async function changeDefaultModelAction(modelId: string): Promise<DefaultModelChangeResult> {
  const result = await changeDefaultModel(modelId);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
