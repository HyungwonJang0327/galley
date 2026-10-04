// 앱 설정(Setting 키-값 테이블) 읽기·쓰기. 키는 여기 한 곳에서만 정한다.
// 기본 모델 = 실행 Dialog 초기값 + TopBar 칩 표시값(decisions/model-selection.md).
import type { PrismaClient } from '@prisma/client';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import type { ModelRegistry } from '../model/ModelRegistry.ts';

export const SETTING_KEY = {
  defaultModelId: 'defaultModelId',
} as const;

/**
 * 저장된 기본 모델. 저장값이 없거나 **레지스트리에 없는 id**(카탈로그에서 빠진 모델, 개발에서만 보이는 `mock`)면
 * 레지스트리 기본으로 폴백한다 — 설정 하나가 낡았다고 실행 시작·셸 표시가 막히지 않게.
 * 키 없는 모델(`available:false`)은 폴백하지 않는다 — 사람이 고른 값이고, 실행 시작이 MODEL_UNAVAILABLE로 알린다.
 */
export async function getDefaultModel(
  prisma: PrismaClient,
  registry: ModelRegistry,
): Promise<ModelAdapter> {
  const row = await prisma.setting.findUnique({
    where: { key: SETTING_KEY.defaultModelId },
    select: { value: true },
  });
  return (row && registry.get(row.value)) || registry.default();
}

export type SetDefaultModelResult = { ok: true } | { ok: false; code: 'UNKNOWN_MODEL' };

/** 기본 모델을 바꾼다. 실행 중인 Run에는 영향이 없다 — 모델은 Run에 저장된 속성이다. */
export async function setDefaultModelId(
  prisma: PrismaClient,
  registry: ModelRegistry,
  modelId: string,
): Promise<SetDefaultModelResult> {
  if (!registry.get(modelId)) return { ok: false, code: 'UNKNOWN_MODEL' };
  await prisma.setting.upsert({
    where: { key: SETTING_KEY.defaultModelId },
    create: { key: SETTING_KEY.defaultModelId, value: modelId },
    update: { value: modelId },
  });
  return { ok: true };
}
