import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { QitsReport, QitsReportContext } from './reports';

/** The `coverage` kind's wire name. */
export const QITS_COVERAGE_KIND = 'coverage';

export interface QitsCoverageSource {
  readonly language: string;
  readonly tool: string;
}

export interface QitsCoverageTotal {
  readonly linesCovered: number;
  readonly linesTotal: number;
  readonly percent: number | null;
}

/** The covered-line share of each file the reporters saw. */
export interface QitsCoverageFile {
  readonly file: string;
  readonly linesCovered: number;
  readonly linesTotal: number;
}

/** A changed file's uncovered changed lines, as 1-based inclusive `[start, end]` ranges. */
export interface QitsCoverageUncovered {
  readonly file: string;
  readonly ranges: readonly (readonly [number, number])[];
}

/** Line coverage of the lines the fold added or changed compared with the baseline's tag. */
export interface QitsCoverageDiff {
  readonly baselineVersion: string;
  /** Only the coverable lines the fold added or changed. */
  readonly linesChanged: number;
  readonly linesCovered: number;
  /** Null where no coverable line changed. */
  readonly percent: number | null;
  readonly uncovered: readonly QitsCoverageUncovered[];
}

/** The `coverage` payload, version 1. */
export interface QitsCoveragePayload {
  readonly sources: readonly QitsCoverageSource[];
  readonly total: QitsCoverageTotal;
  /** Null without a baseline, or where the baseline has no coverage report. */
  readonly baselineTotal: { readonly version: string; readonly percent: number } | null;
  /** Null without a baseline. */
  readonly diff: QitsCoverageDiff | null;
  readonly files: readonly QitsCoverageFile[];
}

/** `80.9%` — one decimal, the precision the highlights speak in. */
export function qitsPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

/** `+0.4` / `−2.1` / `±0.0`, in percentage points. */
export function qitsPointsDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return '±0.0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
}

/** `41–44, 90` — a file's uncovered ranges, a one-line range as its one number. */
export function qitsLineRanges(ranges: readonly (readonly number[])[] | null | undefined): string {
  return (Array.isArray(ranges) ? ranges : [])
    .filter((range) => Array.isArray(range) && typeof range[0] === 'number')
    .map(([start, end]) => (end === undefined || end === start ? `${start}` : `${start}–${end}`))
    .join(', ');
}

/**
 * The `coverage` view: total line coverage with its delta against the baseline, diff coverage —
 * the share of the lines this fold changed that a test ran — as a percentage and `covered/changed`,
 * and the uncovered changed lines per file as ranges.
 *
 * "No baseline" is said plainly where `diff` is null — a first release, or a baseline from before
 * the rollout — because that is an answer, not a failure.
 */
@Component({
  selector: 'qits-coverage-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let total = payload().total;
    <p class="total">
      <strong>Total line coverage {{ percent(total?.percent) }}</strong>
      @if (total) {
        <span class="muted"> ({{ total.linesCovered }}/{{ total.linesTotal }} lines)</span>
      }
      @if (totalDelta(); as d) {
        <span class="delta" [class.down]="d.value < 0" [class.up]="d.value > 0">
          {{ d.text }} vs {{ d.version }}
        </span>
      } @else {
        <span class="muted no-baseline-total"> · no baseline total</span>
      }
    </p>
    @if (sources().length) {
      <p class="muted sources">
        From
        @for (source of sources(); track $index; let last = $last) {
          {{ source.language }} · {{ source.tool }}{{ last ? '' : ', ' }}
        }
      </p>
    }
    @if (payload().diff; as diff) {
      <p class="diff">
        <strong>Diff coverage {{ percent(diff.percent) }}</strong>
        <span class="muted">
          ({{ diff.linesCovered }}/{{ diff.linesChanged }} changed lines covered, vs
          {{ diff.baselineVersion }})</span
        >
      </p>
      @if (uncovered().length) {
        <p class="muted">Changed lines no test ran:</p>
        <ul class="uncovered">
          @for (entry of uncovered(); track entry.file) {
            <li>
              <span class="code">{{ entry.file }}</span
              >:
              <span class="ranges">{{ ranges(entry.ranges) }}</span>
            </li>
          }
        </ul>
      } @else if (diff.linesChanged > 0) {
        <p class="muted">Every changed line was covered.</p>
      } @else {
        <p class="muted">No coverable line changed.</p>
      }
    } @else {
      <p class="no-baseline">
        No baseline: diff coverage needs a released version to compare with.
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
    .muted,
    .no-baseline {
      color: #6b7280;
    }
    .delta {
      margin-left: 0.5rem;
      font-weight: 600;
      color: #374151;
    }
    .delta.down {
      color: #b91c1c;
    }
    .delta.up {
      color: #047857;
    }
    .uncovered {
      margin: 0.25rem 0;
      padding-left: 1.25rem;
    }
    .code,
    .ranges {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      overflow-wrap: anywhere;
    }
    .ranges {
      color: #b91c1c;
    }
  `,
})
export class QitsCoverageReport {
  /** The `coverage` report, payload included. */
  readonly report = input.required<QitsReport>();
  /** The baseline run's `coverage` report, when there is one. The payload's own delta is used. */
  readonly baseline = input<QitsReport | null>(null);
  readonly context = input<QitsReportContext | null>(null);

  protected readonly percent = qitsPercent;
  protected readonly ranges = qitsLineRanges;

  protected readonly payload = computed(
    () => (this.report().payload ?? {}) as Partial<QitsCoveragePayload>,
  );
  protected readonly sources = computed(() => arrayOf(this.payload().sources));
  protected readonly uncovered = computed(() =>
    arrayOf(this.payload().diff?.uncovered).filter((entry) => entry?.file),
  );

  /** The total's change against `baselineTotal` — null where either side has no number. */
  protected readonly totalDelta = computed(() => {
    const { total, baselineTotal } = this.payload();
    if (typeof total?.percent !== 'number' || typeof baselineTotal?.percent !== 'number') {
      return null;
    }
    const value = total.percent - baselineTotal.percent;
    return { value, text: qitsPointsDelta(value), version: baselineTotal.version };
  });
}

function arrayOf<T>(value: readonly T[] | undefined | null): readonly T[] {
  return Array.isArray(value) ? value : [];
}
