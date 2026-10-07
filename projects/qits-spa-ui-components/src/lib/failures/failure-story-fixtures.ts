/**
 * What the failure stories share: a located surefire failure, the file it lives in as a fake git
 * host answers it, and the providers a page hosting the test results already has. Imported by
 * stories only: `public-api.ts` names nothing here, so none of it reaches the published package.
 */
import type { EnvironmentProviders, Provider } from '@angular/core';

import { provideQitsNavigationTree } from '../navigation';
import { provideQitsProjectList } from '../projects';
import type { QitsReportContext } from '../reports';
import { provideQitsRepositoryList } from '../repositories';
import type {
  QitsTestCoordinates,
  QitsTestFailure,
  QitsTestResultsPayload,
} from '../test-results-report';
import { QitsSourceFiles, type QitsSourceFile } from './source-files';
import { provideQitsStandardFailureInsights } from './standard-failure-insights';

export const STORY_SHA = '3f9c2e1a7b4d8e0f1a2b3c4d5e6f708192a3b4c5';

export const STORY_CONTEXT: QitsReportContext = {
  runId: 'run-1',
  commitSha: STORY_SHA,
  baseline: null,
  ciOrigin: 'https://ci.dev.example.com',
};

/** The test file as it stands at the commit — what the fake git host answers. */
export const STORY_TEST_FILE = [
  'package eu.wohlben.qits.ci.api;',
  '',
  'import static io.restassured.RestAssured.given;',
  'import static org.junit.jupiter.api.Assertions.assertEquals;',
  '',
  '@QuarkusTest',
  '@TestHTTPEndpoint(CiReportResource.class)',
  'class CiReportResourceTest {',
  '',
  '  private static final String OTHER_RUN_TOKEN = "run-2:3d1f";',
  '',
  '  /*',
  '   * Another run’s token is refused: a run may only submit reports for itself.',
  '   */',
  '  @Test',
  '  @TestSecurity(user = "runner", roles = {"qits:runner"})',
  '  void refusesAnotherRunsToken() {',
  '    String body = """',
  '        {"kind": "test-results", "kindVersion": 1, "payload": {}}',
  '        """;',
  '    given().header("X-Run-Token", OTHER_RUN_TOKEN).body(body)',
  '        .post("/ci/api/runs/{runId}/reports", RUN_ID)',
  '        .then().statusCode(403); // not 204: the token names another run',
  '  }',
  '}',
  '',
].join('\n');

function coordinates(overrides: Partial<QitsTestCoordinates> = {}): QitsTestCoordinates {
  return {
    language: 'java',
    tool: 'surefire',
    repository: { projectId: 'p-qits', name: 'qits-ci-service' },
    commitSha: STORY_SHA,
    file: 'service/src/test/java/eu/wohlben/qits/ci/api/CiReportResourceTest.java',
    className: 'eu.wohlben.qits.ci.api.CiReportResourceTest',
    testName: 'refusesAnotherRunsToken',
    lineStart: 12,
    lineEnd: 24,
    ...overrides,
  };
}

export function locatedFailure(overrides: Partial<QitsTestCoordinates> = {}): QitsTestFailure {
  return {
    coordinates: coordinates(overrides),
    shape: 'ASSERTION',
    failureType: 'org.opentest4j.AssertionFailedError',
    message: 'expected: <403> but was: <204>',
    stackTrace: [
      'org.opentest4j.AssertionFailedError: expected: <403> but was: <204>',
      '\tat eu.wohlben.qits.ci.api.CiReportResourceTest.refusesAnotherRunsToken(CiReportResourceTest.java:23)',
    ].join('\n'),
    durationMs: 120,
  };
}

export const LOCATED_FAILURE: QitsTestResultsPayload = {
  totals: { tests: 412, passed: 411, failed: 1, errored: 0, skipped: 0, durationMs: 81234 },
  suites: [
    {
      language: 'java',
      tool: 'surefire',
      module: 'service',
      tests: 412,
      failed: 1,
      errored: 0,
      skipped: 0,
      durationMs: 81234,
    },
  ],
  failures: [locatedFailure()],
  truncated: false,
};

/** A git host that answers every read with `answer`, after a moment. */
function fakeFiles(answer: QitsSourceFile): Pick<QitsSourceFiles, 'read'> {
  return {
    read: () => new Promise((resolve) => setTimeout(() => resolve(answer), 300)),
  };
}

/**
 * The chrome a page hosting the report already has — the navigation, the projects, the
 * repositories — plus the standard insights and a git host answering every read with `answer`.
 */
export function storyPlatform(answer: QitsSourceFile): (Provider | EnvironmentProviders)[] {
  return [
    provideQitsStandardFailureInsights(),
    provideQitsNavigationTree({
      slots: {},
      applications: { 'qits-githost': { origin: 'https://githost.dev.example.com' } },
    }),
    provideQitsProjectList([{ id: 'p-qits', slug: 'qits', name: 'QITS' }]),
    provideQitsRepositoryList([
      { id: 'repo-ci', name: 'qits-ci-service', component: 'qits-ci', category: 'services' },
    ]),
    { provide: QitsSourceFiles, useValue: fakeFiles(answer) },
  ];
}
