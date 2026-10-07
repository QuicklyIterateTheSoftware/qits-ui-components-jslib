import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';

import {
  QITS_ENTITY_CHANGES_KIND,
  QITS_ENTITY_CHANGES_REPORT_KIND,
  QitsEntityChangesReport,
  readEntityChangesPayload,
} from './entity-changes-report';
import {
  CHANGED,
  CI_AFTER,
  CI_BEFORE,
  CURRENT,
  EVERY_STATUS,
  TRUNCATED,
  UNCHANGED,
  entityChangesContext,
  entityChangesReport,
  type EntityChangesState,
} from './fixtures/entity-changes/entity-changes-states';
import { QITS_MERMAID_LOADER, type QitsMermaid } from './mermaid-diagram';
import {
  provideQitsStandardReportKinds,
  QITS_REPORT_KINDS,
  QitsReportsClient,
  type QitsReport,
  type QitsRunReportsDto,
} from './reports';
import { QitsRunReports } from './run-reports';

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function all(fixture: ComponentFixture<unknown>, selector: string): HTMLElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(selector)];
}

function texts(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return all(fixture, selector).map((element) => clean(element.textContent));
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
  all(fixture, selector)[index].click();
  fixture.detectChanges();
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

/** The chip of each unit, as `label/tone`. */
function chips(fixture: ComponentFixture<unknown>): string[] {
  return all(fixture, '.unit-head .status .qits-badge').map(
    (chip) =>
      `${clean(chip.textContent)}/${[...chip.classList].find((c) => c.startsWith('qits-badge-'))?.slice('qits-badge-'.length)}`,
  );
}

function stubMermaid() {
  return {
    initialize: vi.fn<QitsMermaid['initialize']>(),
    render: vi.fn<QitsMermaid['render']>(async (id) => ({ svg: `<svg data-id="${id}"></svg>` })),
  };
}

describe('QitsEntityChangesReport', () => {
  let mermaid: ReturnType<typeof stubMermaid>;
  let load: ReturnType<typeof vi.fn<() => Promise<QitsMermaid>>>;

  function render(state: EntityChangesState): ComponentFixture<QitsEntityChangesReport> {
    mermaid = stubMermaid();
    load = vi.fn(async () => mermaid as QitsMermaid);
    TestBed.configureTestingModule({
      providers: [{ provide: QITS_MERMAID_LOADER, useValue: load }],
    });
    const fixture = TestBed.createComponent(QitsEntityChangesReport);
    fixture.componentRef.setInput('report', state.report);
    fixture.componentRef.setInput('baseline', state.baseline);
    fixture.componentRef.setInput('context', state.context);
    fixture.detectChanges();
    return fixture;
  }

  /** The definitions mermaid was asked to draw, in order. */
  function drawn(): string[] {
    return mermaid.render.mock.calls.map(([, definition]) => definition);
  }

  it('draws every status with its chip: ADDED/CHANGED warning, REMOVED danger, UNCHANGED neutral, CURRENT info', () => {
    const fixture = render(EVERY_STATUS);
    expect(chips(fixture)).toEqual([
      'ADDED/warning',
      'CHANGED/warning',
      'CURRENT/info',
      'REMOVED/danger',
      'UNCHANGED/neutral',
    ]);
    expect(texts(fixture, '.unit-name')).toEqual([
      'eu.wohlben.qits.blobstore.entity',
      'ci',
      'epics',
      'traces',
      'projects',
    ]);
    expect(texts(fixture, '.unit-head .file')).toEqual([
      'docs/database/eu.wohlben.qits.blobstore.entity.md',
      'docs/database/ci.md',
      'docs/database/epics.md',
      'docs/database/traces.md',
      'docs/database/projects.md',
    ]);
  });

  it('shows ADDED and CURRENT as After only, REMOVED as Before only, and collapses UNCHANGED', () => {
    const fixture = render(EVERY_STATUS);
    const sides = (status: string) =>
      all(fixture, `.unit[data-status="${status}"] figure`).map((figure) =>
        figure.classList.contains('before') ? 'before' : 'after',
      );
    expect(sides('ADDED')).toEqual(['after']);
    expect(sides('CURRENT')).toEqual(['after']);
    expect(sides('REMOVED')).toEqual(['before']);
    expect(sides('CHANGED')).toEqual(['before', 'after']);
    expect(sides('UNCHANGED')).toEqual([]);
    expect(has(fixture, '.unit[data-status="CHANGED"] .switch')).toBe(true);
    for (const status of ['ADDED', 'CURRENT', 'REMOVED', 'UNCHANGED'])
      expect(has(fixture, `.unit[data-status="${status}"] .switch`)).toBe(false);
    expect(text(fixture, '.unit[data-status="REMOVED"] .relation-removed')).toBe(
      '− relation trace_span }o--|| ci_run : run_id',
    );
  });

  it('lists the tables added, removed and changed, with the column changes before → after', () => {
    const fixture = render(CHANGED);
    expect(text(fixture, '.tally')).toBe('+1 ~1 −1 tables');
    expect(
      all(fixture, '.table').map(
        (table) =>
          `${table.dataset['status']} ${clean(table.querySelector('.table-name')?.textContent)}`,
      ),
    ).toEqual(['ADDED ci_report', 'REMOVED ci_trace', 'CHANGED ci_step']);
    expect(texts(fixture, '.table[data-status="CHANGED"] .column-changed')).toEqual([
      '~ kind: string, not null, 64 → string, not null, 32',
    ]);
    expect(texts(fixture, '.table[data-status="CHANGED"] .column-added')).toEqual([
      '+ started_at instant, null',
    ]);
    expect(texts(fixture, '.table[data-status="CHANGED"] .column-removed')).toEqual([
      '− legacy_flag boolean, null',
    ]);
    expect(texts(fixture, '.table[data-status="ADDED"] .column-added')).toHaveLength(4);
    expect(texts(fixture, '.table .origin')).toEqual(['from ci', 'from ci', 'from ci']);
    expect(texts(fixture, '.relation-added')).toEqual([
      '+ relation ci_report }o--|| ci_run : run_id',
    ]);
    expect(has(fixture, '.current')).toBe(false);
    expect(has(fixture, '.truncated')).toBe(false);
  });

  it('switches a CHANGED unit between Before, After and both, drawing each with mermaid', async () => {
    const fixture = render(CHANGED);
    const figures = () => texts(fixture, '.diagrams figcaption');
    const pressed = () =>
      all(fixture, '.switch .view').map(
        (button) => `${clean(button.textContent)}:${button.getAttribute('aria-pressed')}`,
      );

    expect(pressed()).toEqual(['Before:false', 'After:false', 'Both:true']);
    expect(figures()).toEqual(['Before · 2026.1003.52637', 'After · this change']);
    await settle(fixture);
    expect(drawn()).toEqual([CI_BEFORE, CI_AFTER]);
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'strict' }),
    );

    click(fixture, '.switch .view', 0);
    expect(pressed()).toEqual(['Before:true', 'After:false', 'Both:false']);
    expect(figures()).toEqual(['Before · 2026.1003.52637']);

    click(fixture, '.switch .view', 1);
    expect(figures()).toEqual(['After · this change']);
    expect(has(fixture, '.diagrams[data-view="after"] qits-mermaid-diagram')).toBe(true);

    click(fixture, '.switch .view', 2);
    expect(figures()).toHaveLength(2);
  });

  it('says CURRENT is the first diagram, lists no changes, and draws After only', async () => {
    const fixture = render(CURRENT);
    expect(text(fixture, '.current')).toBe('No baseline: this is the first diagram.');
    expect(has(fixture, '.changes')).toBe(false);
    expect(has(fixture, '.tally')).toBe(false);
    expect(texts(fixture, 'figcaption')).toEqual(['After · this change']);
    await settle(fixture);
    expect(drawn()).toEqual([CI_AFTER]);
  });

  it('keeps an UNCHANGED unit collapsed — mermaid not even loaded — until asked', async () => {
    const fixture = render(UNCHANGED);
    expect(text(fixture, '.unchanged-toggle')).toBe(
      'Unchanged since 2026.1003.52637: show the diagram',
    );
    expect(has(fixture, 'qits-mermaid-diagram')).toBe(false);
    await settle(fixture);
    expect(load).not.toHaveBeenCalled();

    click(fixture, '.unchanged-toggle');
    expect(all(fixture, '.unchanged-toggle')[0].getAttribute('aria-expanded')).toBe('true');
    await settle(fixture);
    expect(load).toHaveBeenCalledTimes(1);
    expect(drawn()).toEqual([CI_AFTER]);
  });

  it('says plainly when the report was truncated, and where a diagram was dropped', () => {
    const fixture = render(TRUNCATED);
    expect(text(fixture, '.truncated')).toBe(
      'Truncated: the report was over 1 MiB, so the diagrams of unchanged units were left out.',
    );
    click(fixture, '.unchanged-toggle');
    expect(text(fixture, '.unit[data-status="UNCHANGED"] .dropped')).toBe(
      'The diagram was left out of this report.',
    );
  });

  it('shows one line for an unreadable payload, and does not throw', () => {
    for (const payload of [null, 'x', { units: 'not a list' }, []]) {
      let fixture: ComponentFixture<QitsEntityChangesReport> | undefined;
      expect(() => {
        fixture = render({
          report: entityChangesReport('r', payload),
          baseline: null,
          context: entityChangesContext(true),
        });
      }).not.toThrow();
      expect(text(fixture!)).toBe('This entity-changes report could not be read.');
      TestBed.resetTestingModule();
    }
  });

  it('reads leniently: missing lists are empty, nameless entries dropped', () => {
    expect(
      readEntityChangesPayload({
        units: [
          { file: 'docs/database/ci.md', status: 'CHANGED', tables: [{ status: 'ADDED' }] },
          {},
        ],
      }),
    ).toEqual({
      baseline: null,
      units: [
        {
          file: 'docs/database/ci.md',
          unit: 'docs/database/ci.md',
          status: 'CHANGED',
          tables: [],
          relations: { added: [], removed: [] },
          before: null,
          after: null,
        },
      ],
      truncated: false,
    });
  });
});

