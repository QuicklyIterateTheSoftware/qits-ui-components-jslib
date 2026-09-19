import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { clamp, formatElapsed, instantMs } from './duration';

/**
 * The width of a step boundary, as a percentage of the whole track. Small on purpose: it is a seam
 * telling one step from the next, not a gap with a meaning of its own.
 *
 * <p>It is **carved out of the step before the boundary**, so two steps of 10s and 90s are a 9%
 * bubble, a 1% seam and a 90% bubble: the bubbles and the seams still add to exactly 100, and the
 * last step keeps its whole share because nothing follows it. Carving it from the step *after*
 * would shrink the last step instead and leave the track ending a seam short of its own end.
 */
export const QITS_BUILD_STEP_GAP = 1;

/**
 * How often this component's own clock moves. A second, because the numbers beside the bubbles are
 * in seconds and a bar that moved faster would only be repainting the same string.
 */
export const QITS_STEP_PROGRESS_TICK_MS = 1000;

/**
 * One **planned** step of a pipeline: how long it is expected to take, and when it really ran.
 *
 * <p>The array a caller passes is the pipeline's steps in declaration order, one entry each, from
 * the first to the last — <b>not</b> the steps that have happened so far. That distinction is the
 * whole of what makes this track boundary-true: a step the run has not reached is present, drawn,
 * and empty, so the bar never has to guess where a boundary would have been.
 *
 * <p>Nothing here is measured by this library. `expectedMillis` is qits-ci's p95 of what the same
 * step took before, and the two instants are the step's own timestamps as the service recorded
 * them. A prediction is an estimate and must never read as a promise, so no number is invented to
 * fill a gap: a step with no `startedAt` is drawn as a step that has not started.
 */
export interface QitsStepProgressStep {
  /** The p95 this step is expected to take, in milliseconds. Positive. */
  readonly expectedMillis: number;
  /** When the step really started, as an ISO instant — absent for a step that has not started. */
  readonly startedAt?: string | null;
  /** When it really finished — absent for the step in flight and for every step after it. */
  readonly finishedAt?: string | null;
}

/** One bubble, ready to draw: three percentages, a tone and the string beside it. */
interface QitsStepProgressBubble {
  /** The step's share of the track, with the boundary seam that follows it already taken out. */
  readonly width: number;
  /** The seam after it — zero for the last step, which keeps its whole share. */
  readonly gap: number;
  /** How much of **this step's own** bubble is done: 0 for one not started, 100 for one finished. */
  readonly fill: number;
  /** This step has passed its own expectation. A quieter tone, never a wider bubble. */
  readonly overdue: boolean;
  /** `90s / 250s` for a step that has started, `200s` for one that has not. */
  readonly label: string;
  /** What a screen reader is told about this step, since the bubble itself is decorative. */
  readonly title: string;
}

/**
 * A pipeline's steps as a segmented track: one bubble per step, each filling against **its own**
 * expected duration, with what it has actually taken beside it.
 *
 * ```
 * [---____] 90s / 250s   [____] 200s
 * ```
 *
 * <p>The left bubble is the step in flight, 90 seconds into a step qits-ci expects to take 250; the
 * right is a step that has not started, showing only its expectation. That second bubble is the
 * point of the component. **A bubble does not begin to fill until its step has actually started**,
 * and a step that overruns fills its own bubble and stops there — it never consumes the next one's.
 *
 * <h3>Why this exists</h3>
 *
 * <p>Two bars drew this before, one here and one in qits-ci-frontend, and both drew the same wrong
 * thing: seams at each step's predicted share of the p95 total, and then <b>the whole bar filled
 * from wall-clock elapsed against the predicted total</b>. Neither read the run's actual steps.
 * The consequence is exactly backwards from what a segmented bar appears to promise — a step that
 * overruns eclipses the following seams, and a step that finishes early leaves the next segment
 * filling before that step has started. The seams were real boundaries of a prediction, drawn as if
 * they were boundaries of the build.
 *
 * <p>So the fill is computed per step here and there is no total to fill from: the structure of
 * {@link bubbles} makes the old bug unreachable rather than merely fixed.
 *
 * <h3>What is drawn</h3>
 *
 * <ul>
 *   <li><b>Width</b> — the step's share of the expected total, which is what makes a boundary
 *       legible at all: a 10s step beside a 90s step is 10% and 90%, not two equal halves. Minus
 *       the seam, see {@link QITS_BUILD_STEP_GAP}.</li>
 *   <li><b>Not started</b> (no `startedAt`) — fill 0, and the label is the expectation alone.</li>
 *   <li><b>Finished</b> — fill 100, and the real duration is `finishedAt - startedAt`, not the
 *       expectation it is shown against.</li>
 *   <li><b>In flight</b> — `(now - startedAt) / expectedMillis`, clamped at 100. Past its own
 *       expectation it holds at full and shifts to the overdue tone: late is a fact about the step,
 *       not a wider bubble.</li>
 * </ul>
 *
 * <p>The label sits <b>under</b> its bubble rather than inline beside it, which is the one place
 * this departs from the sketch above. A bubble's width is its share of the track — 9% of a header
 * panel is a few pixels — so an inline string would either overflow its neighbour or force every
 * bubble to be at least as wide as its own number, and a track whose widths are not the steps'
 * shares is the thing this component exists to stop being.
 *
 * <h3>The clock</h3>
 *
 * <p>The component owns it: one second, running **only while a step is in flight** and stopped
 * otherwise. `now - startedAt` is a subtraction, so asking a service to learn it would turn a panel
 * somebody left open into traffic — and a track of entirely finished or entirely unstarted steps
 * has nothing to recompute, so it does not tick at all and costs a reader who walked away nothing.
 *
 * <h3>Accessibility</h3>
 *
 * <p>The host is the `progressbar`, over the **run as a whole**: `aria-valuenow` is the expected
 * work done as a percentage, which is the one number the bubbles are all proportions of. Every
 * bubble and every seam is `aria-hidden`, because a shape is not something to read out; the labels
 * are not, so the per-step numbers are still reachable.
 *
 * ```html
 * <qits-step-progress [steps]="steps()" label="Build progress" />
 * ```
 */
