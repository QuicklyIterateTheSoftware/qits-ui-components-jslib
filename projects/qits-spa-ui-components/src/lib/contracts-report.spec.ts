import { signal, type Provider } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';

import { QITS_CONTRACTS_REPORT_KIND, QitsContractsReport } from './contracts-report';
import {
  FULL_DIFF,
  NO_BASELINE,
  PROVIDER_ABSENT,
  TRUNCATED,
  contractsContext,
  contractsReport,
  type ContractsState,
} from './fixtures/contracts/contracts-states';
import { QITS_NAVIGATION, toNavTree } from './navigation';
import {
  provideQitsStandardReportKinds,
  QITS_REPORT_KINDS,
  QitsReportsClient,
  type QitsRunReportsDto,
} from './reports';
import { QitsRunReports } from './run-reports';
import { QITS_SCOPE, type QitsScope } from './scope';

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function texts(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll(selector)].map((element) =>
    clean(element.textContent),
  );
}

function text(fixture: ComponentFixture<unknown>, selector?: string): string {
  return selector
    ? texts(fixture, selector).join(' | ')
    : clean((fixture.nativeElement as HTMLElement).textContent);
}

function has(fixture: ComponentFixture<unknown>, selector: string): boolean {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) !== null;
}

function click(fixture: ComponentFixture<unknown>, selector: string, index = 0): void {
  const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
    selector,
  );
  buttons[index].click();
  fixture.detectChanges();
}

