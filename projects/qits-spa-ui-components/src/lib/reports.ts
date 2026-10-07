import { HttpClient } from '@angular/common/http';
import {
  inject,
  Injectable,
  InjectionToken,
  Injector,
  makeEnvironmentProviders,
  type EnvironmentProviders,
  type Type,
} from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';

import { afterApiOrigin, QitsAppLinks } from './app-links';
import { QITS_CONTRACTS_REPORT_KIND } from './contracts-report';
import { QITS_COVERAGE_KIND, QitsCoverageReport } from './coverage-report';
import { provideQitsStandardFailureInsights } from './failures/standard-failure-insights';
import { QITS_TEST_RESULTS_KIND, QitsTestResultsReport } from './test-results-report';

/**
 * One highlight of a report — "3 tests failed", "coverage −2.1%" — as qits-ci stores it
 * (`CiReportHighlightDto`). qits-ci never learns what a kind means: the CLI wrote these at submit
 * time and they arrive here as they were written.
 *
 * `severity` is `good | info | warn | bad` on the wire. It is typed as a string on purpose: a
 * severity this library does not know is still a highlight, and drawing it neutral beats dropping
 * it.
 */
export interface QitsReportHighlight {
  readonly severity: string;
  /** At most 80 characters, by the CLI's contract. */
  readonly text: string;
  readonly metric: string | null;
  readonly value: number | null;
  readonly delta: number | null;
}

/**
 * The release a run is compared with (`CiReportBaselineDto`): the gating QA run of the release
 * request that produced the repository's newest released version.
 */
export interface QitsReportBaseline {
  readonly version: string;
  readonly runId: string;
  readonly releaseRequestId: string | null;
  readonly tagSha: string | null;
}

/** One stored report, without its payload (`CiReportSummaryDto`). */
export interface QitsReportSummary {
  readonly id: string;
  /** The kind's wire name — `test-results`, `coverage`. */
  readonly kind: string;
  /** The payload's schema version; a registration says which versions it can draw. */
  readonly kindVersion: number;
  readonly stepIndex: number;
  readonly highlights: readonly QitsReportHighlight[];
  readonly baselineRunId: string | null;
  readonly baselineVersion: string | null;
  readonly payloadBytes: number;
  /** ISO instant. */
  readonly submittedAt: string;
}

/** One stored report with its payload (`CiReportDto`). The payload is the kind's own business. */
export interface QitsReport extends QitsReportSummary {
  readonly payload: unknown;
}

/**
 * Every report of one run (`CiRunReportsDto`), the answer to `GET /ci/api/runs/{runId}/reports`.
 *
 * Named `…Dto` here rather than `QitsRunReports` because that name is the component that draws it,
 * `<qits-run-reports>`; a type and a class cannot share one export.
 */
export interface QitsRunReportsDto {
  readonly runId: string;
  readonly commitSha: string;
  readonly releaseRequestId: string | null;
  readonly baseline: QitsReportBaseline | null;
  readonly reports: readonly QitsReportSummary[];
}

/** What a kind component may know about the run beyond its own report. */
export interface QitsReportContext {
  readonly runId: string;
  readonly commitSha: string;
  readonly baseline: QitsReportBaseline | null;
  /**
   * qits-ci's origin as the navigation states it — `''` where it names none and the reads go
   * same-origin. For a kind that has a further read of its own to make on qits-ci; qits-755's code
   * preview reads qits-githost instead, on that application's own origin.
   */
  readonly ciOrigin: string;
}

/**
 * One report kind's view: which kind and payload versions it draws, the title of its section, and
 * the component that draws it.
 *
 * The component is rendered through `NgComponentOutlet` and **must declare three signal inputs**:
 * `report: QitsReport`, `baseline: QitsReport | null` (the baseline run's report of the same kind,
 * when there is one) and `context: QitsReportContext`. Nothing else is handed to it.
 */
export interface QitsReportKind {
  readonly kind: string;
  readonly versions: readonly number[];
  readonly title: string;
  readonly component: Type<unknown>;
}

/**
 * The registry: every kind any `provideQitsReportKind` registered, in registration order. A kind
 * registered twice is drawn by the later registration that lists the payload's version, so an
 * application can override a standard view without unregistering it.
 */
export const QITS_REPORT_KINDS = new InjectionToken<readonly QitsReportKind[]>('QITS_REPORT_KINDS');