@Component({
  selector: 'qits-step-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'progress()',
    '[attr.aria-label]': 'label()',
  },
  template: `
    <span class="qits-step-progress-track">
      @for (bubble of bubbles(); track $index) {
        <span
          class="qits-step-progress-step"
          [style.width.%]="bubble.width"
          [style.margin-right.%]="bubble.gap"
        >
          <!-- Decorative: the shape is the label's picture, and the label is right underneath it.
               Nothing here is said only in geometry. -->
          <span class="qits-step-progress-bubble" aria-hidden="true">
            <span
              class="qits-step-progress-fill"
              [class.qits-step-progress-overdue]="bubble.overdue"
              [style.width.%]="bubble.fill"
            ></span>
          </span>
          <span class="qits-step-progress-label" [title]="bubble.title">{{ bubble.label }}</span>
        </span>
      }
    </span>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    /* The bubbles and their seams add to exactly the track, so nothing has to be rounded away. */
    .qits-step-progress-track {
      display: flex;
      align-items: flex-start;
      width: 100%;
      min-width: 0;
    }
    .qits-step-progress-step {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: none;
      min-width: 0;
    }
    /* Unfilled is the panel's border grey: this is a measure, not a control. */
    .qits-step-progress-bubble {
      display: block;
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      overflow: hidden;
    }
    .qits-step-progress-fill {
      display: block;
      height: 100%;
      background: #1d4ed8;
      border-radius: 2px;
    }
    /* Past its own expectation and still going. A quieter tone rather than an alarming one: a slow
       step is not a failing one, and the bubble being full is already the loud part. */
    .qits-step-progress-overdue {
      background: #93a3c8;
    }
    .qits-step-progress-label {
      display: block;
      font-size: 11px;
      line-height: 1.3;
      font-variant-numeric: tabular-nums;
      color: #6b7280;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class QitsStepProgress {
  /**
   * The pipeline's **planned** steps, in declaration order — one entry per step, first to last.
   *
   * <p>A caller with no step timings at all (an older service, a run nobody has measured) passes
   * the expectations with both instants absent, and gets a track of empty bubbles showing what the
   * run is expected to do. That is the honest reading of "we know the shape and nothing else".
   */
  readonly steps = input.required<readonly QitsStepProgressStep[]>();

  /** What the whole track is called, for the `progressbar` the host is. */
  readonly label = input<string>('Step progress');

  /**
   * The clock, and the reason it is the component's own rather than a caller's: what moves here is
   * one in-flight bubble and one string, and only this component knows whether anything is moving
   * at all.
   */
  private readonly now = signal(Date.now());
  private ticker: ReturnType<typeof setInterval> | undefined = undefined;

  /** A step that has started and not finished. The only reason there is ever anything to tick. */
  private readonly inFlight = computed(() =>
    this.steps().some((step) => !!step.startedAt && !step.finishedAt),
  );

  constructor() {
    // Reading `inFlight` is what makes this re-run when the steps change: a run whose last step
    // finishes stops the clock without anybody telling it to, and one that starts begins it.
    effect(() => this.tick(this.inFlight()));
    inject(DestroyRef).onDestroy(() => this.tick(false));
  }

  /**
   * Start or stop the clock. Idempotent — the effect re-runs on every change to the input, and a
   * restarted interval is a tick that never comes — and it sets the time once on starting, so the
   * first paint of a track that has just begun is not a second behind.
   */
  private tick(running: boolean): void {
    if (running === (this.ticker !== undefined)) return;
    if (!running) {
      clearInterval(this.ticker);
      this.ticker = undefined;
      return;
    }
    this.now.set(Date.now());
    this.ticker = setInterval(() => this.now.set(Date.now()), QITS_STEP_PROGRESS_TICK_MS);
  }

  /**
   * The bubbles. Each one's fill is a function of **that step's own** two instants and its own
   * expectation, and of nothing else — there is deliberately no running total in this loop, which
   * is what makes "a later bubble fills from the total" unreachable rather than merely absent.
   *
   * <p>A step too short to give a whole seam away gives what it has (`Math.min`), which keeps a
   * sliver of a step from being drawn at a negative width and pushing the rest of the track off
   * the end. An empty input, or one whose expectations do not add to anything positive, draws no
   * bubbles: the widths are proportions of that total and there is no shape without it.
   */
  protected readonly bubbles = computed<readonly QitsStepProgressBubble[]>(() => {
    const steps = this.steps();
    const now = this.now();
    const total = steps.reduce((sum, step) => sum + Math.max(0, step.expectedMillis), 0);
    if (total <= 0) return [];
    const last = steps.length - 1;
    return steps.map((step, index) => {
      const expected = Math.max(0, step.expectedMillis);
      const share = (100 * expected) / total;
      const gap = index === last ? 0 : Math.min(QITS_BUILD_STEP_GAP, share);
      const state = progressOf(step, expected, now);
      return {
        width: share - gap,
        gap,
        fill: state.fill,
        overdue: state.overdue,
        label: state.label,
        title: `Step ${index + 1}: ${state.title}`,
      };
    });
  });

  /**
   * The run as a whole, for `aria-valuenow`: the expected work done over the expected work there
   * is. Weighting each step's fill by its own expectation is what makes this agree with the
   * picture — a finished 10s step out of 100s is 10%, the same 10% of the track its bubble takes.
   */
  protected readonly progress = computed(() => {
    const steps = this.steps();
    const now = this.now();
    const total = steps.reduce((sum, step) => sum + Math.max(0, step.expectedMillis), 0);
    if (total <= 0) return 0;
    const done = steps.reduce((sum, step) => {
      const expected = Math.max(0, step.expectedMillis);
      return sum + (progressOf(step, expected, now).fill / 100) * expected;
    }, 0);
    return Math.round((100 * done) / total);
  });
}

/**
 * One step's state: how full its bubble is, whether it has outrun its own expectation, and the two
 * strings that say so in words.
 *
 * <p>Three cases and no fourth, in the order they must be asked:
 *
 * <ol>
 *   <li><b>Not started</b> — no `startedAt`, fill 0. This is the rule the bars this replaces got
 *       wrong, and it is checked first so that nothing downstream can reach a later step's fill.</li>
 *   <li><b>Finished</b> — fill 100, and the duration shown is `finishedAt - startedAt`, the real
 *       one. A step that took longer than its p95 carries the overdue tone here too: the fact does
 *       not stop being true the moment the step ends.</li>
 *   <li><b>In flight</b> — `now - startedAt` against the expectation, clamped at 100.</li>
 * </ol>
 */
function progressOf(
  step: QitsStepProgressStep,
  expectedMillis: number,
  now: number,
): { fill: number; overdue: boolean; label: string; title: string } {
  const expected = formatElapsed(expectedMillis);
  const startedAt = instantMs(step.startedAt);
  if (startedAt === undefined) {
    return { fill: 0, overdue: false, label: expected, title: `not started, expected ${expected}` };
  }
  const finishedAt = instantMs(step.finishedAt);
  const taken = Math.max(0, (finishedAt ?? now) - startedAt);
  const actual = formatElapsed(taken);
  const overdue = expectedMillis > 0 && taken > expectedMillis;
  // A finished step is full whatever it took; an unfinished one fills against its own expectation
  // and holds there. Either way the number beside it keeps saying what it really took.
  const fill =
    finishedAt !== undefined
      ? 100
      : expectedMillis > 0
        ? clamp(taken / expectedMillis, 0, 1) * 100
        : 100;
  const state = finishedAt !== undefined ? 'took' : 'running for';
  return {
    fill,
    overdue,
    label: `${actual} / ${expected}`,
    title: `${state} ${actual}, expected ${expected}`,
  };
}
