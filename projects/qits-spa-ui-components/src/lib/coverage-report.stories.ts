import type { Meta, StoryObj } from '@storybook/angular-vite';

import { QitsCoverageReport } from './coverage-report';
import { COVERAGE, COVERAGE_NO_BASELINE, storyReport } from './report-fixtures';

const meta: Meta<QitsCoverageReport> = {
  title: 'Reports/Coverage',
  component: QitsCoverageReport,
  tags: ['autodocs'],
  args: { report: storyReport({ id: 'r-cov', kind: 'coverage' }, COVERAGE), baseline: null },
};

export default meta;
type Story = StoryObj<QitsCoverageReport>;

/** Total with its delta against the baseline, diff coverage, and the changed lines no test ran. */
export const WithBaseline: Story = { name: 'With a baseline' };

/**
 * A first release, or a baseline from before the rollout: `diff` and `baselineTotal` are null and
 * the view says so plainly. Never an error.
 */
export const NoBaseline: Story = {
  name: 'No baseline',
  args: { report: storyReport({ id: 'r-cov', kind: 'coverage' }, COVERAGE_NO_BASELINE) },
};

/** Every changed line was covered. */
export const FullyCovered: Story = {
  name: 'Every changed line covered',
  args: {
    report: storyReport(
      { id: 'r-cov', kind: 'coverage' },
      { ...COVERAGE, diff: { ...COVERAGE.diff!, linesCovered: 50, percent: 100, uncovered: [] } },
    ),
  },
};
