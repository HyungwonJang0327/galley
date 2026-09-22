// snippet 포함 EvidenceBundle의 저장소 — **DATA_DIR 전용**(회사 코드 조각이 blog 폴더로 나가는 경로를 만들지 않는다).
// 경로: `<DATA_DIR>/evidence/<슬러그>/<runId>.json`. dataDir는 주입(.env DATA_DIR — 호출부가 넘긴다, 하드코딩 금지).
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEvidenceBundle, type EvidenceBundle, type ParseBundleResult } from './bundle.ts';

export type EvidenceReadResult =
  | ParseBundleResult
  | { ok: false; code: 'EVIDENCE_BUNDLE_MISSING' }
  | { ok: false; code: 'EVIDENCE_BUNDLE_UNREADABLE' };

export interface EvidenceStore {
  write(bundle: EvidenceBundle): Promise<void>;
  read(topicSlug: string, runId: string): Promise<EvidenceReadResult>;
  /** 단계 반환(discard) 때 쓰다 만 파일을 지운다. 없어도 조용히. */
  remove(topicSlug: string, runId: string): Promise<void>;
}

/** 슬러그·runId에 경로 구분자·`..`가 섞여 dataDir 밖을 가리키지 않게 — 파일 이름으로만 쓴다. */
const safeSegment = (s: string): string => s.replace(/[\\/]|\.\./g, '_');

export class LocalFsEvidenceStore implements EvidenceStore {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  pathFor(topicSlug: string, runId: string): string {
    return join(this.dataDir, 'evidence', safeSegment(topicSlug), `${safeSegment(runId)}.json`);
  }

  /** 임시 파일에 쓴 뒤 rename(원자적) — 타임라인 미리보기가 쓰다 만 파일을 읽지 않게. */
  async write(bundle: EvidenceBundle): Promise<void> {
    const path = this.pathFor(bundle.topicSlug, bundle.runId);
    await mkdir(join(path, '..'), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(bundle, null, 2), 'utf8');
    await rename(temp, path);
  }

  async read(topicSlug: string, runId: string): Promise<EvidenceReadResult> {
    let raw: string;
    try {
      raw = await readFile(this.pathFor(topicSlug, runId), 'utf8');
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      return code === 'ENOENT'
        ? { ok: false, code: 'EVIDENCE_BUNDLE_MISSING' }
        : { ok: false, code: 'EVIDENCE_BUNDLE_UNREADABLE' };
    }
    try {
      return parseEvidenceBundle(JSON.parse(raw));
    } catch {
      return { ok: false, code: 'EVIDENCE_BUNDLE_INVALID' };
    }
  }

  async remove(topicSlug: string, runId: string): Promise<void> {
    await rm(this.pathFor(topicSlug, runId), { force: true });
  }
}