describe('QitsContractsReport', () => {
  function render(
    state: ContractsState,
    providers: Provider[] = [],
  ): ComponentFixture<QitsContractsReport> {
    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(QitsContractsReport);
    fixture.componentRef.setInput('report', state.report);
    fixture.componentRef.setInput('baseline', state.baseline);
    fixture.componentRef.setInput('context', state.context);
    fixture.detectChanges();
    return fixture;
  }

  it('without a baseline says so and shows the inventory only', () => {
    const fixture = render(NO_BASELINE);
    expect(text(fixture, '.no-baseline')).toBe('No baseline — showing the inventory.');
    for (const section of ['.new', '.removed', '.changed'])
      expect(has(fixture, section)).toBe(false);
    expect(has(fixture, '.provider-absent')).toBe(false);
    expect(text(fixture, '.inventory-toggle')).toBe(
      'Inventory: 4 pacts, 7 interactions, 2 provider states',
    );
  });

  it('against the shared fixture names what is new, removed and changed', () => {
    const fixture = render(FULL_DIFF);
    expect(has(fixture, '.no-baseline')).toBe(false);

    expect(texts(fixture, '.new .new-pair')).toEqual([
      'consumer qits-workspaces-service → qits-edge-service',
      'provider qits-projects-service → qits-workspaces-service',
    ]);
    expect(texts(fixture, '.new .new-state')).toEqual(['provider state a workspace is stopped']);
    expect(texts(fixture, '.new .group-head')).toEqual([
      'consumer qits-workspaces-service → qits-edge-service',
      'consumer qits-workspaces-service → qits-projects-service',
      'provider qits-landing-app → qits-workspaces-service',
      'provider qits-projects-service → qits-workspaces-service',
    ]);
    expect(texts(fixture, '.new .interaction')).toContain(
      'createEntity: creates an entity POST /projects/api/projects/qits/entities given a campaign exists, a project exists',
    );
    expect(texts(fixture, '.new .interaction')).toContain(
      'stopWorkspace: stops a workspace POST /workspaces/api/workspaces/w-1/stop given a workspace is running verification failed',
    );

    expect(texts(fixture, '.removed .removed-pair')).toEqual([
      'consumer qits-workspaces-service → qits-githost-service',
    ]);
    expect(texts(fixture, '.removed .removed-state')).toEqual([
      'provider state an archived workspace',
    ]);
    expect(has(fixture, '.removed .removed-state qits-badge')).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.removed-state .qits-badge')
        ?.classList.contains('qits-badge-warning'),
    ).toBe(true);
    expect(texts(fixture, '.removed .interaction')).toEqual([
      'getBranch: reads a branch GET /githost/api/repositories/qits/branches/main given a repository exists',
      'listArchived: lists archived entities GET /projects/api/projects/qits/entities?archived=true given a project exists, an archived project',
    ]);

    expect(texts(fixture, '.changed .group-head')).toEqual([
      'consumer qits-workspaces-service → qits-projects-service',
    ]);
    expect(texts(fixture, '.changed .interaction')).toEqual([
      'getProject: reads a project GET /projects/api/projects/qits given a project exists',
    ]);
    expect(texts(fixture, '.skipped li')).toEqual([
      'Skipped pacts/broken.json: not a pact: no consumer',
    ]);
  });

  it('keeps the inventory collapsed until asked, then expands a pact to its interactions', () => {
    const fixture = render(FULL_DIFF);
    expect(has(fixture, '.inventory-body')).toBe(false);
    click(fixture, '.inventory-toggle');
    expect(texts(fixture, '.inventory h5')).toEqual([
      'Provider states of qits-workspaces',
      'As consumer',
      'As provider',
    ]);
    expect(texts(fixture, '.provider-states li')).toEqual([
      'a workspace is running getWorkspace, stopWorkspace',
      'a workspace is stopped startWorkspace',
    ]);
    expect(texts(fixture, '.pact-toggle')).toEqual([
      'qits-workspaces-service → qits-edge-service',
      'qits-workspaces-service → qits-projects-service',
      'qits-landing-app → qits-workspaces-service',
      'qits-projects-service → qits-workspaces-service',
    ]);
    expect(texts(fixture, '.pact .count')).toEqual([
      '1 interaction',
      '3 interactions',
      '2 interactions',
      '1 interaction',
    ]);
    expect(texts(fixture, '.pact .failed')).toEqual(['1 failed verification']);
    expect(has(fixture, '.pact .interactions')).toBe(false);

    click(fixture, '.pact-toggle', 2);
    expect(texts(fixture, '.pact .interaction')).toHaveLength(2);
    expect(texts(fixture, '.failed-interaction')).toEqual([
      'stopWorkspace: stops a workspace POST /workspaces/api/workspaces/w-1/stop given a workspace is running verification failed',
    ]);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.failed-interaction .qits-badge')
        ?.classList.contains('qits-badge-danger'),
    ).toBe(true);
  });

  it('says plainly when the provider side was not reported, and removes nothing on it', () => {
    const fixture = render(PROVIDER_ABSENT);
    expect(text(fixture, '.provider-absent')).toBe('Provider side not reported in this run.');
    expect(texts(fixture, '.new .new-pair')).toEqual([
      'consumer qits-workspaces-service → qits-edge-service',
    ]);
    expect(text(fixture, '.removed')).not.toContain('provider qits-landing-app');
    expect(texts(fixture, '.removed .removed-pair')).toEqual([
      'consumer qits-workspaces-service → qits-githost-service',
    ]);
  });

  it('says plainly when the report was truncated', () => {
    const fixture = render(TRUNCATED);
    expect(text(fixture, '.truncated')).toContain('only the first 2,000 interactions');
  });

  it('hides Removed when nothing was removed, and says when nothing is new', () => {
    const fixture = render({
      report: FULL_DIFF.report,
      baseline: FULL_DIFF.report,
      context: contractsContext(true),
    });
    expect(has(fixture, '.removed')).toBe(false);
    expect(has(fixture, '.changed')).toBe(false);
    expect(text(fixture, '.nothing-new')).toBe('Nothing new since 2026.1006.201216.');
  });

  it('shows one line for an unreadable payload, and does not throw', () => {
    for (const payload of [null, 'x', { pacts: 'not a list' }, { sides: {}, pacts: {} }]) {
      let fixture: ComponentFixture<QitsContractsReport> | undefined;
      expect(() => {
        fixture = render({
          report: contractsReport('r', payload),
          baseline: FULL_DIFF.baseline,
          context: contractsContext(true),
        });
      }).not.toThrow();
      expect(text(fixture!)).toBe('This contracts report could not be read.');
      TestBed.resetTestingModule();
    }
  });

  it('treats an unreadable baseline as no baseline', () => {
    const fixture = render({
      ...FULL_DIFF,
      baseline: contractsReport('r-0', { nonsense: true }),
    });
    expect(text(fixture, '.no-baseline')).toBe('No baseline — showing the inventory.');
  });

  describe('a pact’s source', () => {
    const scope: QitsScope = {
      project: 'qits',
      group: 'qits-workspaces',
      repository: 'qits-workspaces-service',
    };
    const providers: Provider[] = [
      {
        provide: QITS_NAVIGATION,
        useValue: {
          tree: signal(
            toNavTree({
              slots: {},
              applications: { 'qits-githost': { origin: 'https://githost.qits.example' } },
            }),
          ),
          failed: signal(false),
        },
      },
      {
        provide: QITS_SCOPE,
        useValue: {
          scope: signal(scope),
          projectId: signal('p-qits'),
          repositoryId: signal('r-ws'),
        },
      },
    ];

    function sources(
      fixture: ComponentFixture<unknown>,
    ): { tag: string; text: string; href: string | null }[] {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.source')].map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: clean(el.textContent),
        href: el.getAttribute('href'),
      }));
    }

    it('links a committed pact file at the fold sha, and leaves a generated report as text', () => {
      const fixture = render(FULL_DIFF, providers);
      click(fixture, '.inventory-toggle');
      const drawn = sources(fixture);
      const committed = drawn.find((entry) =>
        entry.text.startsWith('pacts/qits-workspaces-service_qits-edge'),
      );
      expect(committed?.tag).toBe('a');
      expect(committed?.href).toContain(
        'branches/3f9c2e1a7b5d?path=pacts/qits-workspaces-service_qits-edge-service.json',
      );
      expect(committed?.href).toContain('qits-workspaces-service');
      const generated = drawn.filter((entry) => entry.text.startsWith('.qits-reports/'));
      expect(generated.length).toBeGreaterThan(0);
      expect(generated.every((entry) => entry.tag === 'span')).toBe(true);
    });

    it('is plain text where the page names no repository', () => {
      const fixture = render(FULL_DIFF);
      click(fixture, '.inventory-toggle');
      expect(sources(fixture).every((entry) => entry.tag === 'span')).toBe(true);
    });
  });
});

