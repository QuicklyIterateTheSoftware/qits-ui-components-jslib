/**
 * Payloads the report stories share — what a `release-request:` run of a java-service and of a
 * spa-frontend submit. Imported by stories only: `public-api.ts` names nothing here, so none of it
 * reaches the published package.
 */
import type { QitsCoveragePayload } from './coverage-report';
import type { QitsReport, QitsReportSummary } from './reports';
import type { QitsTestCoordinates, QitsTestResultsPayload } from './test-results-report';

function coordinates(overrides: Partial<QitsTestCoordinates>): QitsTestCoordinates {
  return {
    language: 'java',
    tool: 'surefire',
    repository: { projectId: 'p-qits', name: 'qits-ci-service' },
    commitSha: '3f9c2e1a7b',
    file: 'service/src/test/java/eu/wohlben/qits/ci/api/CiReportResourceTest.java',
    className: 'eu.wohlben.qits.ci.api.CiReportResourceTest',
    testName: 'refusesAnotherRunsToken',
    lineStart: null,
    lineEnd: null,
    ...overrides,
  };
}

export const FAILING_TESTS: QitsTestResultsPayload = {
  totals: { tests: 412, passed: 409, failed: 2, errored: 1, skipped: 0, durationMs: 81234 },
  suites: [
    {
      language: 'java',
      tool: 'surefire',
      module: 'service',
      tests: 380,
      failed: 1,
      errored: 1,
      skipped: 0,
      durationMs: 70000,
    },
    {
      language: 'java',
      tool: 'failsafe',
      module: 'service',
      tests: 32,
      failed: 1,
      errored: 0,
      skipped: 0,
      durationMs: 11234,
    },
  ],
  failures: [
    {
      coordinates: coordinates({}),
      shape: 'ASSERTION',
      failureType: 'org.opentest4j.AssertionFailedError',
      message: 'expected: <403> but was: <204>',
      stackTrace: [
        'org.opentest4j.AssertionFailedError: expected: <403> but was: <204>',
        '\tat org.junit.jupiter.api.AssertionFailureBuilder.build(AssertionFailureBuilder.java:151)',
        '\tat eu.wohlben.qits.ci.api.CiReportResourceTest.refusesAnotherRunsToken(CiReportResourceTest.java:88)',
      ].join('\n'),
      durationMs: 120,
    },
    {
      coordinates: coordinates({
        tool: 'failsafe',
        file: 'service/src/it/java/eu/wohlben/qits/ci/CiReportStoreIT.java',
        className: 'eu.wohlben.qits.ci.CiReportStoreIT',
        testName: 'replacesOnResubmit',
      }),
      shape: 'ERROR',
      failureType: 'java.lang.IllegalStateException',
      message:
        'duplicate key value violates unique constraint "ci_report_run_step_kind"\nDetail: …',
      stackTrace: 'java.lang.IllegalStateException: duplicate key …',
      durationMs: 410,
    },
    {
      coordinates: coordinates({
        file: null,
        className: 'eu.wohlben.qits.ci.control.CiReportBaselinesTest',
        testName: 'initializationError',
      }),
      shape: 'SETUP',
      failureType: 'java.lang.NoClassDefFoundError',
      message: null,
      stackTrace: null,
      durationMs: null,
    },
  ],
  truncated: false,
};

export const VITEST_TIMEOUT: QitsTestResultsPayload = {
  totals: { tests: 316, passed: 315, failed: 1, errored: 0, skipped: 0, durationMs: 9010 },
  suites: [
    {
      language: 'typescript',
      tool: 'vitest',
      module: null,
      tests: 316,
      failed: 1,
      errored: 0,
      skipped: 0,
      durationMs: 9010,
    },
  ],
  failures: [
    {
      coordinates: coordinates({
        language: 'typescript',
        tool: 'vitest',
        repository: { projectId: 'p-qits', name: 'qits-ui-components-jslib' },
        file: 'projects/qits-spa-ui-components/src/lib/run-reports.spec.ts',
        className: 'QitsRunReports > fallbacks',
        testName: 'says "Not reported." for a run with no reports',
      }),
      shape: 'TIMEOUT',
      failureType: 'Error',
      message: 'Test timed out in 5000ms.',
      stackTrace: null,
      durationMs: 5000,
    },
  ],
  truncated: true,
};

export const ALL_GREEN: QitsTestResultsPayload = {
  totals: { tests: 120, passed: 118, failed: 0, errored: 0, skipped: 2, durationMs: 31000 },
  suites: [],
  failures: [],
  truncated: false,
};

export const COVERAGE: QitsCoveragePayload = {
  sources: [{ language: 'java', tool: 'jacoco' }],
  total: { linesCovered: 8120, linesTotal: 10031, percent: 80.95 },
  baselineTotal: { version: '2026.1003.52637', percent: 81.4 },
  diff: {
    baselineVersion: '2026.1003.52637',
    linesChanged: 50,
    linesCovered: 39,
    percent: 78.0,
    uncovered: [
      {
        file: 'ci/src/main/java/eu/wohlben/qits/ci/control/CiReportStore.java',
        ranges: [
          [41, 44],
          [90, 90],
        ],
      },
      {
        file: 'ci/src/main/java/eu/wohlben/qits/ci/control/CiReportBaselines.java',
        ranges: [[17, 23]],
      },
    ],
  },
  files: [],
};

export const COVERAGE_NO_BASELINE: QitsCoveragePayload = {
  ...COVERAGE,
  sources: [{ language: 'typescript', tool: 'vitest-coverage' }],
  baselineTotal: null,
  diff: null,
};

export function storyReport(
  summary: Partial<QitsReportSummary> & Pick<QitsReportSummary, 'id' | 'kind'>,
  payload: unknown,
): QitsReport {
  return {
    kindVersion: 1,
    stepIndex: 0,
    highlights: [],
    baselineRunId: null,
    baselineVersion: null,
    payloadBytes: JSON.stringify(payload).length,
    submittedAt: '2026-10-06T10:00:00Z',
    ...summary,
    payload,
  };
}
