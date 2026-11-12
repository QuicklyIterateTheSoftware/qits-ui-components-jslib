import { mount } from '../testing/browser/mount';
import { QitsCoverageReport } from './coverage-report';
import { COVERAGE, COVERAGE_NO_BASELINE, storyReport } from './report-fixtures';

/** Screenshots of the coverage report: against a baseline, and without one. */
const STYLE = 'display: block; padding: 8px; width: 720px';

describe('QitsCoverageReport (screenshots)', () => {
  it('shows the totals and the uncovered changed lines against a baseline', async () => {
    const { view } = await mount(
      QitsCoverageReport,
      { report: storyReport({ id: 'r-cov', kind: 'coverage' }, COVERAGE), baseline: null },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('with-baseline', { kind: 'DATA' });
  });

  it('shows the totals alone without a baseline', async () => {
    const { view } = await mount(
      QitsCoverageReport,
      {
        report: storyReport({ id: 'r-cov', kind: 'coverage' }, COVERAGE_NO_BASELINE),
        baseline: null,
      },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('no-baseline', { kind: 'DATA' });
  });
});
