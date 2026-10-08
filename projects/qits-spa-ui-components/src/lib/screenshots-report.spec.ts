import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';

import {
  CHANGED_NARROW,
  EVERY_STATUS,
  NAV_CLOSED_PATH,
  NEW_SCHEDULE,
  NO_BASELINE,
  NO_REPOSITORY,
  RENDERER_CHANGED,
  REMOVED_LEGACY,
  SCREENSHOTS_BASELINE_SHA,
  SCREENSHOTS_HEAD_SHA,
  SCREENSHOTS_REPOSITORY_ID,
  SHELL_CLOSED_PATH,
  TRUNCATED,
  screenshotsContext,
  screenshotsReport,
  type ScreenshotsState,
} from './fixtures/screenshots/screenshots-states';
import {
  provideQitsScreenshotsReportKind,
  provideQitsStandardReportKinds,
  QITS_REPORT_KINDS,
  QitsReportsClient,
  type QitsReport,
  type QitsRunReportsDto,
} from './reports';
import { QitsRepositoryRawClient } from './repository-raw';
import { QitsRunReports } from './run-reports';
import { QITS_IMAGE_DECODER, type QitsImageDataLike } from './screenshot-diff';
import { QITS_SCREENSHOTS_REPORT_KIND, QitsScreenshotsReport } from './screenshots-report';
import { asScreenshotsPayload, QITS_SCREENSHOTS_KIND } from './screenshots-report.model';

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
  const element = all(fixture, selector)[index];
  if (!element) throw new Error(`nothing matches ${selector}`);
  element.click();
  fixture.detectChanges();
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function rowSelector(path: string): string {
  return `li.row[data-path="${path}"]`;
}

/** A `width × height` white image, with `changed` pixels of the first row painted black. */
function pixels(width: number, height: number, changed = 0): QitsImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 0; i < changed; i++) data.set([0, 0, 0, 255], i * 4);
  return { width, height, data };
}

