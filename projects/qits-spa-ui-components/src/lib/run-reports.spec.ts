import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { QITS_NAVIGATION, toNavTree, type QitsNavTree } from './navigation';
import {
  provideQitsReportKind,
  provideQitsStandardReportKinds,
  QitsReportsClient,
  type QitsReport,
  type QitsReportContext,
  type QitsReportSummary,
  type QitsRunReportsDto,
} from './reports';
import { QitsRunReports, qitsReportKindFor } from './run-reports';

const CI = 'https://ci.qits.example';
const ORIGINS = { slots: {}, applications: { 'qits-ci': { origin: CI } } };
const RUNS = `${CI}/ci/api/runs`;

function summary(overrides: Partial<QitsReportSummary> = {}): QitsReportSummary {
  return {
    id: 'r-tests',
    kind: 'test-results',
    kindVersion: 1,
    stepIndex: 0,
    highlights: [{ severity: 'bad', text: '2 tests failed', metric: 'failed', value: 2, delta: 2 }],
    baselineRunId: 'run-0',
    baselineVersion: '2026.1003.52637',
    payloadBytes: 512,
    submittedAt: '2026-10-06T10:00:00Z',
    ...overrides,
  };
}

function runReports(reports: QitsReportSummary[], withBaseline = true): QitsRunReportsDto {
  return {
    runId: 'run-1',
    commitSha: 'abc1234',
    releaseRequestId: 'rr-1',
    baseline: withBaseline
      ? { version: '2026.1003.52637', runId: 'run-0', releaseRequestId: 'rr-0', tagSha: 'def5678' }
      : null,
    reports,
  };
}

const TEST_PAYLOAD = {
  totals: { tests: 3, passed: 1, failed: 1, errored: 1, skipped: 0, durationMs: 1200 },
  suites: [],
  failures: [],
  truncated: false,
};

