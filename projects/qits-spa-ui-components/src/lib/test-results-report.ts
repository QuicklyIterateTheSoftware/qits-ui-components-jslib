import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  InjectionToken,
  input,
  output,
  signal,
  type Type,
} from '@angular/core';

import { formatElapsed } from './duration';
import type { QitsReport, QitsReportContext } from './reports';

/** The `test-results` kind's wire name. */
export const QITS_TEST_RESULTS_KIND = 'test-results';

/**
 * Where one failing test lives: enough to name it, and — once qits-755's locators fill
 * `lineStart`/`lineEnd` — to fetch its source at the fold's commit.
 */
export interface QitsTestCoordinates {
  readonly language: string;
  readonly tool: string;
  readonly repository: { readonly projectId: string; readonly name: string };
  /** The fold sha the run tested. */
  readonly commitSha: string;
  /** Relative to the repository root; null only where the parser could not resolve it. */
  readonly file: string | null;
  /** The class for Java, the `describe` path joined with ` > ` for vitest. */
  readonly className: string;
  readonly testName: string;
  /** 1-based, inclusive; null until a locator for the language and tool is registered. */
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
}

/** How a test failed: an assertion, an error, a timeout, or a failure outside any one test. */
export type QitsTestFailureShape = 'ASSERTION' | 'ERROR' | 'TIMEOUT' | 'SETUP';

export interface QitsTestFailure {
  readonly coordinates: QitsTestCoordinates;
  readonly shape: QitsTestFailureShape | string;
  readonly failureType: string | null;
  /** At most 4 KiB. */
  readonly message: string | null;
  /** At most 16 KiB. */
  readonly stackTrace: string | null;
  readonly durationMs: number | null;
}

export interface QitsTestSuite {
  readonly language: string;
  readonly tool: string;
  readonly module: string | null;
  readonly tests: number;
  readonly failed: number;
  readonly errored: number;
  readonly skipped: number;
  readonly durationMs: number | null;
}

export interface QitsTestTotals {
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly errored: number;
  readonly skipped: number;
  readonly durationMs: number | null;
}

/** The `test-results` payload, version 1. Only failing tests are listed one by one. */
export interface QitsTestResultsPayload {
  readonly totals: QitsTestTotals;
  readonly suites: readonly QitsTestSuite[];
  /** At most 200; `truncated` says when more existed. */
  readonly failures: readonly QitsTestFailure[];
  readonly truncated: boolean;
}

/**
 * **The extension point for qits-755's code preview**, part one: a component drawn inside every
 * expanded failure, through `NgComponentOutlet`, with two inputs — `coordinates:
 * QitsTestCoordinates` and `context: QitsReportContext`. Nothing is drawn while none is provided.
 *
 * A token rather than only an output because this view is itself rendered through the report
 * area's outlet, where no host can bind an output; a provider reaches it wherever it is drawn.
 */
export const QITS_TEST_FAILURE_PREVIEW = new InjectionToken<Type<unknown>>(
  'QITS_TEST_FAILURE_PREVIEW',
);

function firstLineOf(text: string | null | undefined): string {
  return (text ?? '').split(/\r?\n/, 1)[0];
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The `test-results` view: the totals line, the suites by language and tool, and a table of every
 * listed failure — class or `describe` path, test name, shape, the message's first line (expandable
 * to the whole message and the stack) and the file.
 *
 * It reads the payload defensively: a field missing from a payload is drawn as absent, never thrown
 * over, because a report is never allowed to break the page that shows it.
 */
