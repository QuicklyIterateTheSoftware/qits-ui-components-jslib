import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  buildConfigName,
  provideQitsBuildList,
  provideQitsBuilds,
  QITS_BUILDS,
  QITS_BUILDS_URL,
  toBuilds,
  type QitsBuildsSource,
} from './builds';

describe('toBuilds', () => {
  it('reads the rows qits-ci answers with, in the order it listed them', () => {
    expect(
      toBuilds({
        runs: [
          {
            id: 'run-1',
            repoName: 'qits-ci-service',
            branch: 'main',
            status: 'RUNNING',
            configPath: '.config/qits/ci-post-receive.yml',
            commitSha: '18f7422',
          },
          {
            id: 'run-2',
            repoName: 'qits-eventstream-javalib',
            branch: 'feature/x',
            status: 'QUEUED',
            configPath: '.config/qits/ci-event-release.yml',
          },
        ],
      }).map((run) => `${run.repoName} ${run.branch} ${run.status}`),
    ).toEqual(['qits-ci-service main RUNNING', 'qits-eventstream-javalib feature/x QUEUED']);
  });

  /** A status this library does not know is still a pending build; only `RUNNING` is drawn apart. */
  it('carries the status through, upper-cased, whatever the word is', () => {
    expect(
      toBuilds({
        runs: [
          { id: 'a', repoName: 'r', status: 'running' },
          { id: 'b', repoName: 'r', status: 'PROVISIONING' },
        ],
      }).map((run) => run.status),
    ).toEqual(['RUNNING', 'PROVISIONING']);
  });

  it('drops a row the panel could not draw a line for, and reads no body as no runs', () => {
    expect(toBuilds({ runs: [{ repoName: 'r' }, { id: 'b' }] })).toEqual([]);
    expect(toBuilds(null)).toEqual([]);
    expect(toBuilds({})).toEqual([]);
  });

  /** The clocks a panel ticks against, and the shape it draws — all three optional on the wire. */
  it('carries the two clocks and the prediction through as qits-ci stated them', () => {
    const [run] = toBuilds({
      runs: [
        {
          id: 'run-1',
          repoName: 'qits-ci-service',
          status: 'RUNNING',
          createdAt: '2026-09-07T11:58:00Z',
          startedAt: '2026-09-07T11:59:00Z',
          expectedStepDurationsMillis: [10_000, 90_000],
        },
      ],
    });

    // Strings, not `Date`s: the row is listed far more often than it is timed against.
    expect(run.createdAt).toBe('2026-09-07T11:58:00Z');
    expect(run.startedAt).toBe('2026-09-07T11:59:00Z');
    expect(run.expectedStepDurationsMillis).toEqual([10_000, 90_000]);
  });

  it('reads a run that has none of them as a run that simply has none', () => {
    const [run] = toBuilds({
      runs: [{ id: 'run-1', repoName: 'r', status: 'QUEUED', startedAt: null }],
    });

    expect(run.createdAt).toBeUndefined();
    // Queued: no worker has taken it, so there is no start to speak of.
    expect(run.startedAt).toBeUndefined();
    expect(run.expectedStepDurationsMillis).toBeUndefined();
  });

  /**
   * The bar's segments are proportions of one another, so a single unusable entry would silently
   * redraw the shape of every other step. No prediction is a true statement; a wrong one is not.
   */
  it('drops a whole prediction it cannot draw honest proportions from', () => {
    expect(
      toBuilds({
        runs: [
          { id: 'a', repoName: 'r', expectedStepDurationsMillis: [] },
          { id: 'b', repoName: 'r', expectedStepDurationsMillis: [10_000, 0] },
          { id: 'c', repoName: 'r', expectedStepDurationsMillis: [10_000, -5] },
          { id: 'd', repoName: 'r', expectedStepDurationsMillis: null },
        ],
      }).map((run) => run.expectedStepDurationsMillis),
    ).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('buildConfigName', () => {
  it('is the pipeline file, not the path every run on the platform shares', () => {
    expect(buildConfigName('.config/qits/ci-post-receive.yml')).toBe('ci-post-receive.yml');
    expect(buildConfigName('ci-event-release.yml')).toBe('ci-event-release.yml');
    expect(buildConfigName('')).toBe('');
    expect(buildConfigName(undefined)).toBe('');
  });
});

describe('provideQitsBuilds', () => {
  function source(): QitsBuildsSource {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideQitsBuilds()],
    });
    return TestBed.inject(QITS_BUILDS);
  }

  function http(): HttpTestingController {
    return TestBed.inject(HttpTestingController);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** The whole cost model of a header affordance: a panel nobody opened asks qits-ci nothing. */
  it('asks nothing at all while nobody is watching', () => {
    const builds = source();
    expect(builds.runs()).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    http().verify();
  });

  it('asks qits-ci for the active runs the moment the panel opens', () => {
    const builds = source();
    builds.watch(true);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'RUNNING' }] });

    expect(builds.runs()).toHaveLength(1);
    expect(builds.failed()).toBe(false);
  });

  /** The fields the bar is drawn from reach the panel through the read, not only through mapping. */
  it('answers with the clocks and the prediction the read carried', () => {
    const builds = source();
    builds.watch(true);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({
        runs: [
          {
            id: 'run-1',
            repoName: 'qits-ci-service',
            status: 'RUNNING',
            createdAt: '2026-09-07T11:58:00Z',
            startedAt: '2026-09-07T11:59:00Z',
            expectedStepDurationsMillis: [10_000, 90_000],
          },
        ],
      });

    const [run] = builds.runs() ?? [];
    expect(run.startedAt).toBe('2026-09-07T11:59:00Z');
    expect(run.createdAt).toBe('2026-09-07T11:58:00Z');
    expect(run.expectedStepDurationsMillis).toEqual([10_000, 90_000]);
  });

  it('asks again every few seconds while it stays open', () => {
    const builds = source();
    builds.watch(true);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });

    vi.advanceTimersByTime(5000);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'QUEUED' }] });
    expect(builds.runs()).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
    expect(builds.runs()).toEqual([]);
  });

  /** Opening is said on every toggle; a second "open" must not leave two timers running. */
  it('is asked to watch idempotently', () => {
    const builds = source();
    builds.watch(true);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
    builds.watch(true);
    http().verify();

    vi.advanceTimersByTime(5000);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
  });

  it('stops asking, and forgets what it knew, when the panel closes', () => {
    const builds = source();
    builds.watch(true);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'RUNNING' }] });

    builds.watch(false);
    // Reopened an hour later, the queue of an hour ago is not an answer — so there is none.
    expect(builds.runs()).toBeUndefined();
    expect(builds.failed()).toBe(false);
    vi.advanceTimersByTime(60_000);
    http().verify();
  });

  it('cancels a read the reader closed the panel on', () => {
    const builds = source();
    builds.watch(true);
    const request = http().expectOne(QITS_BUILDS_URL);
    builds.watch(false);
    expect(request.cancelled).toBe(true);
  });

  it('says the read failed rather than drawing a platform with nothing building', () => {
    const builds = source();
    builds.watch(true);
    http()
      .expectOne(QITS_BUILDS_URL)
      .error(new ProgressEvent('error'), { status: 502, statusText: 'Bad Gateway' });

    expect(builds.runs()).toEqual([]);
    expect(builds.failed()).toBe(true);
  });

  /** A host where `/ci` answers again is not owed the failure of the poll before it. */
  it('takes the next good answer back, having said the last one failed', () => {
    const builds = source();
    builds.watch(true);
    http().expectOne(QITS_BUILDS_URL).error(new ProgressEvent('error'), { status: 502 });
    expect(builds.failed()).toBe(true);

    vi.advanceTimersByTime(5000);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'QUEUED' }] });
    expect(builds.failed()).toBe(false);
    expect(builds.runs()).toHaveLength(1);
  });

  it('stops polling when the application goes away', () => {
    const builds = source();
    builds.watch(true);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });

    TestBed.resetTestingModule();
    vi.advanceTimersByTime(60_000);
    expect(builds.runs()).toBeUndefined();
  });
});

describe('provideQitsBuildList', () => {
  it('is answered from the moment it exists, with nothing to flush and nothing to poll', () => {
    TestBed.configureTestingModule({
      providers: [
        provideQitsBuildList([
          {
            id: 'run-1',
            repoName: 'qits-ci-service',
            branch: 'main',
            status: 'RUNNING',
            configPath: '.config/qits/ci-post-receive.yml',
          },
        ]),
      ],
    });
    const builds = TestBed.inject(QITS_BUILDS);
    builds.watch(true);

    expect(builds.runs()).toHaveLength(1);
    expect(builds.failed()).toBe(false);
  });
});
