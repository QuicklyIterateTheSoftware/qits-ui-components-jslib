import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { mount, showing } from '../testing/browser/mount';
import { COVERAGE, FAILING_TESTS, storyReport } from './report-fixtures';
import {
  provideQitsStandardReportKinds,
  QitsReportsClient,
  type QitsReport,
  type QitsReportBaseline,
  type QitsRunReportsDto,
} from './reports';
import { QitsRunReports } from './run-reports';

/**
 * Screenshots of a run's reports: tests and coverage (closed, then the coverage opened), a kind with
 * no view here, not reported, a failed read, and loading. A fake client answers at once.
 */
const BASELINE: QitsReportBaseline = {
  version: '2026.1003.52637',
  runId: 'run-0',
  releaseRequestId: 'rr-0',
  tagSha: 'def5678',
};

const TESTS = storyReport(
  {
    id: 'r-tests',
    kind: 'test-results',
    baselineRunId: 'run-0',
    baselineVersion: BASELINE.version,
    highlights: [
      { severity: 'bad', text: '3 tests failed', metric: 'failed', value: 3, delta: 3 },
      { severity: 'info', text: '412 tests', metric: 'tests', value: 412, delta: 4 },
    ],
  },
  FAILING_TESTS,
);

const COVERAGE_REPORT = storyReport(
  {
    id: 'r-cov',
    kind: 'coverage',
    baselineRunId: 'run-0',
    baselineVersion: BASELINE.version,
    highlights: [
      { severity: 'warn', text: 'coverage 81.0% (−0.5)', metric: 'total', value: 81, delta: -0.5 },
      { severity: 'good', text: 'diff coverage 78.0%', metric: 'diff', value: 78, delta: null },
    ],
  },
  COVERAGE,
);

const PACTS = storyReport(
  {
    id: 'r-pacts',
    kind: 'pacts',
    highlights: [
      {
        severity: 'info',
        text: 'new pact: qits-ci → qits-idp',
        metric: null,
        value: null,
        delta: null,
      },
    ],
  },
  { pacts: ['qits-ci → qits-idp'] },
);

function summaries(reports: readonly QitsReport[]): QitsRunReportsDto {
  return {
    runId: 'run-1',
    commitSha: '3f9c2e1a7b',
    releaseRequestId: 'rr-1',
    baseline: BASELINE,
    reports: reports.map(({ payload: _payload, ...summary }) => summary),
  };
}

function client(
  reports: readonly QitsReport[],
  options: { failRun?: boolean; pending?: boolean } = {},
): Partial<QitsReportsClient> {
  return {
    origin: () => of('https://ci.dev.example.com'),
    runReports: () =>
      options.pending
        ? NEVER
        : options.failRun
          ? throwError(() => new Error('503'))
          : of(summaries(reports)),
    report: (_runId: string, id: string) => {
      const report = reports.find((candidate) => candidate.id === id);
      return report ? of(report) : throwError(() => new Error('404'));
    },
    baseline: () => of(BASELINE),
    baselineReports: () => of([]),
  };
}

function provide(fake: Partial<QitsReportsClient>): void {
  TestBed.configureTestingModule({
    providers: [provideQitsStandardReportKinds(), { provide: QitsReportsClient, useValue: fake }],
  });
}

const STYLE = 'display: block; padding: 8px; width: 760px';

describe('QitsRunReports (screenshots)', () => {
  it('lists the reports with their highlights', async () => {
    provide(client([TESTS, COVERAGE_REPORT]));
    const { view } = await mount(QitsRunReports, { runId: 'run-1' }, STYLE);
    await expect.element(view()).toMatchScreenshot('closed', { kind: 'DATA' });
  });

  it('opens a report', async () => {
    provide(client([TESTS, COVERAGE_REPORT]));
    const { host, view } = await mount(QitsRunReports, { runId: 'run-1' }, STYLE);
    await view().getByRole('button', { name: 'Coverage' }).click();
    await showing(host, 'Diff coverage');
    await expect.element(view()).toMatchScreenshot('coverage-open', { kind: 'DATA' });
  });

  it('says a kind has no view here', async () => {
    provide(client([TESTS, PACTS]));
    const { view } = await mount(QitsRunReports, { runId: 'run-1' }, STYLE);
    await expect.element(view()).toMatchScreenshot('unregistered-kind', { kind: 'DATA' });
  });

  it('says so when nothing was reported', async () => {
    provide(client([]));
    const { view } = await mount(QitsRunReports, { runId: 'run-1' }, STYLE);
    await expect.element(view()).toMatchScreenshot('not-reported', { kind: 'NO_DATA' });
  });

  it('says so when the reports could not be read', async () => {
    provide(client([], { failRun: true }));
    const { view } = await mount(QitsRunReports, { runId: 'run-1' }, STYLE);
    await expect.element(view()).toMatchScreenshot('read-failed', { kind: 'ERROR' });
  });

  it('says it is loading', async () => {
    provide(client([], { pending: true }));
    const { view } = await mount(QitsRunReports, { runId: 'run-1' }, STYLE);
    await expect.element(view()).toMatchScreenshot('loading', { kind: 'PENDING' });
  });
});
