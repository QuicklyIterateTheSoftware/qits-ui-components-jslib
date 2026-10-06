import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { delay, NEVER, of, throwError, type Observable } from 'rxjs';

import { COVERAGE, FAILING_TESTS, storyReport } from './report-fixtures';
import {
  provideQitsReportKind,
  provideQitsStandardReportKinds,
  QitsReportsClient,
  type QitsReport,
  type QitsReportBaseline,
  type QitsReportContext,
  type QitsRunReportsDto,
} from './reports';
import { QitsRunReports } from './run-reports';

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
      {
        severity: 'info',
        text: 'diff coverage 78.0% (39/50)',
        metric: 'diff',
        value: 78,
        delta: null,
      },
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

/**
 * A stand-in for qits-ci: answers the four reads from literals, after a short delay so the loading
 * lines are visible. The area never knows the difference — the client is its only door.
 */
function fakeClient(
  reports: readonly QitsReport[],
  options: { failRun?: boolean; pending?: boolean } = {},
): Partial<QitsReportsClient> {
  const answer = <T>(value: T): Observable<T> => of(value).pipe(delay(300));
  return {
    origin: () => of('https://ci.dev.example.com'),
    runReports: () =>
      options.pending
        ? NEVER
        : options.failRun
          ? throwError(() => new Error('503'))
          : answer(summaries(reports)),
    report: (_runId: string, id: string) => {
      const report = reports.find((candidate) => candidate.id === id);
      return report ? answer(report) : throwError(() => new Error('404'));
    },
    baseline: () => answer(BASELINE),
    baselineReports: (_runId: string, kind: string) =>
      answer(
        reports
          .filter((report) => report.kind === kind)
          .map((report) => ({ ...report, id: `b-${report.id}`, payload: report.payload })),
      ),
  };
}

/** What qits-759's view will be: one component, registered with one provider. */
@Component({
  selector: 'qits-story-pact-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ pacts() }} — at {{ context().commitSha }}</p>`,
})
class PactReport {
  readonly report = input.required<QitsReport>();
  readonly baseline = input<QitsReport | null>(null);
  readonly context = input.required<QitsReportContext>();

  protected pacts(): string {
    const payload = this.report().payload as { pacts?: string[] } | null;
    return (payload?.pacts ?? []).join(', ');
  }
}

const meta: Meta<QitsRunReports> = {
  title: 'Reports/Run reports',
  component: QitsRunReports,
  tags: ['autodocs'],
  args: { runId: 'run-1' },
};

export default meta;
type Story = StoryObj<QitsRunReports>;

/**
 * A release request's QA run with both standard kinds: every highlight in one strip, then one
 * section per report. Opening a section reads its payload and the baseline's.
 */
export const StandardKinds: Story = {
  name: 'Tests and coverage',
  decorators: [
    applicationConfig({
      providers: [
        provideQitsStandardReportKinds(),
        { provide: QitsReportsClient, useValue: fakeClient([TESTS, COVERAGE_REPORT]) },
      ],
    }),
  ],
};

/**
 * A kind this page has no view for falls back to its highlights. The page never fails over a
 * report.
 */
export const UnregisteredKind: Story = {
  name: 'A kind with no view here',
  decorators: [
    applicationConfig({
      providers: [
        provideQitsStandardReportKinds(),
        { provide: QitsReportsClient, useValue: fakeClient([TESTS, PACTS]) },
      ],
    }),
  ],
};

/** The same run once the kind is registered — one provider, no change to the area. */
export const ExtraKindRegistered: Story = {
  name: 'An extra kind, registered',
  decorators: [
    applicationConfig({
      providers: [
        provideQitsStandardReportKinds(),
        provideQitsReportKind({
          kind: 'pacts',
          versions: [1],
          title: 'Pacts',
          component: PactReport,
        }),
        { provide: QitsReportsClient, useValue: fakeClient([TESTS, PACTS]) },
      ],
    }),
  ],
};

/** A run that submitted nothing — a QA step with no report files. */
export const NotReported: Story = {
  name: 'Not reported',
  decorators: [
    applicationConfig({
      providers: [
        provideQitsStandardReportKinds(),
        { provide: QitsReportsClient, useValue: fakeClient([]) },
      ],
    }),
  ],
};

/** qits-ci could not be read: one muted line, and the host page goes on. */
export const ReadFailed: Story = {
  name: 'Read failed',
  decorators: [
    applicationConfig({
      providers: [
        provideQitsStandardReportKinds(),
        { provide: QitsReportsClient, useValue: fakeClient([], { failRun: true }) },
      ],
    }),
  ],
};

/** Waiting for qits-ci's answer. */
export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: [
        provideQitsStandardReportKinds(),
        { provide: QitsReportsClient, useValue: fakeClient([], { pending: true }) },
      ],
    }),
  ],
};
