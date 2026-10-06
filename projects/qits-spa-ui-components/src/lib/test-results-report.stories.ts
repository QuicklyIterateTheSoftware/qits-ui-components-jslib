import type { Meta, StoryObj } from '@storybook/angular-vite';

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
 * open the whole message and the stack — that is where qits-755's code preview will appear.
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
