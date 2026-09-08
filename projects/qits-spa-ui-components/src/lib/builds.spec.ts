import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  buildConfigName,
  provideQitsBuildList,
  provideQitsBuilds,
  QITS_BUILDS,
  QITS_BUILDS_FALLBACK_INTERVAL_MS,
  QITS_BUILDS_STREAM_DEBOUNCE_MS,
  QITS_BUILDS_STREAM_URL,
  QITS_BUILDS_URL,
  toBuilds,
  type QitsBuildsSource,
  type QitsEventSourceLike,
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

/**
 * A stream a spec drives by hand — the seam `QitsEventSourceLike` exists for. There is no way to
 * mock the real thing: an `EventSource` is opened by the browser, goes through no `HttpClient`, and
 * `HttpTestingController` has never heard of it.
 */
class FakeStream implements QitsEventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  close(): void {
    this.closed = true;
  }

  /** The browser has the stream. Deliberately not automatic: the gap before it is a real state. */
  connect(): void {
    this.onopen?.(new Event('open'));
  }

  /** One frame. Its body is never read, so it carries none. */
  frame(): void {
    this.onmessage?.(new MessageEvent<string>('message', { data: '' }));
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }
}

describe('provideQitsBuilds', () => {
  /** Every stream that was opened, in the order it was — a reconnect is the second entry. */
  let streams: FakeStream[];

  /**
   * `stream: false` is an application that opted out of the stream altogether, which is the same
   * arrangement a browser that cannot hold one ends up in.
   */
  function source(options?: { readonly stream?: boolean }): QitsBuildsSource {
    streams = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsBuilds({
          eventSource:
            options?.stream === false
              ? null
              : (url: string) => {
                  const stream = new FakeStream(url);
                  streams.push(stream);
                  return stream;
                },
        }),
      ],
    });
    // The source is built the moment something asks for it, and it reads on the way up — so every
    // case below begins with that read already in flight.
    return TestBed.inject(QITS_BUILDS);
  }

  function http(): HttpTestingController {
    return TestBed.inject(HttpTestingController);
  }

  /** Answer the read the source makes as it is built. Every case is about what happens after it. */
  function startup(runs: readonly unknown[] = []): void {
    http().expectOne(QITS_BUILDS_URL).flush({ runs });
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * The bolt has to mean something on a page nobody has clicked, so the listing is read once as the
   * chrome is built — and then not again on any clock, because the stream is what says when.
   */
  it('reads the listing once at startup, with the panel closed and nobody watching', () => {
    const builds = source();
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'RUNNING' }] });

    expect(builds.runs()).toHaveLength(1);
    expect(builds.failed()).toBe(false);
    vi.advanceTimersByTime(60_000);
    http().verify();
  });

  /** The names are the run lifecycle: entering the active listing, and every way of leaving it. */
  it('subscribes to the stream at the names a run announces itself under', () => {
    source();
    startup();

    expect(streams).toHaveLength(1);
    expect(streams[0].url).toBe(QITS_BUILDS_STREAM_URL);
    expect(streams[0].url).toContain('names=BuildStatusChanged,BuildSuccessful,BuildFailed');
  });

  /** A frame says only "go and look": what is drawn always comes back out of the listing. */
  it('reads the listing again when a frame says something happened', () => {
    const builds = source();
    startup();

    streams[0].frame();
    vi.advanceTimersByTime(QITS_BUILDS_STREAM_DEBOUNCE_MS);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'QUEUED' }] });

    expect(builds.runs()).toHaveLength(1);
  });

  /** One push finishes a fan of runs at once, and every frame of it means the same thing. */
  it('gathers a burst of frames into a single read', () => {
    source();
    startup();

    streams[0].frame();
    streams[0].frame();
    vi.advanceTimersByTime(QITS_BUILDS_STREAM_DEBOUNCE_MS - 1);
    streams[0].frame();
    // Still nothing: the third frame moved the window rather than adding a request to it.
    http().verify();

    vi.advanceTimersByTime(QITS_BUILDS_STREAM_DEBOUNCE_MS);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
  });

  /**
   * The stream is live-only — no replay, no offset — so a stream that dropped and came back has
   * missed everything in between and cannot say what. The listing is the only road back.
   */
  it('reads the listing on every connect, reconnects included', () => {
    const builds = source();
    startup();

    streams[0].connect();
    vi.advanceTimersByTime(QITS_BUILDS_STREAM_DEBOUNCE_MS);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });

    streams[0].fail();
    expect(streams).toHaveLength(2);
    streams[1].connect();
    vi.advanceTimersByTime(QITS_BUILDS_STREAM_DEBOUNCE_MS);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'RUNNING' }] });

    expect(builds.runs()).toHaveLength(1);
  });

  /**
   * Degrade, do not disappear. An edge that will not pass the stream, a session without the roles
   * — nothing about asking a third time changes either, and a permanently grey bolt on a platform
   * that is building something is a wrong answer given confidently.
   */
  it('falls back to a slow interval once the stream cannot be held', () => {
    source();
    startup();

    streams[0].fail();
    streams[1].fail();
    // Two consecutive failures is the whole budget: nothing opens a third stream.
    expect(streams).toHaveLength(2);
    expect(streams.every((stream) => stream.closed)).toBe(true);

    vi.advanceTimersByTime(QITS_BUILDS_FALLBACK_INTERVAL_MS);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
    vi.advanceTimersByTime(QITS_BUILDS_FALLBACK_INTERVAL_MS);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
    expect(streams).toHaveLength(2);
  });

  /** No stream at all is a supported arrangement, and it is the fallback path from the start. */
  it('keeps the count current on the interval where there is no stream to open', () => {
    source({ stream: false });
    startup();

    expect(streams).toEqual([]);
    vi.advanceTimersByTime(QITS_BUILDS_FALLBACK_INTERVAL_MS);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
  });

  it('asks qits-ci for the active runs the moment the panel opens', () => {
    const builds = source();
    startup();

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
    startup();

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

  /** A reader watching a run move wants it moving; qits-ci publishes no frame per second of it. */
  it('asks again every few seconds while the panel stays open', () => {
    const builds = source();
    startup();

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
    startup();

    builds.watch(true);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
    builds.watch(true);
    http().verify();

    vi.advanceTimersByTime(5000);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
  });

  /**
   * Closing drops the panel's cadence and **nothing else**. Forgetting here would blank the bolt at
   * exactly the moment the reader stopped looking at the panel and started relying on the bolt.
   */
  it('keeps the answer, and keeps it current, when the panel closes', () => {
    const builds = source();
    startup();

    builds.watch(true);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'RUNNING' }] });

    builds.watch(false);
    expect(builds.runs()).toHaveLength(1);
    expect(builds.failed()).toBe(false);
    // The five-second poll is the panel's, and it stops with the panel.
    vi.advanceTimersByTime(60_000);
    http().verify();

    // The stream still says when, though, and the count moves with the platform behind a shut panel.
    streams[0].frame();
    vi.advanceTimersByTime(QITS_BUILDS_STREAM_DEBOUNCE_MS);
    http().expectOne(QITS_BUILDS_URL).flush({ runs: [] });
    expect(builds.runs()).toEqual([]);
  });

  it('says the read failed rather than drawing a platform with nothing building', () => {
    const builds = source();
    http()
      .expectOne(QITS_BUILDS_URL)
      .error(new ProgressEvent('error'), { status: 502, statusText: 'Bad Gateway' });

    expect(builds.runs()).toEqual([]);
    expect(builds.failed()).toBe(true);
  });

  /** A host where `/ci` answers again is not owed the failure of the read before it. */
  it('takes the next good answer back, having said the last one failed', () => {
    const builds = source();
    http().expectOne(QITS_BUILDS_URL).error(new ProgressEvent('error'), { status: 502 });
    expect(builds.failed()).toBe(true);

    streams[0].frame();
    vi.advanceTimersByTime(QITS_BUILDS_STREAM_DEBOUNCE_MS);
    http()
      .expectOne(QITS_BUILDS_URL)
      .flush({ runs: [{ id: 'run-1', repoName: 'qits-ci-service', status: 'QUEUED' }] });
    expect(builds.failed()).toBe(false);
    expect(builds.runs()).toHaveLength(1);
  });

  /** Everything the source holds is the chrome's: the timers, the stream, and the read in flight. */
  it('closes the stream and stops asking when the application goes away', () => {
    const builds = source();
    startup();
    builds.watch(true);
    const controller = http();
    controller.expectOne(QITS_BUILDS_URL).flush({ runs: [] });

    TestBed.resetTestingModule();

    expect(streams[0].closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    controller.verify();
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
