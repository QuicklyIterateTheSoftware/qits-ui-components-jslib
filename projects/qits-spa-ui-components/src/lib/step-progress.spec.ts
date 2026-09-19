import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { QitsStepProgress, type QitsStepProgressStep } from './step-progress';

/**
 * The segmented step track.
 *
 * <p>The clock is fixed throughout: every number below is a subtraction the component does locally,
 * and a spec that let the real clock move would be asserting the machine's speed rather than the
 * arithmetic.
 */
describe('QitsStepProgress', () => {
  const NOW = Date.parse('2026-09-07T12:00:00.000Z');

  /** An ISO instant `seconds` before the fixed now. */
  function ago(seconds: number): string {
    return new Date(NOW - seconds * 1000).toISOString();
  }

  /** A host, so the input can be changed after the first render the way a caller changes it. */
  @Component({
    imports: [QitsStepProgress],
    template: `<qits-step-progress [steps]="steps()" [label]="label()" />`,
  })
  class Host {
    readonly steps = signal<readonly QitsStepProgressStep[]>([]);
    readonly label = signal('Build progress');
  }

  function render(steps: readonly QitsStepProgressStep[]): ComponentFixture<Host> {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.steps.set(steps);
    fixture.detectChanges();
    return fixture;
  }

  function bubbles(fixture: ComponentFixture<Host>): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('.qits-step-progress-step')] as HTMLElement[];
  }

  /** A percentage off a style binding — absent reads as zero, which is what absent means here. */
  function percent(element: HTMLElement, property: 'width' | 'marginRight'): number {
    return parseFloat(element.style[property] || '0');
  }

  function fills(fixture: ComponentFixture<Host>): number[] {
    return bubbles(fixture).map((bubble) =>
      percent(bubble.querySelector('.qits-step-progress-fill') as HTMLElement, 'width'),
    );
  }

  function labels(fixture: ComponentFixture<Host>): (string | undefined)[] {
    return [...fixture.nativeElement.querySelectorAll('.qits-step-progress-label')].map((node) =>
      (node as HTMLElement).textContent?.trim(),
    );
  }

  function overdue(fixture: ComponentFixture<Host>): number {
    return fixture.nativeElement.querySelectorAll('.qits-step-progress-overdue').length;
  }

  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  /**
   * 10s and 90s of a 100s pipeline are 9% + a 1% seam + 90%: the seam is carved out of the step
   * BEFORE the boundary, so the last step keeps its whole share and the track adds to exactly 100.
   */
  it('divides the track per step, with the seam carved from the step before each boundary', () => {
    const fixture = render([{ expectedMillis: 10_000 }, { expectedMillis: 90_000 }]);

    const [short, long] = bubbles(fixture);
    expect(percent(short, 'width')).toBeCloseTo(9);
    expect(percent(short, 'marginRight')).toBeCloseTo(1);
    expect(percent(long, 'width')).toBeCloseTo(90);
    expect(percent(long, 'marginRight')).toBeCloseTo(0);
    expect(
      percent(short, 'width') +
        percent(short, 'marginRight') +
        percent(long, 'width') +
        percent(long, 'marginRight'),
    ).toBeCloseTo(100);
  });

  /** A step too short to give a whole seam away gives what it has, and never a negative width. */
  it('never draws a sliver of a step at a negative width', () => {
    const fixture = render([{ expectedMillis: 200 }, { expectedMillis: 99_800 }]);

    const [sliver] = bubbles(fixture);
    expect(percent(sliver, 'width')).toBeGreaterThanOrEqual(0);
    expect(percent(sliver, 'width')).toBeCloseTo(0);
    expect(percent(sliver, 'marginRight')).toBeCloseTo(0.2);
  });

  it('draws a run nobody has started as the shape of what it will do, empty', () => {
    const fixture = render([{ expectedMillis: 10_000 }, { expectedMillis: 90_000 }]);
    expect(fills(fixture)).toEqual([0, 0]);
    expect(labels(fixture)).toEqual(['10s', '1m 30s']);
  });

  /**
   * **The regression this component exists for.** The old bars filled the whole track from the run's
   * wall-clock elapsed against the predicted total, so a step that overran ate the seams after it
   * and the next segment filled before that step had started. Here the first step is 150s into a
   * 10s expectation — five times its own prediction and past the *run's* total — and the second
   * bubble is still empty, because the second step has not started.
   */
  it('leaves an unstarted bubble empty while an earlier step is overrunning', () => {
    const fixture = render([
      { expectedMillis: 10_000, startedAt: ago(150) },
      { expectedMillis: 90_000 },
    ]);

    expect(fills(fixture)).toEqual([100, 0]);
    // Full, and in the quieter tone — but only its own bubble, never the next one's.
    expect(overdue(fixture)).toBe(1);
    expect(percent(bubbles(fixture)[1], 'width')).toBeCloseTo(90);
    expect(labels(fixture)).toEqual(['2m 30s / 10s', '1m 30s']);
  });

  /** A finished step is full, and the number beside it is what it really took, not its p95. */
  it('fills a finished bubble whole and shows its real duration', () => {
    const fixture = render([
      { expectedMillis: 90_000, startedAt: ago(300), finishedAt: ago(260) },
      { expectedMillis: 10_000 },
    ]);

    expect(fills(fixture)).toEqual([100, 0]);
    expect(overdue(fixture)).toBe(0);
    expect(labels(fixture)).toEqual(['40s / 1m 30s', '10s']);
  });

  it('fills the step in flight against its own expectation, and nothing else', () => {
    const fixture = render([
      { expectedMillis: 10_000, startedAt: ago(100), finishedAt: ago(90) },
      { expectedMillis: 250_000, startedAt: ago(90) },
      { expectedMillis: 200_000 },
    ]);

    const [first, second, third] = fills(fixture);
    expect(first).toBeCloseTo(100);
    expect(second).toBeCloseTo((90 / 250) * 100);
    expect(third).toBe(0);
    // The epic's own example, spelled out.
    expect(labels(fixture)[1]).toBe('1m 30s / 4m 10s');
    expect(labels(fixture)[2]).toBe('3m 20s');
  });

  /**
   * Past its own expectation the bubble holds at full and shifts tone. Late is a fact about the
   * step, not a wider bubble — and never a reason to borrow room from the step after it.
   */
  it('holds an overrunning step at full, in the overdue tone', () => {
    const fixture = render([{ expectedMillis: 10_000, startedAt: ago(45) }]);

    expect(fills(fixture)).toEqual([100]);
    expect(overdue(fixture)).toBe(1);
    expect(labels(fixture)).toEqual(['45s / 10s']);
    // One step, so no seam at all: it keeps the whole track.
    expect(percent(bubbles(fixture)[0], 'width')).toBeCloseTo(100);
  });

  /** A finished step that took longer than its p95 is still a step that took longer than its p95. */
  it('keeps the overdue tone on a step that finished late', () => {
    const fixture = render([{ expectedMillis: 10_000, startedAt: ago(60), finishedAt: ago(20) }]);
    expect(fills(fixture)).toEqual([100]);
    expect(overdue(fixture)).toBe(1);
    expect(labels(fixture)).toEqual(['40s / 10s']);
  });

  describe('the clock', () => {
    it('ticks once a second while a step is in flight', () => {
      const fixture = render([{ expectedMillis: 250_000, startedAt: ago(90) }]);
      expect(labels(fixture)).toEqual(['1m 30s / 4m 10s']);

      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      expect(labels(fixture)).toEqual(['1m 31s / 4m 10s']);
      expect(fills(fixture)[0]).toBeCloseTo((91 / 250) * 100);
    });

    /** A panel somebody leaves open over a finished run must not become wakeups. */
    it('does not tick at all for a track of finished steps', () => {
      const idle = vi.getTimerCount();
      render([
        { expectedMillis: 10_000, startedAt: ago(60), finishedAt: ago(50) },
        { expectedMillis: 90_000, startedAt: ago(50), finishedAt: ago(5) },
      ]);
      expect(vi.getTimerCount()).toBe(idle);
    });

    it('does not tick at all for a track of unstarted steps', () => {
      const idle = vi.getTimerCount();
      render([{ expectedMillis: 10_000 }, { expectedMillis: 90_000 }]);
      expect(vi.getTimerCount()).toBe(idle);
    });

    /** The clock starts and stops with the input, without anybody saying so. */
    it('starts when a step begins and stops when the last one ends', () => {
      const idle = vi.getTimerCount();
      const fixture = render([{ expectedMillis: 10_000 }]);
      expect(vi.getTimerCount()).toBe(idle);

      fixture.componentInstance.steps.set([{ expectedMillis: 10_000, startedAt: ago(2) }]);
      fixture.detectChanges();
      expect(vi.getTimerCount()).toBe(idle + 1);

      fixture.componentInstance.steps.set([
        { expectedMillis: 10_000, startedAt: ago(2), finishedAt: ago(1) },
      ]);
      fixture.detectChanges();
      expect(vi.getTimerCount()).toBe(idle);
    });

    it('stops the clock when the component goes away', () => {
      const idle = vi.getTimerCount();
      const fixture = render([{ expectedMillis: 250_000, startedAt: ago(90) }]);
      expect(vi.getTimerCount()).toBe(idle + 1);

      fixture.destroy();
      expect(vi.getTimerCount()).toBe(idle);
    });
  });

  describe('accessibility', () => {
    it('is a progressbar over the run as a whole', () => {
      const fixture = render([
        { expectedMillis: 10_000, startedAt: ago(60), finishedAt: ago(50) },
        { expectedMillis: 90_000, startedAt: ago(50) },
      ]);

      const host = fixture.nativeElement.querySelector('qits-step-progress') as HTMLElement;
      expect(host.getAttribute('role')).toBe('progressbar');
      expect(host.getAttribute('aria-valuemin')).toBe('0');
      expect(host.getAttribute('aria-valuemax')).toBe('100');
      expect(host.getAttribute('aria-label')).toBe('Build progress');
      // 10s done of 10s, plus 50s of 90s, over 100s.
      expect(host.getAttribute('aria-valuenow')).toBe('60');
    });

    /** A shape is not something to read out; the numbers under it are. */
    it('hides the bubbles and shows the labels', () => {
      const fixture = render([{ expectedMillis: 10_000, startedAt: ago(5) }]);
      expect(
        (
          fixture.nativeElement.querySelector('.qits-step-progress-bubble') as HTMLElement
        ).getAttribute('aria-hidden'),
      ).toBe('true');
      expect(
        (
          fixture.nativeElement.querySelector('.qits-step-progress-label') as HTMLElement
        ).hasAttribute('aria-hidden'),
      ).toBe(false);
    });

    /** Tone is a class, never an inline colour — the rule `badge.spec.ts` states for the library. */
    it('says its tone with a class and sets no inline colour', () => {
      const fixture = render([{ expectedMillis: 10_000, startedAt: ago(45) }]);
      const fill = fixture.nativeElement.querySelector('.qits-step-progress-fill') as HTMLElement;
      expect(fill.classList.contains('qits-step-progress-overdue')).toBe(true);
      expect(fill.style.background).toBe('');
      expect(fill.style.color).toBe('');
    });
  });

  /** Nothing to be a proportion of, so nothing to draw — and, above all, nothing invented. */
  it('draws nothing for an empty track', () => {
    const fixture = render([]);
    expect(bubbles(fixture)).toEqual([]);
    expect(
      (fixture.nativeElement.querySelector('qits-step-progress') as HTMLElement).getAttribute(
        'aria-valuenow',
      ),
    ).toBe('0');
  });
});
