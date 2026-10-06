import { TestBed } from '@angular/core/testing';

import { QitsReportHighlights } from './report-highlights';

describe('QitsReportHighlights', () => {
  it('draws one chip per highlight, toned by severity', () => {
    const fixture = TestBed.createComponent(QitsReportHighlights);
    fixture.componentRef.setInput('highlights', [
      { severity: 'good', text: 'all 412 tests passed', metric: null, value: null, delta: null },
      { severity: 'bad', text: '2 tests failed', metric: 'failed', value: 2, delta: 2 },
      { severity: 'warn', text: 'coverage −2.1%', metric: 'total', value: 78, delta: -2.1 },
      { severity: 'info', text: 'diff coverage 78%', metric: null, value: 78, delta: null },
      {
        severity: 'odd',
        text: 'a severity from the future',
        metric: null,
        value: null,
        delta: null,
      },
    ]);
    fixture.detectChanges();

    const spans = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li span')];
    expect(spans.map((span) => [span.textContent, [...span.classList].at(-1)])).toEqual([
      ['all 412 tests passed', 'qits-badge-success'],
      ['2 tests failed', 'qits-badge-danger'],
      ['coverage −2.1%', 'qits-badge-warning'],
      ['diff coverage 78%', 'qits-badge-neutral'],
      ['a severity from the future', 'qits-badge-neutral'],
    ]);
  });

  it('draws nothing for no highlights', () => {
    const fixture = TestBed.createComponent(QitsReportHighlights);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('ul')).toBeNull();
  });
});
