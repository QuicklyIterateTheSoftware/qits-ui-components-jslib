import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';

import {
  LOCATED_FAILURE,
  STORY_CONTEXT,
  STORY_TEST_FILE,
  storyPlatform,
} from './failures/failure-story-fixtures';
import { ALL_GREEN, FAILING_TESTS, storyReport, VITEST_TIMEOUT } from './report-fixtures';
import { QitsTestResultsReport } from './test-results-report';

const CONTEXT = {
  runId: 'run-1',
  commitSha: '3f9c2e1a7b',
  baseline: null,
  ciOrigin: 'https://ci.dev.example.com',
};

const meta: Meta<QitsTestResultsReport> = {
  title: 'Reports/Test results',
  component: QitsTestResultsReport,
  tags: ['autodocs'],
  args: {
    report: storyReport({ id: 'r-tests', kind: 'test-results' }, FAILING_TESTS),
    baseline: null,
    context: CONTEXT,
  },
};

export default meta;
type Story = StoryObj<QitsTestResultsReport>;

/**
 * A java-service's QA run: surefire and failsafe side by side, one assertion, one error, and a
 * class-level `initializationError` whose file the parser could not resolve. Click a message to
 * open the whole message and the stack. These failures name no lines yet, so no test code is
 * shown under them; the next story's does.
 */
export const JavaFailures: Story = { name: 'Java failures' };

/** A vitest timeout, with `truncated` set: more failed than the 200 the payload keeps. */
export const VitestTruncated: Story = {
  name: 'vitest, truncated',
  args: { report: storyReport({ id: 'r-vitest', kind: 'test-results' }, VITEST_TIMEOUT) },
};

/** Nothing failed, and the baseline's totals for comparison. */
export const AllGreen: Story = {
  name: 'All green, with a baseline',
  args: {
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
};

/**
 * A failure its locator placed, opened: under the message and the stack the insight area draws
 * "Test code" — the failing test's lines, read from the git host at the run's commit (a fake one
 * here), and a link to the same lines on its Code page.
 */
export const OpenedWithTestCode: Story = {
  name: 'Opened, with its test code',
  decorators: [
    applicationConfig({
      providers: storyPlatform({ kind: 'file', content: STORY_TEST_FILE }),
    }),
  ],
  args: {
    report: storyReport({ id: 'r-located', kind: 'test-results' }, LOCATED_FAILURE),
    context: STORY_CONTEXT,
  },
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button.message')?.click();
  },
};
