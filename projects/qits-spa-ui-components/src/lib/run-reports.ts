import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { catchError, forkJoin, map, of, Subscription } from 'rxjs';

import { QitsReportHighlights } from './report-highlights';
import {
  QITS_REPORT_KINDS,
  QitsReportsClient,
  type QitsReport,
  type QitsReportContext,
  type QitsReportHighlight,
  type QitsReportKind,
  type QitsReportSummary,
  type QitsRunReportsDto,
} from './reports';

/** One report's section: its summary, the registration that draws it (if any), and its title. */
interface Section {
  readonly summary: QitsReportSummary;
  /** Survives a reload, which may hand the same report back under a new id. */
  readonly key: string;
  readonly registration: QitsReportKind | undefined;
  readonly title: string;
}

/** What an opened section has fetched. */
type Detail =
  | { readonly state: 'loading' }
  | { readonly state: 'failed' }
  | {
      readonly state: 'loaded';
      readonly inputs: {
        readonly report: QitsReport;
        readonly baseline: QitsReport | null;
        readonly context: QitsReportContext;
      };
    };

type Load =
  | { readonly state: 'loading' }
  | { readonly state: 'failed' }
  | { readonly state: 'loaded'; readonly run: QitsRunReportsDto };

/**
 * The registration that draws a kind at a payload version: the **last** one registered that lists
 * the version, so an application can override a standard view. `undefined` is a real answer — an
 * unknown kind, or a version newer than any view here — and the section falls back to highlights.
 */
export function qitsReportKindFor(
  kinds: readonly QitsReportKind[],
  kind: string,
  version: number,
): QitsReportKind | undefined {
  return [...kinds]
    .reverse()
    .find((entry) => entry.kind === kind && entry.versions.includes(version));
}

/**
 * The generic report area of one CI run: every highlight in one strip, then one collapsible section
 * per report, each drawn by the view its kind registered with `provideQitsReportKind`.
 *
 * - **It reads when `runId` changes, and only then.** A host polling its run every few seconds and
 *   re-binding the same id costs nothing here; when the run finishes the host calls
 *   {@link reload}.
 * - **A section reads when it opens**: the payload (`/reports/{id}`) and the baseline run's report
 *   of the same kind (`/baseline/reports/{kind}`), then renders the registered component through
 *   `NgComponentOutlet` with the inputs `report`, `baseline` and `context`.
 * - **It never fails its host.** A kind or version with no registration shows its highlights and
 *   says there is no view for it here; a run with no reports says "Not reported."; a failed read is
 *   one muted line.
 *
 * Every read goes to qits-ci's own origin with the session — see {@link QitsReportsClient}.
 */
@Component({
  selector: 'qits-run-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, QitsReportHighlights],
  template: `
    @switch (load().state) {
      @case ('loading') {
        <p class="muted" role="status">Loading reports…</p>
      }
      @case ('failed') {
        <p class="muted failed" role="status">Reports could not be read.</p>
      }
      @default {
        @if (sections().length === 0) {
          <p class="muted none" role="status">Not reported.</p>
        } @else {
          <qits-report-highlights class="all" [highlights]="highlights()" />
          @for (section of sections(); track section.summary.id) {
            <section class="report" [attr.data-kind]="section.summary.kind">
              @if (section.registration) {
                <h3>
                  <button
                    type="button"
                    class="toggle"
                    [attr.aria-expanded]="isOpen(section)"
                    (click)="toggle(section)"
                  >
                    <span class="caret" aria-hidden="true">{{ isOpen(section) ? '▾' : '▸' }}</span>
                    {{ section.title }}
                  </button>
                </h3>
                @if (isOpen(section)) {
                  <div class="body">
                    @let state = details()[section.summary.id]?.state;
                    @if (inputsOf(section); as inputs) {
                      <ng-container
                        *ngComponentOutlet="section.registration.component; inputs: inputs"
                      />
                    } @else if (state === 'failed') {
                      <p class="muted failed" role="status">This report could not be read.</p>
                    } @else {
                      <p class="muted" role="status">Loading…</p>
                    }
                  </div>
                }
              } @else {
                <h3 class="unregistered">{{ section.title }}</h3>
                <div class="body">
                  <qits-report-highlights [highlights]="section.summary.highlights" />
                  <p class="muted no-view">No view for this report kind here.</p>
                </div>
              }
            </section>
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    p {
      margin: 0.25rem 0;
    }
    .muted {
      color: #6b7280;
      font-size: 0.85rem;
    }
    .all {
      margin-bottom: 0.5rem;
    }
    .report {
      border-top: 1px solid #e5e7eb;
      padding: 0.25rem 0;
    }
    h3 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: #111827;
    }
    h3.unregistered {
      padding: 0.25rem 0;
    }
    .toggle {
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 0.25rem 0;
      cursor: pointer;
      display: inline-flex;
      gap: 0.4rem;
      align-items: baseline;
    }
    .caret {
      width: 1em;
      color: #6b7280;
    }
    .body {
      padding: 0.25rem 0 0.5rem 1.4rem;
    }
  `,
})
export class QitsRunReports {
  /** The qits-ci run whose reports are shown — a release request's QA run, or the run on screen. */
  readonly runId = input.required<string>();

