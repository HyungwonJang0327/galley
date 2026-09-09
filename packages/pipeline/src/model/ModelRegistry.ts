import type { ModelAdapter } from './ModelAdapter';
import { createMockAdapter } from './MockAdapter';

/**
 * 어댑터 id 규칙: `provider:model` (예 `anthropic:claude-opus-5`). Mock만 `mock`.
 * Run.modelId·RunStep.modelId에 이 문자열이 그대로 저장된다 — decisions/model-selection.md.
 */
export const DEFAULT_MODEL_ID = 'anthropic:claude-opus-5';
export const INDEXING_DEFAULT_MODEL_ID = 'anthropic:claude-haiku-4-5-20251001';

export interface ModelRegistry {
  /** 등록 순서 그대로. API 키 없는 어댑터도 포함(`available:false`). */
  list(): readonly ModelAdapter[];
  get(id: string): ModelAdapter | undefined;
  /** 실행 Dialog 초기값 폴백·Settings.defaultModelId 부재 시 기본. */
  default(): ModelAdapter;
  /** 리포 인덱싱 기본(Haiku 4.5) — decisions/evidence-collection.md. */
  indexingDefault(): ModelAdapter;
}

export interface ModelRegistryOptions {
  adapters: readonly ModelAdapter[];
  defaultId: string;
  indexingDefaultId: string;
}

export function createModelRegistry(options: ModelRegistryOptions): ModelRegistry {
  const byId = new Map<string, ModelAdapter>();
  for (const adapter of options.adapters) {
    if (byId.has(adapter.id)) {
      throw new Error(`모델 어댑터 id가 중복됩니다: ${adapter.id}`);
    }
    byId.set(adapter.id, adapter);
  }

  const resolve = (id: string, role: string): ModelAdapter => {
    const adapter = byId.get(id);
    if (!adapter) {
      throw new Error(`${role} 모델 ${id}이(가) 레지스트리에 없습니다`);
    }
    return adapter;
  };

  return {
    list: () => options.adapters,
    get: (id) => byId.get(id),
    default: () => resolve(options.defaultId, '기본'),
    indexingDefault: () => resolve(options.indexingDefaultId, '인덱싱 기본'),
  };
}

/** `.env`에서 읽는 값만. `process.env` 전체를 넘겨도 된다. */
export interface ModelEnv {
  NODE_ENV?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

/**
 * 프로덕션 레지스트리. 어댑터 추가 = 파일 하나 + 여기 등록 한 줄.
 * Mock은 `NODE_ENV=development`에서만 노출(테스트·데모용).
 */
export function createModelRegistryFromEnv(env: ModelEnv): ModelRegistry {
  const adapters: ModelAdapter[] = [];
  if (env.NODE_ENV === 'development') {
    adapters.push(createMockAdapter());
  }
  return createModelRegistry({
    adapters,
    defaultId: DEFAULT_MODEL_ID,
    indexingDefaultId: INDEXING_DEFAULT_MODEL_ID,
  });
}
