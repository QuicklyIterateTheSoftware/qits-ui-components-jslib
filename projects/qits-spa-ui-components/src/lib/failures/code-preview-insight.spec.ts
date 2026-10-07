import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type EnvironmentProviders, type Provider } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  QITS_NAVIGATION,
  provideQitsNavigationTree,
  toNavTree,
  type QitsNavTree,
} from '../navigation';
import { provideQitsProjectList } from '../projects';
import type { QitsReport, QitsReportContext } from '../reports';
import {
  provideQitsRepositories,
  provideQitsRepositoryList,
  type QitsRepository,
} from '../repositories';
import { QITS_SCOPE, type QitsScope, type QitsScopeSource } from '../scope';
import {
  QitsTestResultsReport,
  type QitsTestCoordinates,
  type QitsTestFailure,
  type QitsTestResultsPayload,
} from '../test-results-report';
import { QitsCodePreview, QitsCodePreviewInsight } from './code-preview-insight';
import { provideQitsStandardFailureInsights } from './standard-failure-insights';

const GITHOST = 'https://githost.qits.example';
const SHA = '3f9c2e1a7b4d8e0f1a2b3c4d5e6f708192a3b4c5';
const FILE = 'service/src/test/java/eu/wohlben/qits/ci/api/CiReportResourceTest.java';
const FILE_URL = `${GITHOST}/githost/api/repositories/repo-ci/file`;

const NAVIGATION = {
  slots: {},
  applications: { 'qits-githost': { origin: GITHOST } },
};

const REPOSITORIES: QitsRepository[] = [
  { id: 'repo-ci', name: 'qits-ci-service', component: 'qits-ci', category: 'services' },
];

/** A file of `count` lines, each saying its own number. */
function source(count: number, ending = '\n'): string {
  return Array.from({ length: count }, (_, i) => `// line ${i + 1}`).join(ending) + ending;
}

function failure(overrides: Partial<QitsTestCoordinates> = {}): QitsTestFailure {
  return {
    coordinates: {
      language: 'java',
      tool: 'surefire',
      repository: { projectId: 'p-qits', name: 'qits-ci-service' },
      commitSha: SHA,
      file: FILE,
      className: 'eu.wohlben.qits.ci.api.CiReportResourceTest',
      testName: 'refusesAnotherRunsToken',
      lineStart: 3,
      lineEnd: 5,
      ...overrides,
    },
    shape: 'ASSERTION',
    failureType: 'org.opentest4j.AssertionFailedError',
    message: 'expected: <403> but was: <204>',
    stackTrace: 'at CiReportResourceTest.refusesAnotherRunsToken(CiReportResourceTest.java:4)',
    durationMs: 120,
  };
}

const CONTEXT: QitsReportContext = {
  runId: 'run-1',
  commitSha: SHA,
  baseline: null,
  ciOrigin: '',
};

function configure(extra: (Provider | EnvironmentProviders)[] = []): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideQitsStandardFailureInsights(),
      provideQitsProjectList([{ id: 'p-qits', slug: 'qits', name: 'QITS' }]),
      ...(extra.length
        ? extra
        : [provideQitsNavigationTree(NAVIGATION), provideQitsRepositoryList(REPOSITORIES)]),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** Let a flushed read's promise land, then draw. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

function gutter(fixture: ComponentFixture<unknown>): string[] {
  return [...host(fixture).querySelectorAll('.gutter')].map((cell) => cell.textContent ?? '');
}

function muted(fixture: ComponentFixture<unknown>): string {
  return (host(fixture).querySelector('.degraded')?.textContent ?? '').trim();
}

function link(fixture: ComponentFixture<unknown>): string | null {
  return host(fixture).querySelector<HTMLAnchorElement>('a.open')?.getAttribute('href') ?? null;
}

function expectRead(http: HttpTestingController) {
  return http.expectOne((request) => request.url === FILE_URL);
}

