// 단계 산출물 저장소 — **DATA_DIR 전용**. 워커는 StepResult.artifacts를 저장하지 않으므로(오케스트레이션만) 단계 구현이
// 여기 직접 쓴다(근거 수집의 EvidenceStore와 같은 패턴). 경로: `<DATA_DIR>/artifacts/<슬러그>/<runId>/<파일명>`.
// 뒤 단계(링크드인·Zenn·검증)는 `sources.<단계> ?? runId`로 읽고, posts/<슬러그>/에는 B3a가 승인·완료 시점에 복사한다
// — Run별 이력이 DATA_DIR에 남고 posts에는 최신본만(decisions/run-execution-model.md).
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type ArtifactReadResult =
  | { ok: true; text: string }
  | { ok: false; code: 'ARTIFACT_MISSING' }
  | { ok: false; code: 'ARTIFACT_UNREADABLE' };

export interface ArtifactStore {
  write(topicSlug: string, runId: string, name: string, text: string): Promise<void>;
  read(topicSlug: string, runId: string, name: string): Promise<ArtifactReadResult>;
  /** 단계 반환(discard) 때 그 Run의 산출물 하나를 지운다. 없어도 조용히. */
  remove(topicSlug: string, runId: string, name: string): Promise<void>;
}

/** 경로 조각 검증 — 구분자·`..`·NUL이 있으면 dataDir 밖을 가리킬 수 있어 값으로 거부한다. */
const SAFE = /^(?!\.\.?$)[^/\\\0]+$/;
const assertSafe = (label: string, value: string): void => {
  if (!SAFE.test(value))
    throw new Error(`${label}이(가) 파일 이름으로 쓸 수 없는 값이다 — 프로그래머 오류`);
};

export class LocalFsArtifactStore implements ArtifactStore {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  pathFor(topicSlug: string, runId: string, name: string): string {
    assertSafe('topicSlug', topicSlug);
    assertSafe('runId', runId);
    assertSafe('name', name);
    return join(this.dataDir, 'artifacts', topicSlug, runId, name);
  }

  /** 임시 파일에 쓴 뒤 rename(원자적) — 미리보기가 쓰다 만 파일을 읽지 않게. */
  async write(topicSlug: string, runId: string, name: string, text: string): Promise<void> {
    const path = this.pathFor(topicSlug, runId, name);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, text, 'utf8');
    await rename(temp, path);
  }

  async read(topicSlug: string, runId: string, name: string): Promise<ArtifactReadResult> {
    try {
      return { ok: true, text: await readFile(this.pathFor(topicSlug, runId, name), 'utf8') };
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      return { ok: false, code: code === 'ENOENT' ? 'ARTIFACT_MISSING' : 'ARTIFACT_UNREADABLE' };
    }
  }

  async remove(topicSlug: string, runId: string, name: string): Promise<void> {
    await rm(this.pathFor(topicSlug, runId, name), { force: true });
  }
}
