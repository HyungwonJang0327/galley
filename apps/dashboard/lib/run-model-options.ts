// 실행 시작 Dialog의 모델 선택지(서버 전용). 레지스트리를 읽어 직렬화 가능한 값만 클라이언트로 넘긴다
// — 클라이언트는 pipeline을 모른다(decisions/server-only-boundary.md, decisions/model-selection.md "화면").
import 'server-only';
import {
  createModelRegistryFromEnv,
  getDefaultModel,
  prisma,
  type ModelAdapter,
  type ModelProvider,
} from '@galley/pipeline';

export interface RunModelOption {
  /** 어댑터 id(`provider:model`) — 그대로 Run.modelId가 된다. */
  value: string;
  label: string;
  /** 보조 텍스트: provider 표시 이름. */
  description: string;
  /** 우측 회색: 입력/출력 백만 토큰당 USD. */
  meta: string;
  disabled: boolean;
  disabledReason: string | undefined;
}

export interface RunModelChoices {
  options: RunModelOption[];
  /** Dialog 초기값. 설정의 기본 모델이 실행 가능하면 그것, 아니면 첫 실행 가능 모델. 하나도 없으면 undefined. */
  initialId: string | undefined;
}

/** provider 표시 이름과 키 이름. 새 provider가 생기면 타입이 여기를 고치게 한다. */
const PROVIDER: Record<ModelProvider, { name: string; keyEnv: string | undefined }> = {
  anthropic: { name: 'Anthropic', keyEnv: 'ANTHROPIC_API_KEY' },
  openai: { name: 'OpenAI', keyEnv: 'OPENAI_API_KEY' },
  mock: { name: 'Mock (개발용)', keyEnv: undefined },
};

/** `$5 / $25` — 정수면 소수점 없이, 아니면 있는 그대로(1.25·0.25). */
function formatPricing({ pricing }: ModelAdapter): string {
  return `$${pricing.inputPerMTok} / $${pricing.outputPerMTok}`;
}

function toOption(adapter: ModelAdapter): RunModelOption {
  const provider = PROVIDER[adapter.provider];
  return {
    value: adapter.id,
    label: adapter.label,
    description: provider.name,
    meta: formatPricing(adapter),
    disabled: !adapter.available,
    disabledReason: adapter.available
      ? undefined
      : `API 키 없음 (.env ${provider.keyEnv ?? '설정'})`,
  };
}

/**
 * 선택지와 초기값. 페이지가 부르므로 던지지 않는다 — 기본 모델 조회가 실패하면 레지스트리 기본으로 둔다.
 * 기본 모델에 키가 없으면 초기값은 첫 실행 가능 모델이다(비활성 항목이 선택된 채 열리지 않게).
 */
export async function getRunModelChoices(): Promise<RunModelChoices> {
  const registry = createModelRegistryFromEnv(process.env);
  let preferred: ModelAdapter;
  try {
    preferred = await getDefaultModel(prisma, registry);
  } catch {
    preferred = registry.default();
  }
  const adapters = registry.list();
  const initial = preferred.available ? preferred : adapters.find((a) => a.available);
  return { options: adapters.map(toOption), initialId: initial?.id };
}
