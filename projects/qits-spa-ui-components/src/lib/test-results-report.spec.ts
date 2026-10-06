import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { QitsReport, QitsReportContext } from './reports';
import {
  QITS_TEST_FAILURE_PREVIEW,
  QitsTestResultsReport,
  type QitsTestCoordinates,
  type QitsTestResultsPayload,
} from './test-results-report';

function coordinates(overrides: Partial<QitsTestCoordinates> = {}): QitsTestCoordinates {
  return {
    language: 'java',
    tool: 'surefire',
    repository: { projectId: 'p-1', name: 'qits-ci-service' },
    commitSha: 'abc1234',
    file: 'service/src/test/java/eu/wohlben/qits/ci/api/FooTest.java',
    className: 'eu.wohlben.qits.ci.api.FooTest',
    testName: 'refusesAnotherRunsToken',
    lineStart: null,
    lineEnd: null,
    ...overrides,
  };
}

const PAYLOAD: QitsTestResultsPayload = {
  totals: { tests: 412, passed: 409, failed: 2, errored: 1, skipped: 0, durationMs: 81234 },
  suites: [
    {
      language: 'java',
      tool: 'surefire',
      module: 'service',
      tests: 380,
      failed: 2,
      errored: 1,
      skipped: 0,
      durationMs: 70000,
    },
  ],
  failures: [
    {
      coordinates: coordinates(),
      shape: 'ASSERTION',
      failureType: 'org.opentest4j.AssertionFailedError',
      message: 'expected: <403> but was: <204>\nsecond line',
      stackTrace: 'at eu.wohlben.qits.ci.api.FooTest.refusesAnotherRunsToken(FooTest.java:41)',
      durationMs: 120,
    },
    {
      coordinates: coordinates({
        language: 'typescript',
        tool: 'vitest',
        file: null,
        className: 'QitsRunReports > fallbacks',
        testName: 'says not reported',
      }),
      shape: 'SETUP',
      failureType: null,
      message: null,
      stackTrace: null,
      durationMs: null,
    },
  ],
  truncated: true,
};

function report(payload: unknown): QitsReport {
  return {
    id: 'r-1',
    kind: 'test-results',
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

const CONTEXT: QitsReportContext = {
  runId: 'run-1',
  commitSha: 'abc1234',
  baseline: null,
  ciOrigin: 'https://ci.qits.example',
};

describe('QitsTestResultsReport', () => {
  function render(payload: unknown): ComponentFixture<QitsTestResultsReport> {
    const fixture = TestBed.createComponent(QitsTestResultsReport);
    fixture.componentRef.setInput('report', report(payload));
    fixture.componentRef.setInput('context', CONTEXT);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ComponentFixture<unknown>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function squash(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  it('draws the totals, the suites and one row per failure', () => {
    const fixture = render(PAYLOAD);
    expect(squash(host(fixture).querySelector('.totals')?.textContent)).toBe(
      '412 tests · 409 passed · 2 failed · 1 errored · 0 skipped · 1m 21s',
    );
    expect(squash(host(fixture).querySelector('.suites')?.textContent)).toContain(
      'java · surefire (service) — 380 tests, 2 failed',
    );
    const rows = [...host(fixture).querySelectorAll('tr.failure')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => squash(cell.textContent)),
    );
    expect(rows).toEqual([
      [
        'eu.wohlben.qits.ci.api.FooTest',
        'refusesAnotherRunsToken',
        'ASSERTION',
        'expected: <403> but was: <204>',
        'service/src/test/java/eu/wohlben/qits/ci/api/FooTest.java',
      ],
      [
        'QitsRunReports > fallbacks',
        'says not reported',
        'SETUP',
        'No message',
        'file not resolved',
      ],
    ]);
  });

  it('says when more failures existed than were kept', () => {
    expect(squash(host(render(PAYLOAD)).querySelector('.truncated')?.textContent)).toContain(
      'Only the first 2 failures were kept',
    );
    expect(host(render({ ...PAYLOAD, truncated: false })).querySelector('.truncated')).toBeNull();
  });

  it('expands a failure to its full message and stack, and emits its coordinates', () => {
    const fixture = render(PAYLOAD);
    const opened: QitsTestCoordinates[] = [];
    fixture.componentInstance.failureOpened.subscribe((value) => opened.push(value));

    const button = host(fixture).querySelector<HTMLButtonElement>('button.message')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(host(fixture).querySelector('.full-message')?.textContent).toBe(
      'expected: <403> but was: <204>\nsecond line',
    );
    expect(host(fixture).querySelector('.stack')?.textContent).toContain('FooTest.java:41');
    expect(opened).toEqual([PAYLOAD.failures[0].coordinates]);

    button.click();
    fixture.detectChanges();
    expect(host(fixture).querySelector('tr.detail')).toBeNull();
    expect(opened).toHaveLength(1);
  });

  it('says so when nothing failed, and survives a payload missing its fields', () => {
    const fixture = render({ totals: { tests: 5, passed: 5 } });
    expect(squash(host(fixture).querySelector('.totals')?.textContent)).toBe(
      '5 tests · 5 passed · 0 failed · 0 errored · 0 skipped',
    );
    expect(host(fixture).textContent).toContain('No failing tests.');
    expect(() => render(null)).not.toThrow();
  });

  it('draws qits-755’s preview inside an opened failure, with its coordinates and context', () => {
    @Component({
      selector: 'qits-spec-preview',
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<span class="preview"
        >{{ coordinates().testName }} via {{ context().ciOrigin }}</span
      >`,
    })
    class Preview {
      readonly coordinates = input.required<QitsTestCoordinates>();
      readonly context = input.required<QitsReportContext>();
    }
    TestBed.configureTestingModule({
      providers: [{ provide: QITS_TEST_FAILURE_PREVIEW, useValue: Preview }],
    });
    const fixture = render(PAYLOAD);
    expect(host(fixture).querySelector('.preview')).toBeNull();
    host(fixture).querySelector<HTMLButtonElement>('button.message')!.click();
    fixture.detectChanges();
    expect(host(fixture).querySelector('.preview')?.textContent).toBe(
      'refusesAnotherRunsToken via https://ci.qits.example',
    );
  });
});
