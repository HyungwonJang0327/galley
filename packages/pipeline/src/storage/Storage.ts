// blog 워크스페이스 파일 I/O 추상화(서버 전용). 로컬 fs 구현은 LocalFsStorage.
// 로드/저장을 이 인터페이스 뒤에 두어 나중에 다른 백엔드로 교체 가능하게 한다.
export interface Storage {
  /** 주제_큐.md 원문을 읽는다. */
  readQueueFile(): Promise<string>;
  /** 주제_큐.md를 재작성한다(섹션 구조 보존은 serializeQueue 담당). */
  writeQueueFile(content: string): Promise<void>;
}