describe('the entity-changes registration', () => {
  const run: QitsRunReportsDto = {
    runId: 'run-1',
    commitSha: '3f9c2e1a7b5d',
    releaseRequestId: 'rr-1',
    baseline: entityChangesContext(true).baseline,
    reports: [],
  };

  function client(report: QitsReport): Partial<QitsReportsClient> {
    return {
      origin: () => of(''),
      runReports: () => of({ ...run, reports: [{ ...report, payload: undefined } as QitsReport] }),
      report: () => of(report),
      baselineReports: () => of([]),
    };
  }

  function setup(report: QitsReport): ComponentFixture<QitsRunReports> {
    TestBed.configureTestingModule({
      providers: [
        provideQitsStandardReportKinds(),
        { provide: QitsReportsClient, useValue: client(report) },
        {
          provide: QITS_MERMAID_LOADER,
          useValue: async () => stubMermaid() as QitsMermaid,
        },
      ],
    });
    const fixture = TestBed.createComponent(QitsRunReports);
    fixture.componentRef.setInput('runId', 'run-1');
    fixture.detectChanges();
    return fixture;
  }

  it('is entity-changes v1, titled Entities, and among the standard kinds', () => {
    expect(QITS_ENTITY_CHANGES_KIND).toBe('entity-changes');
    expect(QITS_ENTITY_CHANGES_REPORT_KIND).toEqual({
      kind: 'entity-changes',
      versions: [1],
      title: 'Entities',
      component: QitsEntityChangesReport,
    });
    TestBed.configureTestingModule({ providers: [provideQitsStandardReportKinds()] });
    const kinds = TestBed.inject(QITS_REPORT_KINDS);
    expect(kinds.map((kind) => kind.kind)).toEqual([
      'test-results',
      'coverage',
      'contracts',
      'entity-changes',
    ]);
    expect(kinds.find((kind) => kind.kind === 'entity-changes')).toBe(
      QITS_ENTITY_CHANGES_REPORT_KIND,
    );
  });

  it('is drawn by <qits-run-reports> through its outlet, with no other change', () => {
    const report = {
      ...CHANGED.report,
      highlights: [
        {
          severity: 'warn',
          text: 'Entities changed since 2026.1003.52637: +1 ~1 −1 tables',
          metric: null,
          value: null,
          delta: null,
        },
      ],
    };
    const fixture = setup(report);
    expect(text(fixture, 'section.report[data-kind="entity-changes"] .toggle')).toContain(
      'Entities',
    );
    click(fixture, 'section.report[data-kind="entity-changes"] .toggle');
    expect(has(fixture, 'qits-entity-changes-report')).toBe(true);
    expect(texts(fixture, 'qits-entity-changes-report .unit-name')).toEqual(['ci']);
    expect(texts(fixture, 'qits-entity-changes-report .column-changed')).toEqual([
      '~ kind: string, not null, 64 → string, not null, 32',
    ]);
  });

  it('falls back to the highlights for a payload of version 2', () => {
    const report = {
      ...entityChangesReport('r-entities-v2', { units: [] }, 2),
      highlights: [
        {
          severity: 'info',
          text: 'Entity diagram is new: 7 tables in 1 units',
          metric: null,
          value: null,
          delta: null,
        },
      ],
    };
    const fixture = setup(report);
    const section = all(fixture, 'section.report')[0];
    expect(section.textContent).toContain('Entity diagram is new: 7 tables in 1 units');
    expect(section.textContent).toContain('No view for this report kind here.');
    expect(has(fixture, 'qits-entity-changes-report')).toBe(false);
  });
});