/** A kind nobody in this library knows about — the shape qits-759's pact view will have. */
@Component({
  selector: 'qits-spec-pact-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="pact">
    {{ $any(report().payload).pacts }} new pacts at {{ context().commitSha }}, baseline
    {{ baseline()?.id ?? 'none' }}
  </p>`,
})
class PactReport {
  readonly report = input.required<QitsReport>();
  readonly baseline = input<QitsReport | null>(null);
  readonly context = input.required<QitsReportContext>();
}

describe('QitsRunReports', () => {
  let tree: ReturnType<typeof signal<QitsNavTree | undefined>>;

  function setup(
    providers: (Provider | EnvironmentProviders)[] = [provideQitsStandardReportKinds()],
    answered = true,
  ): ComponentFixture<QitsRunReports> {
    tree = signal<QitsNavTree | undefined>(answered ? toNavTree(ORIGINS) : undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QITS_NAVIGATION, useValue: { tree, failed: signal(false) } },
        ...providers,
      ],
    });
    const fixture = TestBed.createComponent(QitsRunReports);
    fixture.componentRef.setInput('runId', 'run-1');
    fixture.detectChanges();
    return fixture;
  }

  function http(): HttpTestingController {
    return TestBed.inject(HttpTestingController);
  }

  function text(fixture: ComponentFixture<unknown>): string {
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  }

  function toggles(fixture: ComponentFixture<unknown>): HTMLButtonElement[] {
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'button.toggle',
      ),
    ];
  }

  afterEach(() => http().verify());

  it('reads the summaries on qits-ci’s own origin, with the session', () => {
    setup();
    const request = http().expectOne(`${RUNS}/run-1/reports`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush(runReports([]));
  });

  it('asks nothing until the navigation says where qits-ci is', () => {
    const fixture = setup(undefined, false);
    http().expectNone(() => true);
    tree.set(toNavTree(ORIGINS));
    TestBed.tick();
    http().expectOne(`${RUNS}/run-1/reports`).flush(runReports([]));
    fixture.detectChanges();
    expect(text(fixture)).toContain('Not reported.');
  });

  it('makes no request when the runId is bound again unchanged, and one when it changes', () => {
    const fixture = setup();
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush(runReports([summary()]));
    fixture.detectChanges();

    // A host polling every 6 s re-binds the same id on every tick.
    for (let tick = 0; tick < 5; tick++) {
      fixture.componentRef.setInput('runId', `run-${1}`);
      fixture.detectChanges();
    }
    http().expectNone(() => true);

    fixture.componentRef.setInput('runId', 'run-2');
    fixture.detectChanges();
    http().expectOne(`${RUNS}/run-2/reports`).flush(runReports([]));
  });

  it('reads again on reload(), and keeps an open section open', () => {
    const fixture = setup();
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush(runReports([summary()]));
    fixture.detectChanges();
    toggles(fixture)[0].click();
    fixture.detectChanges();
    http()
      .expectOne(`${RUNS}/run-1/reports/r-tests`)
      .flush({ ...summary(), payload: TEST_PAYLOAD });
    http().expectOne(`${RUNS}/run-1/baseline/reports/test-results`).flush([]);

    fixture.componentInstance.reload();
    // The re-submitted report comes back under a new id; the section is the same one.
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush(runReports([summary({ id: 'r-tests-2' })]));
    http()
      .expectOne(`${RUNS}/run-1/reports/r-tests-2`)
      .flush({
        ...summary({ id: 'r-tests-2' }),
        payload: TEST_PAYLOAD,
      });
    http().expectOne(`${RUNS}/run-1/baseline/reports/test-results`).flush([]);
    fixture.detectChanges();
    expect(toggles(fixture)[0].getAttribute('aria-expanded')).toBe('true');
    expect(text(fixture)).toContain('3 tests');
  });

  it('draws every highlight, and fetches a payload only when its section opens', () => {
    const fixture = setup();
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush(
        runReports([
          summary(),
          summary({
            id: 'r-cov',
            kind: 'coverage',
            highlights: [
              { severity: 'warn', text: 'coverage −2.1%', metric: 'total', value: 78, delta: -2.1 },
            ],
          }),
        ]),
      );
    fixture.detectChanges();

    const chips = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('qits-report-highlights.all li'),
    ];
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      '2 tests failed',
      'coverage −2.1%',
    ]);
    expect(
      toggles(fixture).map((button) => button.textContent?.replace(/\W+/g, ' ').trim()),
    ).toEqual(['Tests', 'Coverage']);
    // Closed sections read nothing.
    http().expectNone(() => true);

    toggles(fixture)[1].click();
    fixture.detectChanges();
    const payload = http().expectOne(`${RUNS}/run-1/reports/r-cov`);
    expect(payload.request.withCredentials).toBe(true);
    const baseline = http().expectOne(`${RUNS}/run-1/baseline/reports/coverage`);
    expect(baseline.request.withCredentials).toBe(true);
    payload.flush({
      ...summary({ id: 'r-cov', kind: 'coverage' }),
      payload: {
        sources: [{ language: 'java', tool: 'jacoco' }],
        total: { linesCovered: 78, linesTotal: 100, percent: 78 },
        baselineTotal: { version: '2026.1003.52637', percent: 80.1 },
        diff: null,
        files: [],
      },
    });
    baseline.flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('qits-coverage-report')).not.toBeNull();
    expect(text(fixture)).toContain('Total line coverage 78.0%');
    // The test-results section is still shut, and so still unread.
    expect(fixture.nativeElement.querySelector('qits-test-results-report')).toBeNull();

    // Shut and open again: the payload is already here.
    toggles(fixture)[1].click();
    toggles(fixture)[1].click();
    fixture.detectChanges();
    http().expectNone(() => true);
  });

  it('renders a kind registered with provideQitsReportKind, with no other change', () => {
    const fixture = setup([
      provideQitsStandardReportKinds(),
      provideQitsReportKind({
        kind: 'pacts',
        versions: [1],
        title: 'Pacts',
        component: PactReport,
      }),
    ]);
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush(runReports([summary({ id: 'r-pacts', kind: 'pacts', highlights: [] })]));
    fixture.detectChanges();

    toggles(fixture)[0].click();
    fixture.detectChanges();
    http()
      .expectOne(`${RUNS}/run-1/reports/r-pacts`)
      .flush({ ...summary({ id: 'r-pacts', kind: 'pacts' }), payload: { pacts: 2 } });
    http()
      .expectOne(`${RUNS}/run-1/baseline/reports/pacts`)
      .flush([
        { ...summary({ id: 'b-other-step', kind: 'pacts', stepIndex: 1 }), payload: {} },
        { ...summary({ id: 'b-pacts', kind: 'pacts' }), payload: {} },
      ]);
    fixture.detectChanges();

    expect(toggles(fixture)[0].textContent).toContain('Pacts');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.pact')
        ?.textContent?.replace(/\s+/g, ' '),
    ).toContain('2 new pacts at abc1234, baseline b-pacts');
  });

  it('falls back to the highlights of a kind with no registration, and reads no payload', () => {
    const fixture = setup();
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush(
        runReports([
          summary({
            id: 'r-entities',
            kind: 'entity-diagram',
            highlights: [
              {
                severity: 'info',
                text: '2 entities changed',
                metric: null,
                value: null,
                delta: null,
              },
            ],
          }),
          // A known kind at a version no view here can draw is no different.
          summary({ id: 'r-tests-v2', kindVersion: 2 }),
        ]),
      );
    fixture.detectChanges();

    const sections = [...(fixture.nativeElement as HTMLElement).querySelectorAll('section.report')];
    expect(sections).toHaveLength(2);
    expect(sections[0].textContent).toContain('entity-diagram');
    expect(sections[0].textContent).toContain('2 entities changed');
    expect(sections[0].textContent).toContain('No view for this report kind here.');
    expect(sections[1].textContent).toContain('2 tests failed');
    expect(sections[1].textContent).toContain('No view for this report kind here.');
    expect(toggles(fixture)).toHaveLength(0);
    http().expectNone(() => true);
  });

  it('says "Not reported." for a run with no reports', () => {
    const fixture = setup();
    http().expectOne(`${RUNS}/run-1/reports`).flush(runReports([]));
    fixture.detectChanges();
    expect(text(fixture)).toContain('Not reported.');
  });

  it('shows a muted line when the read fails, and nothing else', () => {
    const fixture = setup();
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush('nope', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    const line = (fixture.nativeElement as HTMLElement).querySelector('p.failed');
    expect(line?.classList).toContain('muted');
    expect(line?.textContent).toContain('could not be read');
  });

  it('keeps a section whose payload read failed to one muted line, and draws without a baseline', () => {
    const fixture = setup();
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush(runReports([summary({ baselineRunId: null, baselineVersion: null })], false));
    fixture.detectChanges();
    toggles(fixture)[0].click();
    fixture.detectChanges();
    // No baseline anywhere: nothing to ask for.
    http()
      .expectOne(`${RUNS}/run-1/reports/r-tests`)
      .flush('gone', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(text(fixture)).toContain('This report could not be read.');
  });

  it('heads each section with its step where the run reported from several', () => {
    const fixture = setup();
    http()
      .expectOne(`${RUNS}/run-1/reports`)
      .flush(runReports([summary(), summary({ id: 'r-tests-1', stepIndex: 1 })]));
    fixture.detectChanges();
    expect(toggles(fixture).map((button) => button.textContent?.trim())).toEqual([
      expect.stringContaining('Tests · step 0'),
      expect.stringContaining('Tests · step 1'),
    ]);
  });
});

describe('QitsReportsClient', () => {
  it('reads the baseline and its reports on qits-ci’s origin, with the session', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: QITS_NAVIGATION,
          useValue: { tree: signal(toNavTree(ORIGINS)), failed: signal(false) },
        },
      ],
    });
    const client = TestBed.inject(QitsReportsClient);
    const http = TestBed.inject(HttpTestingController);

    let baseline: unknown = 'unset';
    client.baseline('run 1').subscribe((value) => (baseline = value));
    const one = http.expectOne(`${RUNS}/run%201/baseline`);
    expect(one.request.withCredentials).toBe(true);
    one.flush({ baseline: null });
    expect(baseline).toBeNull();

    let reports: unknown;
    client.baselineReports('run-1', 'coverage').subscribe((value) => (reports = value));
    const two = http.expectOne(`${RUNS}/run-1/baseline/reports/coverage`);
    expect(two.request.withCredentials).toBe(true);
    two.flush([]);
    expect(reports).toEqual([]);
    http.verify();
  });

  it('goes same-origin, still with the session, where no navigation is provided', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(QitsReportsClient).report('run-1', 'r-1').subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/ci/api/runs/run-1/reports/r-1',
    );
    expect(request.request.withCredentials).toBe(true);
    request.flush({});
  });
});

describe('qitsReportKindFor', () => {
  const view = PactReport;
  it('picks the last registration listing the version, and nothing for an unlisted one', () => {
    const first = { kind: 'coverage', versions: [1], title: 'A', component: view };
    const second = { kind: 'coverage', versions: [1, 2], title: 'B', component: view };
    expect(qitsReportKindFor([first, second], 'coverage', 1)?.title).toBe('B');
    expect(qitsReportKindFor([first, second], 'coverage', 3)).toBeUndefined();
    expect(qitsReportKindFor([first], 'pacts', 1)).toBeUndefined();
  });
});
