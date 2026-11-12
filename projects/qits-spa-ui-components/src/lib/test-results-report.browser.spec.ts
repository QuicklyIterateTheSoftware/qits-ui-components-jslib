import { TestBed } from '@angular/core/testing';
import { mount, showing } from '../testing/browser/mount';
import {
  LOCATED_FAILURE,
  STORY_CONTEXT,
  STORY_TEST_FILE,
  storyPlatform,
} from './failures/failure-story-fixtures';
import { ALL_GREEN, FAILING_TESTS, storyReport } from './report-fixtures';
import { QitsTestResultsReport } from './test-results-report';

/**
 * Screenshots of the test results report: failures, all green against a baseline, and a failure
 * opened on its test's code (a fake git host answers the read).
 */
const CONTEXT = {
  runId: 'run-1',
  commitSha: '3f9c2e1a7b',
  baseline: null,
  ciOrigin: 'https://ci.dev.example.com',
};

const STYLE = 'display: block; padding: 8px; width: 760px';

describe('QitsTestResultsReport (screenshots)', () => {
  it('lists the failures', async () => {
    const { view } = await mount(
      QitsTestResultsReport,
      {
        report: storyReport({ id: 'r-tests', kind: 'test-results' }, FAILING_TESTS),
        context: CONTEXT,
      },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('failures', { kind: 'DATA' });
  });

  it('shows an all-green run against a baseline', async () => {
    const { view } = await mount(
      QitsTestResultsReport,
      {
        report: storyReport({ id: 'r-green', kind: 'test-results' }, ALL_GREEN),
        baseline: storyReport({ id: 'b-green', kind: 'test-results' }, FAILING_TESTS),
        context: {
          ...CONTEXT,
          baseline: {
            version: '2026.1003.52637',
            runId: 'run-0',
            releaseRequestId: 'rr-0',
            tagSha: 'def5678',
          },
        },
      },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('all-green', { kind: 'DATA' });
  });

  it('opens a failure on its test code', async () => {
    TestBed.configureTestingModule({
      providers: storyPlatform({ kind: 'file', content: STORY_TEST_FILE }),
    });
    const { host, view } = await mount(
      QitsTestResultsReport,
      {
        report: storyReport({ id: 'r-located', kind: 'test-results' }, LOCATED_FAILURE),
        context: STORY_CONTEXT,
      },
      STYLE,
    );
    await view().getByRole('button', { name: 'expected: <403> but was: <204>' }).click();
    await showing(host, 'void refusesAnotherRunsToken()');
    await expect.element(view()).toMatchScreenshot('opened', { kind: 'DATA' });
  });
});
