import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  QitsCoverageReport,
  qitsLineRanges,
  qitsPointsDelta,
  type QitsCoveragePayload,
} from './coverage-report';
import type { QitsReport } from './reports';

const PAYLOAD: QitsCoveragePayload = {
  sources: [{ language: 'java', tool: 'jacoco' }],
  total: { linesCovered: 8120, linesTotal: 10031, percent: 80.95 },
  baselineTotal: { version: '2026.1003.52637', percent: 81.4 },
  diff: {
    baselineVersion: '2026.1003.52637',
    linesChanged: 50,
    linesCovered: 39,
    percent: 78.0,
    uncovered: [
      {
        file: 'ci/src/main/java/eu/wohlben/qits/ci/control/CiReportStore.java',
        ranges: [
          [41, 44],
          [90, 90],
        ],
      },
    ],
  },
  files: [],
};

function report(payload: unknown): QitsReport {
  return {
    id: 'r-1',
    kind: 'coverage',
    kindVersion: 1,
    stepIndex: 0,
    highlights: [],
    baselineRunId: null,
    baselineVersion: null,
    payloadBytes: 1,
    submittedAt: '2026-10-06T10:00:00Z',
    payload,
  };
}

describe('QitsCoverageReport', () => {
  function render(payload: unknown): ComponentFixture<QitsCoverageReport> {
    const fixture = TestBed.createComponent(QitsCoverageReport);
    fixture.componentRef.setInput('report', report(payload));
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<unknown>, selector: string): string {
    return ((fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('draws the total with its delta, diff coverage and the uncovered ranges', () => {
    const fixture = render(PAYLOAD);
    expect(text(fixture, '.total')).toBe(
      'Total line coverage 81.0% (8120/10031 lines) −0.5 vs 2026.1003.52637',
    );
    expect(text(fixture, '.delta')).toContain('−0.5');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.delta')?.classList.contains('down'),
    ).toBe(true);
    expect(text(fixture, '.sources')).toBe('From java · jacoco');
    expect(text(fixture, '.diff')).toBe(
      'Diff coverage 78.0% (39/50 changed lines covered, vs 2026.1003.52637)',
    );
    expect(text(fixture, '.uncovered li')).toBe(
      'ci/src/main/java/eu/wohlben/qits/ci/control/CiReportStore.java: 41–44, 90',
    );
    expect(text(fixture, '.no-baseline')).toBe('');
  });

  it('says "No baseline" plainly when diff is null', () => {
    const fixture = render({ ...PAYLOAD, diff: null, baselineTotal: null });
    expect(text(fixture, '.no-baseline')).toContain('No baseline');
    expect(text(fixture, '.diff')).toBe('');
    // baselineTotal: null — no delta, and it says so.
    expect(text(fixture, '.delta')).toBe('');
    expect(text(fixture, '.no-baseline-total')).toContain('no baseline total');
    expect(text(fixture, '.total')).toContain('Total line coverage 81.0%');
  });

  it('keeps diff coverage where only the baseline total is missing', () => {
    const fixture = render({ ...PAYLOAD, baselineTotal: null });
    expect(text(fixture, '.diff')).toContain('Diff coverage 78.0%');
    expect(text(fixture, '.no-baseline-total')).toContain('no baseline total');
  });

  it('says when no coverable line changed, and survives a payload missing its fields', () => {
    const fixture = render({
      ...PAYLOAD,
      diff: { ...PAYLOAD.diff, linesChanged: 0, linesCovered: 0, percent: null, uncovered: [] },
    });
    expect(text(fixture, '.diff')).toContain('Diff coverage —');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No coverable line changed.',
    );
    expect(() => render(null)).not.toThrow();
    expect(text(render({}), '.total')).toContain('Total line coverage —');
  });
});

describe('coverage formatting', () => {
  it('spells a delta in points with its sign', () => {
    expect(qitsPointsDelta(-2.14)).toBe('−2.1');
    expect(qitsPointsDelta(0.4)).toBe('+0.4');
    expect(qitsPointsDelta(0.01)).toBe('±0.0');
  });

  it('spells ranges, a one-line range as its one number', () => {
    expect(
      qitsLineRanges([
        [41, 44],
        [90, 90],
      ]),
    ).toBe('41–44, 90');
    expect(qitsLineRanges(null)).toBe('');
  });
});