describe('QitsScreenshotsReport', () => {
  let reads: [string, string, string][];
  let failing: Set<string>;
  let decoded: (blob: string) => QitsImageDataLike;
  let created: string[];
  let revoked: string[];
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    reads = [];
    failing = new Set();
    created = [];
    revoked = [];
    decoded = (blob) =>
      blob.startsWith(SCREENSHOTS_HEAD_SHA) ? pixels(10, 10, 2) : pixels(10, 10);
    URL.createObjectURL = () => {
      const url = `blob:test/${created.length}`;
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => void revoked.push(url);
  });

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  function render(state: ScreenshotsState): ComponentFixture<QitsScreenshotsReport> {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: QitsRepositoryRawClient,
          useValue: {
            raw: async (repositoryId: string, rev: string, path: string) => {
              reads.push([repositoryId, rev, path]);
              if (failing.has(path)) throw new Error('503');
              return new Blob([`${rev}:${path}`]);
            },
          } satisfies Pick<QitsRepositoryRawClient, 'raw'>,
        },
        {
          provide: QITS_IMAGE_DECODER,
          useValue: async (blob: Blob) => decoded(await blob.text()),
        },
      ],
    });
    const fixture = TestBed.createComponent(QitsScreenshotsReport);
    fixture.componentRef.setInput('report', state.report);
    fixture.componentRef.setInput('baseline', state.baseline);
    fixture.componentRef.setInput('context', state.context);
    fixture.detectChanges();
    return fixture;
  }

  it('reads nothing on render, and every row starts collapsed', async () => {
    const fixture = render(EVERY_STATUS);
    await settle(fixture);
    expect(reads).toEqual([]);
    expect(has(fixture, 'img')).toBe(false);
    expect(
      all(fixture, '.row-toggle').every((row) => row.getAttribute('aria-expanded') === 'false'),
    ).toBe(true);
  });

  it('opens a CHANGED row with exactly two reads — baseline commit and fold — and re-opens it with none', async () => {
    const fixture = render(EVERY_STATUS);
    const row = rowSelector(CHANGED_NARROW.path);
    click(fixture, `${row} .row-toggle`);
    await settle(fixture);
    expect(reads).toEqual([
      [SCREENSHOTS_REPOSITORY_ID, SCREENSHOTS_BASELINE_SHA, CHANGED_NARROW.path],
      [SCREENSHOTS_REPOSITORY_ID, SCREENSHOTS_HEAD_SHA, CHANGED_NARROW.path],
    ]);
    expect(texts(fixture, `${row} figcaption`)).toEqual([
      'Before · 2026.1006.93346',
      'After · fold 7e3d9c1',
    ]);
    expect(all(fixture, `${row} img.shot`).map((img) => img.getAttribute('src'))).toEqual([
      'blob:test/0',
      'blob:test/1',
    ]);
    expect(text(fixture, `${row} .stats`)).toBe('2 px differ (2.0 %)');
    expect(
      all(fixture, `${row} .mode`).map(
        (mode) => `${clean(mode.textContent)}:${mode.getAttribute('aria-pressed')}`,
      ),
    ).toEqual(['Side by side:true', 'Diff:false', 'Onion:false']);

    click(fixture, `${row} .row-toggle`);
    expect(revoked).toEqual(['blob:test/0', 'blob:test/1']);
    expect(has(fixture, `${row} img`)).toBe(false);

    click(fixture, `${row} .row-toggle`);
    await settle(fixture);
    expect(reads).toHaveLength(2);
    expect(all(fixture, `${row} img.shot`)).toHaveLength(2);
  });

  it('draws the Diff on a canvas and the Onion with an opacity slider', async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null as never);
    const fixture = render(EVERY_STATUS);
    const row = rowSelector(CHANGED_NARROW.path);
    click(fixture, `${row} .row-toggle`);
    await settle(fixture);

    click(fixture, `${row} .mode[data-mode="diff"]`);
    const canvas = all(fixture, `${row} canvas`)[0] as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([10, 10]);
    expect(getContext).toHaveBeenCalled();
    expect(has(fixture, `${row} img`)).toBe(false);

    click(fixture, `${row} .mode[data-mode="onion"]`);
    expect(all(fixture, `${row} .onion img`)).toHaveLength(2);
    const over = all(fixture, `${row} .onion img.over`)[0];
    expect(over.style.opacity).toBe('0.5');
    const slider = all(fixture, `${row} input.onion-opacity`)[0] as HTMLInputElement;
    slider.value = '80';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(all(fixture, `${row} .onion img.over`)[0].style.opacity).toBe('0.8');
    expect(reads).toHaveLength(2);
    getContext.mockRestore();
  });

  it('says a re-encoded image is pixel-identical, and a resized one changed size', async () => {
    decoded = (blob) => (blob.startsWith(SCREENSHOTS_HEAD_SHA) ? pixels(10, 10) : pixels(10, 10));
    let fixture = render(EVERY_STATUS);
    click(fixture, `${rowSelector(CHANGED_NARROW.path)} .row-toggle`);
    await settle(fixture);
    expect(text(fixture, '.stats')).toBe('Pixel-identical: only the encoding changed');
    TestBed.resetTestingModule();

    decoded = (blob) =>
      blob.startsWith(SCREENSHOTS_HEAD_SHA) ? pixels(1280, 904) : pixels(1280, 720);
    fixture = render(EVERY_STATUS);
    click(fixture, `${rowSelector(CHANGED_NARROW.path)} .row-toggle`);
    await settle(fixture);
    expect(texts(fixture, '.stats')).toEqual([
      '235,520 px differ (20.4 %)',
      'Size changed 1280×720 → 1280×904',
    ]);
  });

  it('leaves the side by side and says "diff unavailable" when an image cannot be decoded', async () => {
    decoded = () => {
      throw new Error('not a PNG');
    };
    const fixture = render(EVERY_STATUS);
    const row = rowSelector(CHANGED_NARROW.path);
    click(fixture, `${row} .row-toggle`);
    await settle(fixture);
    expect(text(fixture, `${row} .diff-unavailable`)).toBe('diff unavailable');
    expect(all(fixture, `${row} .pair img.shot`)).toHaveLength(2);
    expect((all(fixture, `${row} .mode[data-mode="diff"]`)[0] as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('opens a NEW row with one read, at the fold', async () => {
    const fixture = render(EVERY_STATUS);
    click(fixture, `${rowSelector(NEW_SCHEDULE.path)} .row-toggle`);
    await settle(fixture);
    expect(reads).toEqual([[SCREENSHOTS_REPOSITORY_ID, SCREENSHOTS_HEAD_SHA, NEW_SCHEDULE.path]]);
    expect(texts(fixture, `${rowSelector(NEW_SCHEDULE.path)} figcaption`)).toEqual([
      'After · fold 7e3d9c1',
    ]);
    expect(has(fixture, `${rowSelector(NEW_SCHEDULE.path)} .modes`)).toBe(false);
  });

  it('lists a REMOVED row’s path and reads its last image only when asked', async () => {
    const fixture = render(EVERY_STATUS);
    const row = rowSelector(REMOVED_LEGACY.path);
    click(fixture, `${row} .row-toggle`);
    await settle(fixture);
    expect(reads).toEqual([]);
    expect(text(fixture, `${row} .removed-path`)).toBe(REMOVED_LEGACY.path);
    click(fixture, `${row} .show-last`);
    await settle(fixture);
    expect(reads).toEqual([
      [SCREENSHOTS_REPOSITORY_ID, SCREENSHOTS_BASELINE_SHA, REMOVED_LEGACY.path],
    ]);
    expect(all(fixture, `${row} img.shot`)).toHaveLength(1);
  });

  it('heads the report with the baseline, the fold and the totals, and groups by status and spec', () => {
    const fixture = render(EVERY_STATUS);
    expect(text(fixture, '.against')).toBe('against 2026.1006.93346 (b4a5e1f) → fold 7e3d9c1');
    expect(text(fixture, '.totals')).toBe(
      '40 screenshots: 2 new, 3 changed, 2 removed, 35 unchanged',
    );
    expect(texts(fixture, '.group-title')).toEqual(['New 2', 'Changed 3', 'Removed 2']);
    expect(texts(fixture, '.group[data-status="CHANGED"] .spec')).toEqual([
      'src/app/layout/shell/shell.layout.browser.spec.ts',
      'src/app/work/work-item.page.browser.spec.ts',
    ]);
    expect(texts(fixture, `${rowSelector(CHANGED_NARROW.path)} .row-toggle`)).toEqual([
      '▸ narrow-open chromium · linux 11.3 KB → 11.7 KB',
    ]);
    expect(text(fixture, `${rowSelector(SHELL_CLOSED_PATH)} .move`)).toBe(
      `same image as removed ${NAV_CLOSED_PATH}`,
    );
    expect(text(fixture, `${rowSelector(NAV_CLOSED_PATH)} .move`)).toBe(
      `moved to ${SHELL_CLOSED_PATH}`,
    );
    expect(has(fixture, '.renderer')).toBe(false);
    expect(has(fixture, '.truncated')).toBe(false);
  });

  it('omits a section whose count is zero, and says when there is no baseline', () => {
    const fixture = render(NO_BASELINE);
    expect(texts(fixture, '.group-title')).toEqual(['New 3']);
    expect(text(fixture, '.against')).toBe('No baseline to compare');
    expect(has(fixture, '.group[data-status="CHANGED"]')).toBe(false);
    expect(has(fixture, '.group[data-status="REMOVED"]')).toBe(false);
  });

  it('shows the renderer banner only when the fingerprint changed', () => {
    const fixture = render(RENDERER_CHANGED);
    expect(texts(fixture, '.renderer-entry')).toEqual([
      'chromium: Google Chrome for Testing 152.0.7390.54 → Google Chrome for Testing 153.0.7412.12',
      'playwright: 1.58.0 → 1.59.1',
      'fonts-noto-color-emoji: (absent) → 2.047-1',
    ]);
    expect(text(fixture, '.renderer')).toContain(
      'Every screenshot may differ for this reason alone.',
    );
  });

  it('says how much a truncated list left out', () => {
    const fixture = render(TRUNCATED);
    expect(text(fixture, '.truncated')).toBe('Only the first 1000 of 1302 are listed.');
    expect(texts(fixture, '.group-title')).toEqual(['New 400', 'Changed 900', 'Removed 2']);
  });

  it('says images are unavailable in a row when the report names no repository, and reads nothing', async () => {
    const fixture = render(NO_REPOSITORY);
    click(fixture, `${rowSelector(CHANGED_NARROW.path)} .row-toggle`);
    click(fixture, `${rowSelector(NEW_SCHEDULE.path)} .row-toggle`);
    await settle(fixture);
    expect(texts(fixture, '.unavailable')).toEqual([
      'Images unavailable: the report names no repository',
      'Images unavailable: the report names no repository',
    ]);
    expect(reads).toEqual([]);
  });

  it('says a failed read in its row, and the rest of the report carries on', async () => {
    failing.add(CHANGED_NARROW.path);
    const fixture = render(EVERY_STATUS);
    const row = rowSelector(CHANGED_NARROW.path);
    click(fixture, `${row} .row-toggle`);
    await settle(fixture);
    expect(texts(fixture, `${row} .read-failed`)).toEqual([
      'Could not read this image from the git host.',
      'Could not read this image from the git host.',
    ]);
    expect(has(fixture, `${row} .stats`)).toBe(false);
    click(fixture, `${rowSelector(NEW_SCHEDULE.path)} .row-toggle`);
    await settle(fixture);
    expect(all(fixture, `${rowSelector(NEW_SCHEDULE.path)} img.shot`)).toHaveLength(1);
  });

  it('revokes every object URL it still holds when destroyed', async () => {
    const fixture = render(EVERY_STATUS);
    click(fixture, `${rowSelector(CHANGED_NARROW.path)} .row-toggle`);
    click(fixture, `${rowSelector(NEW_SCHEDULE.path)} .row-toggle`);
    await settle(fixture);
    expect(created).toHaveLength(3);
    fixture.destroy();
    expect([...revoked].sort()).toEqual([...created].sort());
  });

  it('shows one line for an unreadable payload, and does not throw', () => {
    for (const payload of [null, 'x', { entries: 'not a list' }, []]) {
      let fixture: ComponentFixture<QitsScreenshotsReport> | undefined;
      expect(() => {
        fixture = render({
          report: screenshotsReport('r', payload),
          baseline: null,
          context: screenshotsContext(),
        });
      }).not.toThrow();
      expect(text(fixture!)).toBe('This screenshots report could not be read.');
      TestBed.resetTestingModule();
    }
  });
});

describe('asScreenshotsPayload', () => {
  it('reads leniently: unknown statuses and pathless entries dropped, missing totals counted', () => {
    expect(
      asScreenshotsPayload({
        repositoryId: '',
        entries: [
          { status: 'NEW', path: 'a/__screenshots__/a.spec.ts/x.png' },
          { status: 'RENAMED', path: 'b.png' },
          { status: 'CHANGED' },
          'junk',
        ],
      }),
    ).toEqual({
      repositoryId: null,
      headSha: '',
      baseline: null,
      conventions: [],
      totals: { screenshots: 1, new: 1, changed: 0, removed: 0, unchanged: 0 },
      renderer: null,
      entries: [
        {
          status: 'NEW',
          path: 'a/__screenshots__/a.spec.ts/x.png',
          convention: null,
          spec: null,
          name: null,
          browser: null,
          platform: null,
          beforeBlob: null,
          afterBlob: null,
          beforeBytes: null,
          afterBytes: null,
          movedFrom: null,
          movedTo: null,
        },
      ],
      truncated: false,
    });
  });

  it('is null for anything that is not a screenshots payload', () => {
    for (const value of [null, undefined, 'x', 1, [], {}, { entries: {} }])
      expect(asScreenshotsPayload(value)).toBeNull();
  });
});

describe('the screenshots registration', () => {
  const run: QitsRunReportsDto = {
    runId: 'run-1',
    commitSha: SCREENSHOTS_HEAD_SHA,
    releaseRequestId: 'rr-1',
    baseline: screenshotsContext().baseline,
    reports: [],
  };

  function setup(report: QitsReport): {
    fixture: ComponentFixture<QitsRunReports>;
    raw: ReturnType<typeof vi.fn>;
  } {
    const raw = vi.fn(async () => new Blob(['png']));
    TestBed.configureTestingModule({
      providers: [
        provideQitsStandardReportKinds(),
        {
          provide: QitsReportsClient,
          useValue: {
            origin: () => of(''),
            runReports: () =>
              of({ ...run, reports: [{ ...report, payload: undefined } as QitsReport] }),
            report: () => of(report),
            baselineReports: () => of([]),
          } satisfies Partial<QitsReportsClient>,
        },
        { provide: QitsRepositoryRawClient, useValue: { raw } },
      ],
    });
    const fixture = TestBed.createComponent(QitsRunReports);
    fixture.componentRef.setInput('runId', 'run-1');
    fixture.detectChanges();
    return { fixture, raw };
  }

  it('is screenshots v1, titled Screenshots, and among the standard kinds', () => {
    expect(QITS_SCREENSHOTS_KIND).toBe('screenshots');
    expect(QITS_SCREENSHOTS_REPORT_KIND).toEqual({
      kind: 'screenshots',
      versions: [1],
      title: 'Screenshots',
      component: QitsScreenshotsReport,
    });
    TestBed.configureTestingModule({ providers: [provideQitsStandardReportKinds()] });
    expect(TestBed.inject(QITS_REPORT_KINDS).map((kind) => kind.kind)).toEqual([
      'test-results',
      'coverage',
      'contracts',
      'entity-changes',
      'screenshots',
    ]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideQitsScreenshotsReportKind()] });
    expect(TestBed.inject(QITS_REPORT_KINDS)).toEqual([QITS_SCREENSHOTS_REPORT_KIND]);
  });

  it('is drawn by <qits-run-reports> through its outlet, and reads no image until a row opens', async () => {
    const report = {
      ...EVERY_STATUS.report,
      highlights: [
        {
          severity: 'info',
          text: '2 new, 3 changed, 2 removed screenshots',
          metric: 'screenshots.changes',
          value: 7,
          delta: null,
        },
      ],
    };
    const { fixture, raw } = setup(report);
    expect(text(fixture, 'section.report[data-kind="screenshots"] .toggle')).toContain(
      'Screenshots',
    );
    click(fixture, 'section.report[data-kind="screenshots"] .toggle');
    await settle(fixture);
    expect(has(fixture, 'qits-screenshots-report')).toBe(true);
    expect(texts(fixture, 'qits-screenshots-report .group-title')).toEqual([
      'New 2',
      'Changed 3',
      'Removed 2',
    ]);
    expect(raw).not.toHaveBeenCalled();
  });
});