/**
 * Register one report kind's view. A new kind is this one line beside its component — no change to
 * `<qits-run-reports>` or to either page that hosts it.
 */
export function provideQitsReportKind(kind: QitsReportKind): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: QITS_REPORT_KINDS, useValue: kind, multi: true }]);
}

/**
 * The standard kinds' views, registered together: `test-results`, `coverage` and `contracts`
 * (qits-759), payload version 1 of each. Both pages that host `<qits-run-reports>` provide this
 * once, so a kind added here reaches both with no change of their own.
 *
 * It brings `provideQitsStandardFailureInsights()` with it, so an opened failure in the test results
 * shows its test code wherever the failure locates it.
 */
export function provideQitsStandardReportKinds(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideQitsReportKind({
      kind: QITS_TEST_RESULTS_KIND,
      versions: [1],
      title: 'Tests',
      component: QitsTestResultsReport,
    }),
    provideQitsReportKind({
      kind: QITS_COVERAGE_KIND,
      versions: [1],
      title: 'Coverage',
      component: QitsCoverageReport,
    }),
    provideQitsReportKind(QITS_CONTRACTS_REPORT_KIND),
    provideQitsStandardFailureInsights(),
  ]);
}

/** Where a run's reports are read, on qits-ci's own origin. */
export const QITS_REPORTS_PATH = '/ci/api/runs';

/**
 * The four reads of qits-ci's report doors.
 *
 * Every read goes to **qits-ci's own origin** — `QitsAppLinks.apiOrigin('qits-ci')`, the origin the
 * navigation states — and waits for the navigation to state it, exactly as `provideQitsBuilds`
 * does; nothing here composes a hostname. Every read carries the session with
 * `withCredentials: true`, which a cross-origin call needs and a same-origin one ignores.
 *
 * Injectable on purpose rather than a set of functions: a story or a spec replaces the whole read
 * with `{ provide: QitsReportsClient, useValue: fake }`.
 */
@Injectable({ providedIn: 'root' })
export class QitsReportsClient {
  private readonly http = inject(HttpClient);
  private readonly links = inject(QitsAppLinks);
  private readonly injector = inject(Injector);

  /**
   * qits-ci's API origin once the navigation has answered — `''` where it names none. Emits once,
   * synchronously on subscribe when the navigation has already answered; unsubscribing stops the
   * wait.
   */
  origin(): Observable<string> {
    return new Observable<string>((subscriber) =>
      afterApiOrigin(this.links, 'qits-ci', this.injector, (origin) => {
        subscriber.next(origin);
        subscriber.complete();
      }),
    );
  }

  /** `GET /ci/api/runs/{runId}/reports` — the run, its baseline and every report's summary. */
  runReports(runId: string): Observable<QitsRunReportsDto> {
    return this.get<QitsRunReportsDto>(`${run(runId)}/reports`);
  }

  /** `GET /ci/api/runs/{runId}/reports/{reportId}` — one report with its payload. */
  report(runId: string, reportId: string): Observable<QitsReport> {
    return this.get<QitsReport>(`${run(runId)}/reports/${encodeURIComponent(reportId)}`);
  }

  /** `GET /ci/api/runs/{runId}/baseline` — the release this run is compared with, or null. */
  baseline(runId: string): Observable<QitsReportBaseline | null> {
    return this.get<{ baseline: QitsReportBaseline | null }>(`${run(runId)}/baseline`).pipe(
      map((body) => body?.baseline ?? null),
    );
  }

  /** `GET /ci/api/runs/{runId}/baseline/reports/{kind}` — the baseline run's reports of a kind. */
  baselineReports(runId: string, kind: string): Observable<readonly QitsReport[]> {
    return this.get<readonly QitsReport[] | null>(
      `${run(runId)}/baseline/reports/${encodeURIComponent(kind)}`,
    ).pipe(map((body) => body ?? []));
  }

  private get<T>(path: string): Observable<T> {
    // The wait for the navigation starts on subscribe, and an unsubscribed read costs nothing;
    // `apiUrl` is read after the wait, when it is known to be defined.
    return this.origin().pipe(
      switchMap(() =>
        this.http.get<T>(this.links.apiUrl('qits-ci', path) ?? path, { withCredentials: true }),
      ),
    );
  }
}

function run(runId: string): string {
  return `${QITS_REPORTS_PATH}/${encodeURIComponent(runId)}`;
}