  private readonly client = inject(QitsReportsClient);
  private readonly kinds = inject(QITS_REPORT_KINDS, { optional: true }) ?? [];

  protected readonly load = signal<Load>({ state: 'loading' });
  /** Opened sections, by {@link Section.key} so that an open section stays open through a reload. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());
  protected readonly details = signal<Readonly<Record<string, Detail>>>({});
  private readonly ciOrigin = signal('');

  /** The run id the summaries were last asked for — the guard that makes a re-bind free. */
  private loadedFor: string | undefined;
  private reads = new Subscription();

  protected readonly sections = computed<readonly Section[]>(() => {
    const load = this.load();
    if (load.state !== 'loaded') return [];
    const reports = Array.isArray(load.run?.reports) ? load.run.reports : [];
    const several = new Set(reports.map((report) => report.stepIndex)).size > 1;
    return reports.map((summary) => {
      const registration = qitsReportKindFor(this.kinds, summary.kind, summary.kindVersion);
      const name = registration?.title ?? summary.kind;
      return {
        summary,
        key: `${summary.stepIndex}/${summary.kind}`,
        registration,
        title: several ? `${name} · step ${summary.stepIndex}` : name,
      };
    });
  });

  protected readonly highlights = computed<readonly QitsReportHighlight[]>(() =>
    this.sections().flatMap((section) =>
      Array.isArray(section.summary.highlights) ? section.summary.highlights : [],
    ),
  );

  constructor() {
    effect(() => {
      const runId = this.runId();
      untracked(() => {
        if (runId === this.loadedFor) return;
        this.fetch(runId, false);
      });
    });
    const origin = this.client.origin().subscribe((value) => this.ciOrigin.set(value));
    inject(DestroyRef).onDestroy(() => {
      origin.unsubscribe();
      this.reads.unsubscribe();
    });
  }

  /**
   * Read the summaries again — what the host calls when the run finishes and its reports are
   * complete. Open sections stay open and read their payloads again; the current answer stays on
   * screen until the new one arrives.
   */
  reload(): void {
    this.fetch(this.runId(), true);
  }

  protected isOpen(section: Section): boolean {
    return this.opened().has(section.key);
  }

  /** The opened view's inputs, once its reads have answered. */
  protected inputsOf(section: Section): Record<string, unknown> | null {
    const detail = this.details()[section.summary.id];
    return detail?.state === 'loaded' ? detail.inputs : null;
  }

  protected toggle(section: Section): void {
    const opened = new Set(this.opened());
    if (opened.delete(section.key)) {
      this.opened.set(opened);
      return;
    }
    opened.add(section.key);
    this.opened.set(opened);
    const detail = this.details()[section.summary.id];
    if (!detail || detail.state === 'failed') this.open(section);
  }

  private fetch(runId: string, keep: boolean): void {
    this.reads.unsubscribe();
    this.reads = new Subscription();
    this.loadedFor = runId;
    this.details.set({});
    if (!keep) {
      this.opened.set(new Set());
      this.load.set({ state: 'loading' });
    }
    this.reads.add(
      this.client.runReports(runId).subscribe({
        next: (run) => {
          this.load.set({ state: 'loaded', run });
          for (const section of this.sections()) {
            if (section.registration && this.isOpen(section)) this.open(section);
          }
        },
        error: () => {
          // A reload that fails keeps the answer already on screen: it is older, not wrong.
          if (!keep || this.load().state !== 'loaded') this.load.set({ state: 'failed' });
        },
      }),
    );
  }

  /** Read one section's payload and its baseline, and hand both to the registered view. */
  private open(section: Section): void {
    const load = this.load();
    if (load.state !== 'loaded') return;
    const { run } = load;
    const id = section.summary.id;
    this.setDetail(id, { state: 'loading' });
    const hasBaseline = !!run.baseline || !!section.summary.baselineRunId;
    const baseline = hasBaseline
      ? this.client.baselineReports(run.runId, section.summary.kind).pipe(
          map((reports) => pickBaseline(reports, section.summary)),
          // A baseline that cannot be read is no baseline: the report itself is still drawable.
          catchError(() => of(null)),
        )
      : of(null);
    this.reads.add(
      forkJoin({ report: this.client.report(run.runId, id), baseline }).subscribe({
        next: ({ report, baseline }) =>
          this.setDetail(id, {
            state: 'loaded',
            inputs: {
              report,
              baseline,
              context: {
                runId: run.runId,
                commitSha: run.commitSha,
                baseline: run.baseline ?? null,
                ciOrigin: this.ciOrigin(),
              },
            },
          }),
        error: () => this.setDetail(id, { state: 'failed' }),
      }),
    );
  }

  private setDetail(id: string, detail: Detail): void {
    this.details.update((details) => ({ ...details, [id]: detail }));
  }
}

/** The baseline report of the same step where the baseline run has one, else its first. */
function pickBaseline(
  reports: readonly QitsReport[] | null | undefined,
  summary: QitsReportSummary,
): QitsReport | null {
  const candidates = Array.isArray(reports) ? reports : [];
  return (
    candidates.find((report) => report.stepIndex === summary.stepIndex) ?? candidates[0] ?? null
  );
}
