// TopBar 칩에 보일 기본 모델 label(서버 전용). 모델 id·label은 ModelRegistry만 안다 — decisions/model-selection.md.
import 'server-only';
import { createModelRegistryFromEnv, getDefaultModel, prisma } from '@galley/pipeline';

/**
 * 설정의 기본 모델 label. 셸이 매 요청 부르므로 던지지 않는다 — DB가 아직 없거나(마이그레이션 전)
 * 조회가 실패하면 레지스트리 기본의 label로 둔다(실행 시작도 설정이 없으면 같은 모델을 쓴다).
 */
export async function getDefaultModelLabel(): Promise<string> {
  const registry = createModelRegistryFromEnv(process.env);
  try {
    return (await getDefaultModel(prisma, registry)).label;
  } catch {
    return registry.default().label;
  }
}
