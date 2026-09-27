// 재승인이 치운 옛 승인본의 보관 자리 — **DATA_DIR 전용**. 재승인에서 글 제목이 바뀌면 직전 승인이 posts/<슬러그>/에 쓴
// 5개 이름을 지우지 않고 여기로 옮긴다(decisions/topic-slug.md 규칙 4, 2026-09-27 사용자 결정) — 사람이 posts에서 손본
// 내용도 되살릴 수 있게. 경로: `<DATA_DIR>/replaced/<슬러그>/<runId>/<파일명>` — runId는 **이번에 재승인한 Run**이다
// (그 승인이 치운 것들이 그 폴더에 모인다). 옛 승인본을 찾을 때는 그 뒤에 승인된 Run의 id로 찾는다.
import { join } from 'node:path';

export interface ReplacedStore {
  /** 이 재승인(runId)이 치운 파일을 둘 폴더(절대경로). 만들지는 않는다 — 옮기는 쪽이 필요할 때 만든다. */
  dirFor(topicSlug: string, runId: string): string;
}

/** 경로 조각 검증 — 구분자·`..`·NUL이 있으면 dataDir 밖을 가리킬 수 있다(ArtifactStore와 같은 규칙). */
const SAFE = /^(?!\.\.?$)[^/\\\0]+$/;

export class LocalFsReplacedStore implements ReplacedStore {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  dirFor(topicSlug: string, runId: string): string {
    for (const [label, value] of [
      ['topicSlug', topicSlug],
      ['runId', runId],
    ] as const)
      if (!SAFE.test(value))
        throw new Error(`${label}이(가) 폴더 이름으로 쓸 수 없는 값이다 — 프로그래머 오류`);
    return join(this.dataDir, 'replaced', topicSlug, runId);
  }
}