describe('the code preview inside the test results', () => {
  function report(failures: QitsTestFailure[]): QitsReport {
    const payload: QitsTestResultsPayload = {
      totals: { tests: 2, passed: 0, failed: 2, errored: 0, skipped: 0, durationMs: null },
      suites: [],
      failures,
      truncated: false,
    };
    return {
      id: 'r-1',
      kind: 'test-results',
      kindVersion: 1,
      stepIndex: 0,
      highlights: [],
      baselineRunId: null,
      baselineVersion: null,
      payloadBytes: 1,
      submittedAt: '2026-10-07T10:00:00Z',
      payload,
    };
  }

  function render(failures: QitsTestFailure[]): ComponentFixture<QitsTestResultsReport> {
    const fixture = TestBed.createComponent(QitsTestResultsReport);
    fixture.componentRef.setInput('report', report(failures));
    fixture.componentRef.setInput('context', CONTEXT);
    fixture.detectChanges();
    return fixture;
  }

  function open(fixture: ComponentFixture<unknown>, index: number): void {
    host(fixture).querySelectorAll<HTMLButtonElement>('button.message')[index].click();
    fixture.detectChanges();
  }

  it('reads nothing until a failure is opened, then reads its file once, on githost, with the session', async () => {
    const http = configure();
    const fixture = render([failure(), failure({ testName: 'other', lineStart: 7, lineEnd: 8 })]);
    http.expectNone(() => true);

    open(fixture, 0);
    const read = expectRead(http);
    expect(read.request.method).toBe('GET');
    expect(read.request.withCredentials).toBe(true);
    expect(read.request.params.get('rev')).toBe(SHA);
    expect(read.request.params.get('path')).toBe(FILE);
    read.flush({ path: FILE, binary: false, size: 100, content: source(10) });
    await settle(fixture);

    expect(host(fixture).querySelector('[data-insight="code-preview"] .title')?.textContent).toBe(
      'Test code',
    );
    // Under the message and the stack.
    const detail = host(fixture).querySelector('tr.detail td')!;
    expect(detail.lastElementChild?.tagName.toLowerCase()).toBe('qits-failure-insights');
    expect(gutter(fixture)).toEqual(['3', '4', '5']);
    expect(host(fixture).querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(
      [...host(fixture).querySelectorAll('.line .text')].map((line) => line.textContent),
    ).toEqual(['// line 3', '// line 4', '// line 5']);
    expect(link(fixture)).toBe(
      `${GITHOST}/qits/qits-ci/qits-ci-service/branches/${SHA}?path=${FILE}&lines=3-5`,
    );
    expect(host(fixture).querySelector('a.open')?.textContent).toBe('Open in githost at 3f9c2e1');

    // Closing and reopening, and a second failure in the same file, read nothing more.
    open(fixture, 0);
    open(fixture, 0);
    open(fixture, 1);
    await settle(fixture);
    http.verify();
    expect(gutter(fixture)).toEqual(['7', '8']);
  });

  it('waits for the navigation to say where githost is', async () => {
    const tree = signal<QitsNavTree | undefined>(undefined);
    const http = configure([
      { provide: QITS_NAVIGATION, useValue: { tree, failed: signal(false) } },
      provideQitsRepositoryList(REPOSITORIES),
    ]);
    const fixture = render([failure()]);
    open(fixture, 0);
    TestBed.tick();
    http.expectNone(() => true);

    tree.set(toNavTree(NAVIGATION));
    TestBed.tick();
    expectRead(http).flush({ path: FILE, binary: false, size: 10, content: source(6) });
    await settle(fixture);
    expect(gutter(fixture)).toEqual(['3', '4', '5']);
  });
});

describe('QitsCodePreview', () => {
  function render(value: QitsTestFailure = failure()): ComponentFixture<QitsCodePreview> {
    const fixture = TestBed.createComponent(QitsCodePreview);
    fixture.componentRef.setInput('failure', value);
    fixture.componentRef.setInput('kind', {
      language: 'java',
      tool: 'surefire',
      shape: 'ASSERTION',
      category: 'assertion',
    });
    fixture.componentRef.setInput('context', CONTEXT);
    fixture.detectChanges();
    return fixture;
  }

  const LINK = `${GITHOST}/qits/qits-ci/qits-ci-service/branches/${SHA}?path=${FILE}&lines=3-5`;

  it('applies to a failure that names its file and both ends of its lines', () => {
    const kind = { language: 'java', tool: 'surefire', shape: 'ASSERTION', category: 'assertion' };
    expect(QitsCodePreviewInsight.appliesTo(kind, failure())).toBe(true);
    expect(QitsCodePreviewInsight.appliesTo(kind, failure({ file: null }))).toBe(false);
    expect(QitsCodePreviewInsight.appliesTo(kind, failure({ lineStart: null }))).toBe(false);
    expect(QitsCodePreviewInsight.appliesTo(kind, failure({ lineEnd: null }))).toBe(false);
  });

  it('says so, with no excerpt and no link, where the repository is not resolvable here', () => {
    const http = configure();
    const fixture = render(
      failure({ repository: { projectId: 'p-qits', name: 'qits-elsewhere-service' } }),
    );
    expect(muted(fixture)).toBe(
      'The repository qits-elsewhere-service cannot be resolved here, so its test code is not shown.',
    );
    expect(host(fixture).querySelector('qits-code-excerpt')).toBeNull();
    expect(link(fixture)).toBeNull();
    http.verify();
  });

  it('says so where there is no repository listing at all', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = render();
    expect(muted(fixture)).toContain('cannot be resolved here');
    expect(link(fixture)).toBeNull();
  });

  it.each([
    [404, { error: 'no-such-rev' }, 'The commit 3f9c2e1 is no longer on the git host.'],
    [404, { error: 'no-such-path' }, `${FILE} is not in commit 3f9c2e1 on the git host.`],
    [404, { error: 'no-such-repository' }, 'The git host has no repository qits-ci-service.'],
    [500, { error: 'boom' }, 'The test code could not be read from the git host.'],
    [403, null, 'The test code could not be read from the git host.'],
  ])('answers a %s %j with one muted line, and still links', async (status, body, text) => {
    const http = configure();
    const fixture = render();
    expectRead(http).flush(body, { status, statusText: 'Nope' });
    await settle(fixture);
    expect(muted(fixture)).toBe(text);
    expect(host(fixture).querySelector('qits-code-excerpt')).toBeNull();
    expect(link(fixture)).toBe(LINK);
  });

  it.each([
    [{ path: FILE, binary: true, size: 4096 }, `${FILE} is a binary file, so it is not shown.`],
    [
      { path: FILE, binary: true, size: 3 * 1024 * 1024 },
      `${FILE} is larger than 2 MiB, so it is not shown.`,
    ],
  ])('answers %j with one muted line', async (body, text) => {
    const http = configure();
    const fixture = render();
    expectRead(http).flush(body);
    await settle(fixture);
    expect(muted(fixture)).toBe(text);
    expect(link(fixture)).toBe(LINK);
  });

  it('says so when the lines fall outside the file', async () => {
    const http = configure();
    const fixture = render(failure({ lineStart: 9, lineEnd: 12 }));
    expectRead(http).flush({ path: FILE, binary: false, size: 40, content: source(10, '\r\n') });
    await settle(fixture);
    expect(muted(fixture)).toBe(`Lines 9–12 are outside ${FILE}, which has 10 lines at 3f9c2e1.`);
    expect(link(fixture)).toContain('lines=9-12');
  });

  it('drops the carriage returns of a CRLF file', async () => {
    const http = configure();
    const fixture = render();
    expectRead(http).flush({ path: FILE, binary: false, size: 40, content: source(10, '\r\n') });
    await settle(fixture);
    expect(
      [...host(fixture).querySelectorAll('.line .text')].map((line) => line.textContent),
    ).toEqual(['// line 3', '// line 4', '// line 5']);
  });

  it('draws at most 200 lines and counts the rest', async () => {
    const http = configure();
    const fixture = render(failure({ lineStart: 11, lineEnd: 260 }));
    expectRead(http).flush({ path: FILE, binary: false, size: 9000, content: source(300) });
    await settle(fixture);
    const numbers = gutter(fixture);
    expect(numbers).toHaveLength(200);
    expect(numbers[0]).toBe('11');
    expect(numbers[199]).toBe('210');
    expect(host(fixture).querySelector('.more')?.textContent?.trim()).toBe('… 50 more lines');
  });

  it('spells a one-line range the way the Code page does', async () => {
    const http = configure();
    const fixture = render(failure({ lineStart: 4, lineEnd: 4 }));
    expectRead(http).flush({ path: FILE, binary: false, size: 40, content: source(10) });
    await settle(fixture);
    expect(link(fixture)).toBe(
      `${GITHOST}/qits/qits-ci/qits-ci-service/branches/${SHA}?path=${FILE}&lines=4`,
    );
    expect(host(fixture).querySelector('.more')).toBeNull();
  });
});

