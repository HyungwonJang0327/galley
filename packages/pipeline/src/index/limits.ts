// 인덱싱 모델 입력 상한(A 보수) — decisions/evidence-collection.md "리포 인덱싱". 한 곳.
// 초과분은 파일명·커밋 메시지만으로 요약하고 RepoAnalysis.summaryOnly=true. 부족하면 여기서 올린다.
export const INDEX_LIMITS = {
  /** 파일 1개 최대 바이트. 넘는 파일은 이름만 넘긴다. */
  fileBytes: 16 * 1024,
  /** 디렉터리(area)당 본문을 넘기는 파일 수. */
  filesPerArea: 20,
  /** 디렉터리(area)당 본문 합계 바이트. */
  bytesPerArea: 160 * 1024,
  /** 커밋 묶음(change)당 상세(본문·파일 목록)를 넘기는 커밋 수. 넘는 커밋은 제목만(summaryOnly). */
  commitsPerBatch: 30,
  /** 커밋 본문(body) 1개 최대 글자 수. 넘는 부분은 자른다. */
  commitBodyChars: 400,
  /** 커밋 1개당 프롬프트에 나열하는 파일 수. 넘는 파일은 "외 n개". 포인터 후보는 전부 남긴다. */
  filesPerCommit: 40,
  /** 한 번의 인덱싱에서 읽는 커밋 수 상한(최신부터). 큰 리포의 비용 폭주 방지. */
  maxCommits: 2000,
} as const;

/** 테스트·CLI가 상한을 바꿔 넘길 수 있는 형태(값은 숫자). */
export type IndexLimits = { readonly [K in keyof typeof INDEX_LIMITS]: number };

/** 모델 출력 저장 경계 — 프롬프트가 요구하는 크기(키워드 5~12개)를 넘어도 이 이상은 저장하지 않는다. */
export const OUTPUT_LIMITS = {
  titleChars: 200,
  keywords: 20,
  keywordChars: 40,
} as const;

/**
 * 인덱스에서 빼는 것. 코드가 아닌 것(의존성·산출물·바이너리·락파일)은 모델에 보낼 이유가 없고,
 * **비밀값 파일**(.env·키·인증서·자격 증명)은 redact 설정과 무관하게 절대 모델로 보내지 않는다.
 */
export const INDEX_IGNORE = {
  /** 디렉터리 조각(파일명에는 적용하지 않는다 — `build`라는 파일은 남긴다). */
  dirs: [
    'node_modules',
    'dist',
    'build',
    'out',
    '.next',
    'coverage',
    '.git',
    'vendor',
    '__pycache__',
    '.turbo',
    '.cache',
  ],
  /** 정확한 파일명. */
  files: [
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lockb',
    '.DS_Store',
    'credentials.json',
    'service-account.json',
    'id_rsa',
    'id_ed25519',
    'id_ecdsa',
    '.npmrc',
    '.netrc',
  ],
  /** 파일명 접두(`.env`, `.env.local`, `.env.production` …). */
  filePrefixes: ['.env'],
  /** 확장자(소문자 비교). */
  extensions: [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.ico',
    '.pdf',
    '.zip',
    '.gz',
    '.tar',
    '.7z',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.eot',
    '.mp4',
    '.mp3',
    '.mov',
    '.db',
    '.sqlite',
    '.map',
    '.lock',
    '.pem',
    '.key',
    '.p12',
    '.jks',
    '.pfx',
    '.crt',
    '.cer',
    '.der',
    '.wasm',
    '.bin',
    '.jar',
    '.class',
    '.pyc',
    '.so',
    '.dylib',
    '.exe',
    '.dll',
    '.o',
    '.a',
  ],
} as const;