describe('the contracts registration', () => {
  it('is contracts v1, titled Contracts, and among the standard kinds', () => {
    expect(QITS_CONTRACTS_REPORT_KIND).toEqual({
      kind: 'contracts',
      versions: [1],
      title: 'Contracts',
      component: QitsContractsReport,
    });
    TestBed.configureTestingModule({ providers: [provideQitsStandardReportKinds()] });
    const kinds = TestBed.inject(QITS_REPORT_KINDS);
    expect(kinds.map((kind) => kind.kind)).toEqual(['test-results', 'coverage', 'contracts']);
    expect(kinds.find((kind) => kind.kind === 'contracts')).toBe(QITS_CONTRACTS_REPORT_KIND);
  });

  it('is drawn by <qits-run-reports> through its outlet, with no other change', () => {
    const run: QitsRunReportsDto = {
      runId: 'run-1',
      commitSha: '3f9c2e1a7b5d',
      releaseRequestId: 'rr-1',
      baseline: contractsContext(true).baseline,
      reports: [{ ...FULL_DIFF.report, highlights: [] }],
    };
    const client: Partial<QitsReportsClient> = {
      origin: () => of(''),
      runReports: () => of(run),
      report: () => of(FULL_DIFF.report),
      baselineReports: () => of([FULL_DIFF.baseline!]),
    };
    TestBed.configureTestingModule({
      providers: [
        provideQitsStandardReportKinds(),
        { provide: QitsReportsClient, useValue: client },
      ],
    });
    const fixture = TestBed.createComponent(QitsRunReports);
    fixture.componentRef.setInput('runId', 'run-1');
    fixture.detectChanges();
    expect(text(fixture, 'section.report[data-kind="contracts"] .toggle')).toContain('Contracts');

    click(fixture, 'section.report[data-kind="contracts"] .toggle');
    expect(has(fixture, 'qits-contracts-report')).toBe(true);
    expect(texts(fixture, 'qits-contracts-report .new .new-pair')).toEqual([
      'consumer qits-workspaces-service → qits-edge-service',
      'provider qits-projects-service → qits-workspaces-service',
    ]);
  });
});
