// 설정 > 모델·비용의 기본 모델(서버 전용). 기본 모델 = 실행 시작 Dialog의 초기값이고, 바꾸는 곳은 이 화면 하나다
// (decisions/model-selection.md 2026-10-04 — TopBar 칩 제거). 실패는 던지지 않고 값으로 돌려준다.
import 'server-only';
import {
  createModelRegistryFromEnv,
  getDefaultModel,
  prisma,
  setDefaultModelId,
} from '@galley/pipeline';
import { toRunModelOption, type RunModelOption } from './run-model-options';

export interface DefaultModelSetting {
  options: RunModelOption[];
  /** 지금의 기본 모델(저장값이 없거나 레지스트리에서 빠졌으면 레지스트리 기본). */
  currentId: string;
}

/** 페이지가 부르므로 던지지 않는다 — 조회가 실패하면(마이그레이션 전 등) 레지스트리 기본을 보인다. */
export async function getDefaultModelSetting(): Promise<DefaultModelSetting> {
  const registry = createModelRegistryFromEnv(process.env);
  let currentId: string;
  try {
    currentId = (await getDefaultModel(prisma, registry)).id;
  } catch {
    currentId = registry.default().id;
  }
  return { options: registry.list().map(toRunModelOption), currentId };
}

export type DefaultModelChangeErrorCode =
  'UNKNOWN_MODEL' | 'MODEL_UNAVAILABLE' | 'SETTING_SAVE_FAILED';

export type DefaultModelChangeResult =
  { ok: true } | { ok: false; error: { code: DefaultModelChangeErrorCode; message: string } };

const MESSAGE: Record<DefaultModelChangeErrorCode, string> = {
  UNKNOWN_MODEL: '등록되지 않은 모델입니다.',
  MODEL_UNAVAILABLE: '이 모델의 API 키가 .env에 없습니다.',
  SETTING_SAVE_FAILED: '기본 모델을 저장하지 못했습니다. 다시 시도해 주세요.',
};

const fail = (code: DefaultModelChangeErrorCode): DefaultModelChangeResult => ({
  ok: false,
  error: { code, message: MESSAGE[code] },
});

/**
 * 기본 모델을 바꾼다. 키 없는 모델은 화면에서 비활성이지만 여기서도 거절한다 — 고르자마자 실행 시작이 막히는
 * 값을 새로 저장하지 않는다(이미 저장된 값의 키가 나중에 빠지는 것은 별개 — 그때는 Dialog가 첫 실행 가능 모델로 연다).
 */
export async function changeDefaultModel(modelId: string): Promise<DefaultModelChangeResult> {
  const registry = createModelRegistryFromEnv(process.env);
  const adapter = registry.get(modelId);
  if (adapter && !adapter.available) return fail('MODEL_UNAVAILABLE');
  try {
    const result = await setDefaultModelId(prisma, registry, modelId);
    return result.ok ? { ok: true } : fail(result.code);
  } catch {
    return fail('SETTING_SAVE_FAILED');
  }
}
