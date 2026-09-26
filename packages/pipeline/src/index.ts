// @galley/pipeline — 단계 실행·상태 머신·모델 어댑터·Storage·Zenn push (서버 전용)
// 골격만. 구현은 Phase 1-B (핵심 모듈 a·b는 사용자 직접 작성 — decisions/core-modules.md).
export { prisma } from './db.ts';
export { parseQueue, serializeQueue } from './queue/queueFile.ts';
export type {
  QueueStatus,
  QueueTopic,
  ParsedQueue,
  SeriesTag,
  SeriesDef,
} from './queue/queueFile.ts';
export {
  parsedQueueToRows,
  importQueueFromFile,
  disposeMissing,
  HOLD_REASON_REMOVED,
} from './queue/importQueue.ts';
export type { QueueItemRow, MissingDisposition } from './queue/importQueue.ts';
export { normalizeTopicTitle, stripTopicHints, trailingUrl } from './queue/normalizeTitle.ts';
export { getSeriesContext, buildSeriesContext, seriesNameJa } from './queue/seriesContext.ts';
export type {
  SeriesContext,
  SeriesEpisode,
  SeriesTopicRow,
  SeriesContextFailure,
  SeriesContextResult,
} from './queue/seriesContext.ts';
export {
  parseTopicHints,
  resolveTopicHints,
  isPeriodHint,
  normalizePeriodHint,
} from './queue/topicHints.ts';
export type { RawTopicHints, TopicHints, RepoNameSource } from './queue/topicHints.ts';
export {
  listMissingTopics,
  restoreMissingTopicToHold,
  acknowledgeMissingTopic,
} from './queue/missingTopics.ts';
export type {
  MissingTopic,
  MissingTopicFailure,
  MissingTopicResult,
} from './queue/missingTopics.ts';
export { moveTopic, moveQueueTopic, MOVABLE_STATUSES } from './queue/moveQueue.ts';
export { completeTopic, completedTitle } from './queue/completeQueue.ts';
export type { CompleteTopicInput, CompleteTopicFailure } from './queue/completeQueue.ts';
export { reorderTopic, reorderQueueTopic } from './queue/reorderQueue.ts';
export type {
  ReorderQueueTopicInput,
  ReorderQueueFailure,
  ReorderQueueResult,
} from './queue/reorderQueue.ts';
export type {
  MovableStatus,
  MoveQueueTopicInput,
  MoveQueueFailure,
  MoveQueueResult,
} from './queue/moveQueue.ts';
export { topicSlug } from './queue/topicSlug.ts';
export {
  countRunsByStatus,
  countPendingApproval,
  listRecentRuns,
  findLatestRunForTopic,
  listRuns,
  getRunWithSteps,
} from './run/runQueries.ts';
export type {
  RunSummary,
  RunListFilter,
  RunListItem,
  RunListStep,
  RunDetail,
  RunStepDetail,
} from './run/runQueries.ts';
export {
  STEP_ORDER,
  RUN_STATUS,
  STEP_STATUS,
  STEP_ORIGIN,
  isStepName,
  isRunStatus,
  isStepStatus,
  nextAction,
  planRerun,
  applyCommand,
  INSTRUCTION_MAX_LENGTH,
} from './run/stateMachine.ts';
export type {
  StepName,
  RunStatus,
  StepStatus,
  StepOrigin,
  StepState,
  NextAction,
  RerunInput,
  RerunPlan,
  RunCommand,
  CommandFailure,
  CommandResult,
} from './run/stateMachine.ts';
export { resolveCarriedSources } from './run/carriedSources.ts';
export { StepFailure, toStepFailure } from './steps/StepRunner.ts';
export type { StepRunner, StepContext, StepResult } from './steps/StepRunner.ts';
export { createMockStepRunner } from './steps/MockStepRunner.ts';
export type { MockStepRunnerOptions } from './steps/MockStepRunner.ts';
export {
  toSeriesStepInfo,
  renderSeriesPublishSection,
  VELOG_LINK_PLACEHOLDER,
} from './steps/series.ts';
export type { SeriesStepInfo } from './steps/series.ts';
export { createSeriesSource, readTopicSeriesInfo } from './steps/seriesSource.ts';
export { seriesChecklist } from './steps/publishChecklist.ts';
export type { PublishChecklistId, PublishChecklistItem } from './steps/publishChecklist.ts';
export {
  runOnce,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  STEP_TIMEOUT_MS,
  MAX_STEP_ATTEMPTS,
  RETRY_DELAYS_MS,
  retryDelayMs,
} from './worker/runOnce.ts';
export { createPrismaWorkerRepo } from './worker/PrismaWorkerRepo.ts';
export { resolveDataDir } from './worker/resolveDataDir.ts';
export type { DataDirResult } from './worker/resolveDataDir.ts';
export type { TickResult, TickOutcome } from './worker/runOnce.ts';
export type {
  WorkerDeps,
  WorkerRepo,
  ClaimedRun,
  StepOutcome,
  Clock,
  Ids,
  Timers,
  Logger,
} from './worker/WorkerDeps.ts';
export { startRun } from './run/startRun.ts';
export type { StartRunInput, StartRunFailure, StartRunResult } from './run/startRun.ts';
export { startRerun } from './run/startRerun.ts';
export { approveRun, reviseRun, previewRerun } from './run/runCommands.ts';
export type {
  ApproveRunFailure,
  ApproveRunResult,
  ReviseRunInput,
  ReviseRunFailure,
  ReviseRunResult,
  PreviewRerunInput,
  PreviewRerunFailure,
  PreviewRerunResult,
  RerunPreview,
} from './run/runCommands.ts';
export type { StartRerunInput, StartRerunFailure, StartRerunResult } from './run/startRerun.ts';
export { loadQueueSections } from './queue/loadQueue.ts';
export { countTopicsByStatus } from './queue/queueCounts.ts';
export type { QueueEntry, QueueEntrySeries, QueueSections } from './queue/loadQueue.ts';
export { loadQueueSeries, summarizeQueueSeries } from './queue/queueSeries.ts';
export type { QueueSeriesSummary } from './queue/queueSeries.ts';
export type { Storage } from './storage/Storage.ts';
export { LocalFsStorage } from './storage/LocalFsStorage.ts';
export type {
  ModelAdapter,
  ModelProvider,
  ModelPricing,
  ModelUsage,
  GenerateInput,
  GenerateResult,
} from './model/ModelAdapter.ts';
export { createMockAdapter } from './model/MockAdapter.ts';
export type { MockAdapterOptions } from './model/MockAdapter.ts';
export {
  createModelRegistry,
  createModelRegistryFromEnv,
  DEFAULT_MODEL_ID,
  INDEXING_DEFAULT_MODEL_ID,
  ADAPTER_MAX_RETRIES,
} from './model/ModelRegistry.ts';
export type { ModelRegistry, ModelRegistryOptions, ModelEnv } from './model/ModelRegistry.ts';
export {
  REPO_STATUS,
  ANALYSIS_KIND,
  LINK_SOURCE,
  INDEX_JOB_KIND,
  INDEX_JOB_STATUS,
  parseStringArray,
  serializeStringArray,
  validatePointers,
  parsePointers,
  serializePointers,
} from './index/schema.ts';
export type {
  RepoStatus,
  AnalysisKind,
  LinkSource,
  IndexJobKind,
  IndexJobStatus,
  EvidencePointer,
  PointersFailure,
  PointersResult,
} from './index/schema.ts';
export {
  parseRedactConfig,
  loadRedactConfig,
  defaultRedactConfigPath,
  redact,
} from './evidence/redact.ts';
export type {
  RedactRule,
  RedactConfig,
  RedactConfigFailure,
  RedactConfigResult,
  RedactHit,
  RedactResult,
} from './evidence/redact.ts';
export { EVIDENCE_LIMITS } from './evidence/limits.ts';
export type { EvidenceLimits } from './evidence/limits.ts';
export { stripSnippets, parseEvidenceBundle } from './evidence/bundle.ts';
export type {
  EvidenceBundle,
  EvidenceItem,
  EvidencePointers,
  EvidencePointerItem,
  EvidenceSource,
  ParseBundleResult,
} from './evidence/bundle.ts';
export { LocalFsEvidenceStore } from './evidence/EvidenceStore.ts';
export type { EvidenceStore, EvidenceReadResult } from './evidence/EvidenceStore.ts';
export { readPointerSnippet } from './evidence/readSnippet.ts';
export type { SnippetRead, ReadSnippetResult } from './evidence/readSnippet.ts';
export { createEvidenceStepRunner, EVIDENCE_ARTIFACT } from './steps/evidenceStep.ts';
export type { EvidenceStepDeps } from './steps/evidenceStep.ts';
export { LocalFsArtifactStore } from './artifacts/ArtifactStore.ts';
export type { ArtifactStore, ArtifactReadResult } from './artifacts/ArtifactStore.ts';
export { WRITING_LIMITS } from './steps/limits.ts';
export type { WritingLimits } from './steps/limits.ts';
export { createVelogStepRunner, buildVelogPrompt, VELOG_ARTIFACT } from './steps/velogStep.ts';
export {
  abortable,
  classifyModelError,
  fenceFor,
  renderEvidenceItems,
  tonePromptFailure,
  unwrapFence,
} from './steps/writing.ts';
export type { VelogStepDeps, VelogInput } from './steps/velogStep.ts';
export {
  createLinkedinStepRunner,
  buildLinkedinPrompt,
  LINKEDIN_ARTIFACT,
} from './steps/linkedinStep.ts';
export type { LinkedinStepDeps, LinkedinInput } from './steps/linkedinStep.ts';
export {
  createZennStepRunner,
  buildZennPrompt,
  ZENN_ARTIFACT,
  ZENN_FRONTMATTER,
} from './steps/zennStep.ts';
export type { ZennStepDeps, ZennInput } from './steps/zennStep.ts';
export { createStepRunner, routeStepRunner } from './steps/createStepRunner.ts';
export {
  createPublishInfoStepRunner,
  parseZennFrontmatter,
  PUBLISH_ARTIFACT,
} from './steps/publishInfoStep.ts';
export {
  renderPublishInfo,
  renderEvidenceSection,
  parsePublishTitle,
  PUBLISH_INTRO_MAX_CHARS,
} from './steps/publishInfo.ts';
export type { PublishInfoInput } from './steps/publishInfo.ts';
export { postFileNames, toFileStem } from './publish/postFiles.ts';
export type { PostFileNames } from './publish/postFiles.ts';
export type { StepRunnerDeps } from './steps/createStepRunner.ts';
export {
  createVerifyStepRunner,
  buildJudgePrompt,
  VERIFICATION_ARTIFACT,
} from './steps/verifyStep.ts';
export type { VerifyStepDeps } from './steps/verifyStep.ts';
export { VERIFY_LIMITS } from './evidence/verifyLimits.ts';
export type { VerifyLimits } from './evidence/verifyLimits.ts';
export type {
  VerificationReport,
  VerificationClaim,
  ClaimKind,
  ClaimStatus,
  ClaimReason,
  EvidenceRef,
  VerbatimMatch,
} from './evidence/verification.ts';
export {
  loadTonePrompt,
  hashPromptText,
  resolveTonePromptsDir,
  tonePromptPath,
  TONE_PROMPT_STEPS,
  isTonePromptStep,
} from './prompts/tonePrompts.ts';
export type {
  TonePrompt,
  TonePromptStep,
  TonePromptFailure,
  TonePromptResult,
  TonePromptsDirResult,
} from './prompts/tonePrompts.ts';
export { INDEX_LIMITS, INDEX_IGNORE } from './index/limits.ts';
export type { IndexLimits } from './index/limits.ts';
export { planAreas, describeTree, isIgnoredPath, areaKeyForPath } from './index/tree.ts';
export type { TreeFile, AreaFile, AreaPlan, TreeSummary } from './index/tree.ts';
export {
  gitHead,
  gitListFiles,
  gitShowFile,
  gitLog,
  gitDiffPaths,
  gitCommitMeta,
} from './index/gitRead.ts';
export type {
  GitFailure,
  GitResult,
  GitCommit,
  GitCommitFile,
  GitFileStatus,
  GitLogOptions,
  GitLogResult,
  GitCommitMeta,
} from './index/gitRead.ts';
export { planChangeBatches, pointerCandidates, periodOf, primaryDir } from './index/changes.ts';
export type { ChangeBatch, ChangeCommit, ChangePlan } from './index/changes.ts';
export type { AnalysisFailure } from './index/analysisText.ts';
export { planExecution } from './index/batchControl.ts';
export type { ExecutionOptions, ExecutionPlan } from './index/batchControl.ts';
export { analyzeChange } from './index/changeAnalysis.ts';
export type {
  ChangeAnalysisInput,
  ChangeAnalysisDraft,
  ChangeAnalysisResult,
} from './index/changeAnalysis.ts';
export { analyzeOverview, selectOverviewSources, OVERVIEW_KEY } from './index/overviewAnalysis.ts';
export type {
  OverviewSource,
  OverviewAnalysisInput,
  OverviewAnalysisDraft,
  OverviewAnalysisResult,
} from './index/overviewAnalysis.ts';
export { analyzeArea } from './index/areaAnalysis.ts';
export type {
  AreaAnalysisInput,
  AreaAnalysisDraft,
  AreaAnalysisFailure,
  AreaAnalysisResult,
  AreaFileContent,
} from './index/areaAnalysis.ts';
export { upsertRepoAnalysis, pruneAnalyses } from './index/repoAnalysisRepo.ts';
export type { AnalysisDraft, UpsertAnalysisResult } from './index/repoAnalysisRepo.ts';
export { indexRepoAreas } from './index/indexRepoAreas.ts';
export type {
  IndexAreasInput,
  IndexAreasReport,
  IndexAreasFailure,
  IndexAreasResult,
  AreaProgress,
} from './index/indexRepoAreas.ts';
export { indexRepoChanges } from './index/indexRepoChanges.ts';
export type {
  IndexChangesInput,
  IndexChangesReport,
  IndexChangesFailure,
  IndexChangesResult,
  ChangeProgress,
} from './index/indexRepoChanges.ts';
export { indexRepoOverview } from './index/indexRepoOverview.ts';
export { runIndexTick, parseCursor, formatCursor } from './index/runIndexTick.ts';
export type { IndexTickDeps, IndexTickOutcome, IndexTickResult } from './index/runIndexTick.ts';
export {
  claimIndexJob,
  reclaimStaleIndexJobs,
  beatIndexJob,
  recordIndexProgress,
  releaseIndexJob,
  finishIndexJob,
  markRepoIndexing,
} from './index/indexJobRepo.ts';
export type { ClaimedIndexJob, IndexProgress, IndexJobEnd } from './index/indexJobRepo.ts';
export { enqueueIndexJob } from './index/enqueueIndexJob.ts';
export { AUTO_LINK_LIMITS } from './link/limits.ts';
export type { AutoLinkLimits } from './link/limits.ts';
export { matchTopic, usefulKeywords, expandPeriod } from './link/matchTopic.ts';
export type { TopicHintsInput, AnalysisCandidate, MatchedAnalysis } from './link/matchTopic.ts';
export {
  linkTopicAuto,
  loadAnalysisCandidates,
  findStaleTopics,
  runAutoLinkTick,
} from './link/autoLink.ts';
export type { AutoLinkResult, AutoLinkTickDeps, AutoLinkTickResult } from './link/autoLink.ts';
export type {
  EnqueueIndexJobInput,
  EnqueuedIndexJob,
  EnqueueIndexJobFailure,
  EnqueueIndexJobResult,
} from './index/enqueueIndexJob.ts';
export type {
  IndexOverviewInput,
  IndexOverviewReport,
  IndexOverviewFailure,
  IndexOverviewResult,
} from './index/indexRepoOverview.ts';