describe('QitsCodePreview where the live listing does not cover the failure', () => {
  const PROJECTS = 'https://projects.qits.example';
  const LIVE_NAVIGATION = {
    slots: {},
    applications: {
      'qits-githost': { origin: GITHOST },
      'qits-projects': { origin: PROJECTS },
    },
  };
  const listingUrl = (projectId: string) =>
    `${PROJECTS}/projects/api/projects/${projectId}/repositories`;
  const ENTRIES = {
    entries: [
      {
        repository: {
          id: 'repo-ci',
          name: 'qits-ci-service',
          archetype: 'SERVICE',
          component: 'qits-ci',
        },
      },
      { repository: { id: 'repo-other', name: 'qits-other-service', archetype: 'SERVICE' } },
    ],
    wrapper: { repositoryId: 'repo-wrapper' },
  };

  /** A scope as the address states it; `projectId` is what the project list resolved it to. */
  function scopeOf(scope: QitsScope, projectId?: string): QitsScopeSource {
    return {
      scope: signal(scope),
      projectId: signal(projectId),
      repositoryId: signal(undefined),
      routing: 'repository',
      select: () => undefined,
    };
  }

  function configureLive(scope: QitsScopeSource | null): HttpTestingController {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationTree(LIVE_NAVIGATION),
        provideQitsProjectList([
          { id: 'p-qits', slug: 'qits', name: 'QITS' },
          { id: 'p-other', slug: 'other', name: 'Other' },
        ]),
        provideQitsRepositories(),
        ...(scope ? [{ provide: QITS_SCOPE, useValue: scope }] : []),
      ],
    });
    return TestBed.inject(HttpTestingController);
  }

  function render(value: QitsTestFailure): ComponentFixture<QitsCodePreview> {
    const fixture = TestBed.createComponent(QitsCodePreview);
    fixture.componentRef.setInput('failure', value);
    fixture.componentRef.setInput('context', CONTEXT);
    fixture.detectChanges();
    return fixture;
  }

  function expectListing(http: HttpTestingController, projectId: string) {
    const request = http.expectOne(listingUrl(projectId));
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    return request;
  }

  it('lists the failure’s project once and reads the file once, with no project in scope', async () => {
    const http = configureLive(scopeOf({}));
    const fixture = render(failure());
    expect(host(fixture).querySelector('.pending')).not.toBeNull();

    expectListing(http, 'p-qits').flush(ENTRIES);
    await settle(fixture);
    expectRead(http).flush({ path: FILE, binary: false, size: 100, content: source(10) });
    await settle(fixture);

    expect(gutter(fixture)).toEqual(['3', '4', '5']);
    expect(link(fixture)).toBe(
      `${GITHOST}/qits/qits-ci/qits-ci-service/branches/${SHA}?path=${FILE}&lines=3-5`,
    );

    // A second failure of the same project lists nothing again, and its file is already read.
    const second = render(failure({ testName: 'other', lineStart: 7, lineEnd: 8 }));
    await settle(second);
    expect(gutter(second)).toEqual(['7', '8']);
    http.verify();
    await fixture.whenStable();
  });

  it('resolves a failure of another project than the scoped one through the lookup', async () => {
    const http = configureLive(scopeOf({ project: 'qits' }, 'p-qits'));
    const fixture = render(
      failure({ repository: { projectId: 'p-other', name: 'qits-other-service' } }),
    );
    // The scoped project's own listing, which the shell asks for anyway, and which lacks it.
    expectListing(http, 'p-qits').flush({ entries: [] });
    expectListing(http, 'p-other').flush(ENTRIES);
    await settle(fixture);
    http
      .expectOne((request) => request.url === `${GITHOST}/githost/api/repositories/repo-other/file`)
      .flush({ path: FILE, binary: false, size: 100, content: source(10) });
    await settle(fixture);

    expect(gutter(fixture)).toEqual(['3', '4', '5']);
    // Componentless: the archetype category is the group.
    expect(link(fixture)).toBe(
      `${GITHOST}/other/services/qits-other-service/branches/${SHA}?path=${FILE}&lines=3-5`,
    );
    http.verify();
  });

  it('uses the scoped listing, with no second request, where it covers the failure', async () => {
    const http = configureLive(scopeOf({ project: 'qits' }, 'p-qits'));
    const fixture = render(failure());
    expectListing(http, 'p-qits').flush(ENTRIES);
    await settle(fixture);
    expectRead(http).flush({ path: FILE, binary: false, size: 100, content: source(10) });
    await settle(fixture);
    expect(gutter(fixture)).toEqual(['3', '4', '5']);
    http.verify();
  });

  it('says so, and asks nothing, where neither the scope nor the failure names a project', () => {
    for (const scope of [scopeOf({}), null]) {
      TestBed.resetTestingModule();
      const http = configureLive(scope);
      const fixture = render(failure({ repository: { projectId: '', name: 'qits-ci-service' } }));
      expect(muted(fixture)).toBe(
        'The repository qits-ci-service cannot be resolved here, so its test code is not shown.',
      );
      expect(link(fixture)).toBeNull();
      http.verify();
    }
  });

  it('says so where the listing cannot be read, and asks again next time', async () => {
    const http = configureLive(null);
    const fixture = render(failure());
    expectListing(http, 'p-qits').flush({ error: 'boom' }, { status: 500, statusText: 'Nope' });
    await settle(fixture);
    expect(muted(fixture)).toBe(
      'The repository qits-ci-service cannot be resolved here, so its test code is not shown.',
    );
    expect(link(fixture)).toBeNull();
    http.verify();

    const again = render(failure());
    expectListing(http, 'p-qits').flush(ENTRIES);
    await settle(again);
    expectRead(http).flush({ path: FILE, binary: false, size: 100, content: source(10) });
    await settle(again);
    expect(gutter(again)).toEqual(['3', '4', '5']);
  });
});