@Component({
  selector: 'qits-test-results-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @let t = totals();
    <p class="totals">
      <strong>{{ t.tests }} tests</strong> · {{ t.passed }} passed ·
      <span [class.bad]="t.failed > 0">{{ t.failed }} failed</span> ·
      <span [class.bad]="t.errored > 0">{{ t.errored }} errored</span> · {{ t.skipped }} skipped
      @if (t.durationMs !== null) {
        · {{ elapsed(t.durationMs) }}
      }
    </p>
    @if (baselineTotals(); as b) {
      <p class="muted baseline">
        At {{ baselineVersion() }}: {{ b.tests }} tests, {{ b.failed + b.errored }} failing.
      </p>
    }
    @if (suites().length) {
      <ul class="suites">
        @for (suite of suites(); track $index) {
          <li>
            {{ suite.language }} · {{ suite.tool }}
            @if (suite.module) {
              ({{ suite.module }})
            }
            — {{ suite.tests }} tests, {{ suite.failed }} failed, {{ suite.errored }} errored,
            {{ suite.skipped }} skipped
          </li>
        }
      </ul>
    }
    @if (failures().length) {
      <table class="failures">
        <thead>
          <tr>
            <th scope="col">Class / describe</th>
            <th scope="col">Test</th>
            <th scope="col">Shape</th>
            <th scope="col">Message</th>
            <th scope="col">File</th>
          </tr>
        </thead>
        <tbody>
          @for (failure of failures(); track $index; let i = $index) {
            <tr class="failure">
              <td class="code">{{ failure.coordinates.className }}</td>
              <td class="code">{{ failure.coordinates.testName }}</td>
              <td>
                <span class="shape">{{ failure.shape }}</span>
              </td>
              <td>
                <button
                  type="button"
                  class="message"
                  [attr.aria-expanded]="expanded() === i"
                  (click)="toggle(i, failure)"
                >
                  {{ firstLine(failure.message) || failure.failureType || 'No message' }}
                </button>
              </td>
              <td class="code file">{{ failure.coordinates.file ?? 'file not resolved' }}</td>
            </tr>
            @if (expanded() === i) {
              <tr class="detail">
                <td colspan="5">
                  @if (failure.failureType) {
                    <p class="code type">{{ failure.failureType }}</p>
                  }
                  @if (failure.message) {
                    <pre class="full-message">{{ failure.message }}</pre>
                  }
                  @if (failure.stackTrace) {
                    <pre class="stack">{{ failure.stackTrace }}</pre>
                  }
                  @if (preview) {
                    <ng-container
                      *ngComponentOutlet="
                        preview;
                        inputs: { coordinates: failure.coordinates, context: context() }
                      "
                    />
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    } @else {
      <p class="muted none">No failing tests.</p>
    }
    @if (truncated()) {
      <p class="muted truncated">
        Only the first {{ failures().length }} failures were kept; more failed than are listed here.
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      font-size: 0.875rem;
      color: #111827;
    }
    p {
      margin: 0.25rem 0;
    }
    .muted {
      color: #6b7280;
    }
    .bad {
      color: #b91c1c;
      font-weight: 600;
    }
    .suites {
      margin: 0.25rem 0 0.5rem;
      padding-left: 1.25rem;
      color: #374151;
    }
    .failures {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0.5rem;
    }
    th,
    td {
      text-align: left;
      vertical-align: top;
      padding: 0.3rem 0.5rem;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      font-weight: 600;
      color: #374151;
    }
    .code,
    pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      overflow-wrap: anywhere;
    }
    .shape {
      font-size: 0.75rem;
      font-weight: 600;
      color: #b91c1c;
    }
    .message {
      font: inherit;
      text-align: left;
      color: #1d4ed8;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    pre {
      margin: 0.25rem 0;
      padding: 0.5rem;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 0.25rem;
      white-space: pre-wrap;
      max-height: 24rem;
      overflow: auto;
    }
  `,
})
export class QitsTestResultsReport {
  /** The `test-results` report, payload included. */
  readonly report = input.required<QitsReport>();
  /** The baseline run's `test-results` report, when there is one. */
  readonly baseline = input<QitsReport | null>(null);
  readonly context = input<QitsReportContext | null>(null);

  /**
   * **The extension point for qits-755**, part two: emitted when a reader opens a failure, with
   * its coordinates. A host that draws this view directly binds it; inside the report area, where
   * nothing can bind it, {@link QITS_TEST_FAILURE_PREVIEW} is the way in.
   */
  readonly failureOpened = output<QitsTestCoordinates>();

  protected readonly preview = inject(QITS_TEST_FAILURE_PREVIEW, { optional: true });
  protected readonly expanded = signal<number | null>(null);
  protected readonly elapsed = formatElapsed;
  protected readonly firstLine = firstLineOf;

  private readonly payload = computed(
    () => (this.report().payload ?? {}) as Partial<QitsTestResultsPayload>,
  );

  protected readonly totals = computed(() => totalsOf(this.payload().totals));
  protected readonly suites = computed(() => arrayOf(this.payload().suites));
  protected readonly failures = computed(() =>
    arrayOf(this.payload().failures).filter((failure) => failure?.coordinates),
  );
  protected readonly truncated = computed(() => this.payload().truncated === true);

  protected readonly baselineTotals = computed(() => {
    const payload = this.baseline()?.payload as Partial<QitsTestResultsPayload> | undefined;
    return payload?.totals ? totalsOf(payload.totals) : null;
  });
  protected readonly baselineVersion = computed(
    () => this.context()?.baseline?.version ?? this.baseline()?.baselineVersion ?? 'the baseline',
  );

  protected toggle(index: number, failure: QitsTestFailure): void {
    if (this.expanded() === index) {
      this.expanded.set(null);
      return;
    }
    this.expanded.set(index);
    this.failureOpened.emit(failure.coordinates);
  }
}

function arrayOf<T>(value: readonly T[] | undefined | null): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function totalsOf(totals: Partial<QitsTestTotals> | undefined | null): QitsTestTotals {
  return {
    tests: count(totals?.tests),
    passed: count(totals?.passed),
    failed: count(totals?.failed),
    errored: count(totals?.errored),
    skipped: count(totals?.skipped),
    durationMs: typeof totals?.durationMs === 'number' ? totals.durationMs : null,
  };
}
