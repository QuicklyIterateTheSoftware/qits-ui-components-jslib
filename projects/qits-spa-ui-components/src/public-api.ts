export { QitsButton } from './lib/button';
export type { QitsButtonSize, QitsButtonVariant } from './lib/button';
export { QitsBadge } from './lib/badge';
export type { QitsBadgeTone } from './lib/badge';
export { QitsCard } from './lib/card';
export { QitsPicker } from './lib/picker';
export type { QitsPickerOption } from './lib/picker';
export { QitsMainLayout } from './lib/main-layout';
export {
  provideQitsNavigation,
  provideQitsNavigationLinks,
  provideQitsNavigationTree,
  QITS_NAV_SLOTS,
  QITS_NAVIGATION,
  QITS_NAVIGATION_URL,
  toNavTree,
} from './lib/navigation';
export type {
  QitsNavApplication,
  QitsNavEntry,
  QitsNavEntryBody,
  QitsNavigation,
  QitsNavigationSource,
  QitsNavLink,
  QitsNavSlot,
  QitsNavTree,
} from './lib/navigation';
export {
  provideQitsBuilds,
  provideQitsBuildList,
  QITS_BUILDS,
  QITS_BUILDS_FALLBACK_INTERVAL_MS,
  QITS_BUILDS_INTERVAL_MS,
  QITS_BUILDS_STREAM_ATTEMPTS,
  QITS_BUILDS_STREAM_DEBOUNCE_MS,
  QITS_BUILDS_STREAM_URL,
  QITS_BUILDS_URL,
  QITS_BUILD_RUNNING,
  QITS_EVENT_SOURCE,
  toBuilds,
} from './lib/builds';
export type {
  QitsBuild,
  QitsBuildLiveStep,
  QitsBuildRuns,
  QitsBuildsSource,
  QitsBuildStepTiming,
  QitsEventSourceFactory,
  QitsEventSourceLike,
} from './lib/builds';
export {
  QitsStepProgress,
  QITS_BUILD_STEP_GAP,
  QITS_STEP_PROGRESS_TICK_MS,
} from './lib/step-progress';
export type { QitsStepProgressStep } from './lib/step-progress';
export { QitsNavSubmenu, QitsNavSubmenuSlot } from './lib/nav-submenu';
export {
  provideQitsProjects,
  provideQitsProjectList,
  QITS_PROJECTS,
  QITS_PROJECTS_URL,
} from './lib/projects';
export type { QitsProject, QitsProjectEntries, QitsProjectsSource } from './lib/projects';
export {
  provideQitsRepositories,
  provideQitsRepositoryList,
  QITS_REPOSITORIES,
  QITS_REPOSITORIES_URL,
  QitsProjectRepositoryLookup,
} from './lib/repositories';
export type {
  QitsProjectRepositories,
  QitsRepositoriesSource,
  QitsRepository,
  QitsRepositoryEntries,
} from './lib/repositories';
export {
  parseScope,
  provideQitsScope,
  QITS_CATEGORIES,
  QITS_SCOPE,
  scopeCommands,
  scopeGroup,
  scopePath,
  UrlScope,
} from './lib/scope';
export type { QitsCategory, QitsRouting, QitsScope, QitsScopeSource } from './lib/scope';
export { QitsAppLinks, QITS_BROWSER_ORIGIN } from './lib/app-links';
export { QitsDiffViewer } from './lib/diff-viewer';
export { QitsChangeTree } from './lib/change-tree';
export {
  buildChangeTree,
  flattenChanges,
  qitsChangeLetter,
  qitsChangeTitle,
  qitsChangeTone,
  QITS_EMPTY_CHANGE_NODE,
} from './lib/change-tree-model';
export type {
  QitsChangeEntry,
  QitsChangeNode,
  QitsChangeNodeKind,
  QitsChangeRow,
  QitsChangeTone,
  QitsChangeType,
} from './lib/change-tree-model';
export {
  provideQitsReportKind,
  provideQitsStandardReportKinds,
  QITS_REPORT_KINDS,
  QITS_REPORTS_PATH,
  QitsReportsClient,
} from './lib/reports';
export type {
  QitsReport,
  QitsReportBaseline,
  QitsReportContext,
  QitsReportHighlight,
  QitsReportKind,
  QitsReportSummary,
  QitsRunReportsDto,
} from './lib/reports';
export { QitsRunReports, qitsReportKindFor } from './lib/run-reports';
export { QitsReportHighlights, qitsHighlightTone } from './lib/report-highlights';
export {
  QITS_TEST_FAILURE_PREVIEW,
  QITS_TEST_RESULTS_KIND,
  QitsTestResultsReport,
} from './lib/test-results-report';
export type {
  QitsTestCoordinates,
  QitsTestFailure,
  QitsTestFailureShape,
  QitsTestResultsPayload,
  QitsTestSuite,
  QitsTestTotals,
} from './lib/test-results-report';
export {
  QITS_COVERAGE_KIND,
  QitsCoverageReport,
  qitsLineRanges,
  qitsPercent,
  qitsPointsDelta,
} from './lib/coverage-report';
export type {
  QitsCoverageDiff,
  QitsCoverageFile,
  QitsCoveragePayload,
  QitsCoverageSource,
  QitsCoverageTotal,
  QitsCoverageUncovered,
} from './lib/coverage-report';
export {
  classifyFailure,
  provideQitsFailureClassifier,
  QITS_FAILURE_CLASSIFIERS,
  StandardFailureClassifier,
} from './lib/failures/failure-kinds';
export type { QitsFailureClassifier, QitsFailureKind } from './lib/failures/failure-kinds';
export {
  provideQitsFailureInsight,
  QITS_FAILURE_ACTIONS,
  QITS_FAILURE_INSIGHTS,
} from './lib/failures/failure-insights';
export type {
  QitsFailureActionProvider,
  QitsFailureInsightProvider,
} from './lib/failures/failure-insights';
export { QitsFailureInsightsArea } from './lib/failures/failure-insights-area';
export {
  highlighterFor,
  JavaHighlighter,
  provideQitsSyntaxHighlighter,
  QITS_PLAIN_HIGHLIGHTER,
  QITS_SYNTAX_HIGHLIGHTERS,
  TypeScriptHighlighter,
} from './lib/failures/syntax';
export type { QitsCodeToken, QitsSyntaxHighlighter } from './lib/failures/syntax';
export { QitsCodeExcerpt } from './lib/failures/code-excerpt';
export {
  QITS_GITHOST_REPOSITORIES_PATH,
  QITS_SOURCE_FILE_MAX_BYTES,
  QitsSourceFiles,
} from './lib/failures/source-files';
export type { QitsSourceFile, QitsSourceFileResponse } from './lib/failures/source-files';
export {
  QITS_CODE_PREVIEW_MAX_LINES,
  QitsCodePreview,
  QitsCodePreviewInsight,
} from './lib/failures/code-preview-insight';
export { provideQitsStandardFailureInsights } from './lib/failures/standard-failure-insights';
