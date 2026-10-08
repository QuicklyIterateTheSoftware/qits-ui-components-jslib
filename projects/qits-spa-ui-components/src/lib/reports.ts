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
import { QITS_ENTITY_CHANGES_REPORT_KIND } from './entity-changes-report';
import { provideQitsStandardFailureInsights } from './failures/standard-failure-insights';
import { QITS_SCREENSHOTS_REPORT_KIND } from './screenshots-report';
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
 * The `entity-changes` report's payload, version 1 (qits-760), as the CLI's
 * `EntityChangesReportKind` writes it: a semantic diff of the generated `docs/database/*.md`
 * entity diagrams at the fold against the same files at the baseline release's tag.
 *
 * Named `…Payload` because `QitsEntityChangesReport` is the component that draws it.
 */
export interface QitsEntityChangesPayload {
  /** The release compared with; null where the run has none. */
  readonly baseline: QitsEntityChangesBaseline | null;
  readonly units: readonly QitsEntityUnitChange[];
  /** Above 1 MiB the `after` text of UNCHANGED units was dropped first. */
  readonly truncated: boolean;
}

/** The baseline release, and whether its tag carried a generated diagram at all. */
export interface QitsEntityChangesBaseline {
  readonly version: string | null;
  readonly tagSha: string | null;
  /** False for a version from before the rollout: every unit is then CURRENT. */
  readonly hadDiagram: boolean;
}

/**
 * A unit's status. `CURRENT` means there is nothing to compare with — no baseline, or a baseline
 * tag without a diagram — so the diagram is new, not "N entities added". Typed open so an unknown
 * status is still drawn.
 */
export type QitsEntityUnitStatus = 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED' | 'CURRENT';

/** A table's status within a unit. */
export type QitsEntityTableStatus = 'ADDED' | 'REMOVED' | 'CHANGED';

/** One persistence unit's (or Java package's) diagram file, compared. */
export interface QitsEntityUnitChange {
  /** `docs/database/ci.md`. */
  readonly file: string;
  /** `ci`. */
  readonly unit: string;
  readonly status: QitsEntityUnitStatus | string;
  readonly tables: readonly QitsEntityTableChange[];
  readonly relations: QitsEntityRelationChanges;
  /** The mermaid block's text at the baseline — sent only for CHANGED and REMOVED units. */
  readonly before: string | null;
  /** The mermaid block's text at the fold; null for REMOVED, or dropped by truncation. */
  readonly after: string | null;
}

/** One table that was added, removed or changed. */
export interface QitsEntityTableChange {
  readonly name: string;
  readonly status: QitsEntityTableStatus | string;
  /** The reactor module, or the library artifactId, the entity came from. */
  readonly origin: string | null;
  readonly columns: QitsEntityColumnChanges;
}

export interface QitsEntityColumnChanges {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly QitsEntityColumnChange[];
}

/** A column whose type, keys, nullability or length moved: `string, not null, 64` → `…, 128`. */
export interface QitsEntityColumnChange {
  readonly name: string;
  readonly before: string;
  readonly after: string;
}

/** Relations as their diagram lines: `ci_report }o--|| ci_run : run_id`. */
export interface QitsEntityRelationChanges {
  readonly added: readonly string[];
  readonly removed: readonly string[];
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
 * The standard kinds' views, registered together, payload version 1 of each:
 *
 * - `test-results` (Tests) and `coverage` (Coverage), qits-754;
 * - `contracts` (Contracts), qits-759;
 * - `entity-changes` (Entities), qits-760;
 * - `screenshots` (Screenshots), qits-762 — {@link provideQitsScreenshotsReportKind}.
 *
 * Both pages that host `<qits-run-reports>` provide this once, so a kind added here reaches both
 * with no change of their own.
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
    provideQitsReportKind(QITS_ENTITY_CHANGES_REPORT_KIND),
    provideQitsScreenshotsReportKind(),
    provideQitsStandardFailureInsights(),
  ]);
}

/**
 * The `screenshots` view alone (qits-762): `{ kind: 'screenshots', versions: [1], title:
 * 'Screenshots', component: QitsScreenshotsReport }`. Part of
 * {@link provideQitsStandardReportKinds}; for a host that draws only some kinds.
 */
export function provideQitsScreenshotsReportKind(): EnvironmentProviders {
  return provideQitsReportKind(QITS_SCREENSHOTS_REPORT_KIND);
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
