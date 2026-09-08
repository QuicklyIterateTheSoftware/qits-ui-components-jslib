import { HttpClient } from '@angular/common/http';
import {
  DestroyRef,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  signal,
  type EnvironmentProviders,
  type Signal,
} from '@angular/core';

/** A build under way. The one status the panel draws differently, because it is the one moving. */
export const QITS_BUILD_RUNNING = 'RUNNING';

/**
 * One pending build, as the chrome needs it: what is being built, from where, and how far it has
 * got. The shape is copied from qits-ci rather than shared — this library depends on no qits module
 * — and only the fields a header affordance can show are read.
 */
export interface QitsBuild {
  readonly id: string;
  readonly repoName: string;
  readonly branch: string;
  /**
   * `RUNNING` for a build under way, `QUEUED` for one waiting for a worker — the whole vocabulary
   * of the active listing, since a run in any other state has left it. Carried through as the
   * service said it and upper-cased, never narrowed to those two: a status this library does not
   * know is still a pending build, and dropping it would under-report the queue.
   */
  readonly status: string;
  /** The pipeline file, as the run names it — `.config/qits/ci-post-receive.yml`. */
  readonly configPath: string;
  readonly commitSha?: string;
  /** When the run was asked for, as an ISO instant — the clock a run still waiting is timed from. */
  readonly createdAt?: string;
  /** When a worker picked it up, as an ISO instant. Absent for as long as the run is queued. */
  readonly startedAt?: string;
  /**
   * How long qits-ci expects each step of this pipeline to take, in order, in milliseconds — its
   * p95 of what the same step took before.
   *
   * Absent where it has nothing to predict from: a pipeline that has never run, or a service too
   * old to say. The panel draws the run's expected shape where there is one and says nothing at all
   * where there is not, which is the only honest pair of states for a prediction.
   */
  readonly expectedStepDurationsMillis?: readonly number[];
}

/** The body qits-ci answers the active listing with. Every field optional: this is another service. */
export interface QitsBuildRuns {
  readonly runs?: readonly {
    readonly id?: string;
    readonly repoName?: string;
    readonly branch?: string;
    readonly status?: string;
    readonly configPath?: string;
    readonly commitSha?: string;
    readonly createdAt?: string | null;
    readonly startedAt?: string | null;
    readonly expectedStepDurationsMillis?: readonly number[] | null;
  }[];
}

/**
 * Where `QitsMainLayout` gets the builds its lightning bolt lists — and, since the bolt says
 * something about the platform while the panel is shut, the count it says it with. The same three
 * states the other reads have: nothing yet, an answer, given up.
 *
 * <p><b>The count stays current while the panel is closed.</b> That is the whole of what this
 * interface promises and it is the thing that changed: a bolt that only knew what was building
 * while somebody was already looking at it could never be the thing that tells them to look. What
 * keeps it current is not a closed-state poll — see {@link QITS_BUILDS_STREAM_URL} — but that is
 * the implementation's business, and a source that answers from a literal keeps the promise
 * trivially.
 *
 * <p>`watch(true)` is what the panel says when it opens: ask now, and keep asking, at the rate an
 * open list of moving runs deserves. `watch(false)` when it closes: <b>stop asking at that rate,
 * and keep the count current quietly</b>. It is deliberately not "stop, and forget" any more —
 * forgetting on close would blank the bolt at the moment the reader stopped looking at the panel
 * and started relying on the bolt.
 */
export interface QitsBuildsSource {
  readonly runs: Signal<readonly QitsBuild[] | undefined>;
  readonly failed: Signal<boolean>;
  watch(watching: boolean): void;
}

/** The pending builds, behind a token so a literal can stand in for the read. */
export const QITS_BUILDS = new InjectionToken<QitsBuildsSource>('QITS_BUILDS');

/**
 * Where the active runs are asked for — a **same-origin path**, like the chrome's other reads and
 * for the same reason: the edge routes `/ci` on every vhost, so the browser's own session reaches
 * qits-ci with no machine token, no CORS pre-flight and no origin compiled in here. An absolute URL
 * would name a host this library cannot know and would need a credential of its own.
 *
 * **This listing is the single source of truth**, and the only one. Everything below is about when
 * to read it again, never about what it says.
 */
export const QITS_BUILDS_URL = '/ci/api/runs/active';

/**
 * The live stream that says *something has happened, go and look* — a same-origin bare path for
 * {@link QITS_BUILDS_URL}'s reason: the edge routes `/events` on every vhost exactly as it routes
 * `/ci`, so a browser session reaches qits-events with no token and no CORS pre-flight.
 *
 * <p>The three names are the whole run lifecycle. `BuildStatusChanged` fires on every transition of
 * a run's status — queued, started, and each terminal state — so **both edges of the active
 * listing are announced**: a run entering it and a run leaving it. `BuildSuccessful` and
 * `BuildFailed` are the platform's older terminal events and are subscribed beside it so a qits-ci
 * that does not publish the new one yet still ends a build on the bolt rather than at the next
 * fallback tick.
 *
 * <p><b>A frame carries nothing this library reads.</b> Not the run, not its status, not its id —
 * a frame means only "go and look", and what is drawn always came out of the listing. Two sources
 * of truth for one number is how a bolt ends up disagreeing with the panel underneath it.
 */
export const QITS_BUILDS_STREAM_URL =
  '/events/api/stream?names=BuildStatusChanged,BuildSuccessful,BuildFailed';

/** How often the panel asks again while it is open. Short, because a build moves in seconds. */
export const QITS_BUILDS_INTERVAL_MS = 5000;

/**
 * How often the count is refreshed while the panel is closed **and there is no stream to hold** —
 * an edge that will not pass server-sent events, a browser that keeps failing to connect, a session
 * without the roles the endpoint wants (`qits:admin`/`qits:system`, the same wall
 * {@link QITS_BUILDS_URL} already stands behind).
 *
 * <p>Slow on purpose, and slow is the point: this is the degraded path, and the choice it settles
 * is *degrade* rather than *disappear*. A permanently grey bolt on a platform that is building
 * something is a wrong answer given confidently; a count that can be half a minute old is a true
 * one told late.
 */
export const QITS_BUILDS_FALLBACK_INTERVAL_MS = 30000;

/**
 * How long a burst of frames is gathered up before the listing is read once for all of them.
 *
 * A push finishing a fan of runs announces every one of them within a few milliseconds, and each
 * frame means the same thing — go and look. Reading per frame would turn one event into a dozen
 * requests and answer the last of them with the same body.
 */
export const QITS_BUILDS_STREAM_DEBOUNCE_MS = 250;

/**
 * How many consecutive failures to open the stream are tried before the interval takes over for
 * good. Two, because the first failure is as likely to be a redeploy as a topology, and the third
 * would only be the second one repeated: where the stream is not passed at all, nothing about
 * asking again makes it passed.
 */
export const QITS_BUILDS_STREAM_ATTEMPTS = 2;

/**
 * The part of `EventSource` this library uses, named so a spec can hand over something else.
 *
 * Angular ships no server-sent-event client and there is nothing to mock in `HttpTestingController`
 * — an `EventSource` is opened by the browser and never goes through `HttpClient` — so the seam has
 * to be the constructor itself, and this interface is what both sides of it agree on. Deliberately
 * smaller than the real thing: no `addEventListener`, because the frames this reads are
 * unnamed-event-only, and no `withCredentials`, because the stream is same-origin.
 */
export interface QitsEventSourceLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

/** Opens a stream at a URL. One function, so a fake is one function. */
export type QitsEventSourceFactory = (url: string) => QitsEventSourceLike;

/**
 * How this library opens a live stream, or `null` where it cannot open one at all.
 *
 * A token rather than a bare `new EventSource(url)` for {@link QITS_BUILDS}' reason: the behaviour
 * most worth testing here is what happens *around* a stream — the read on every connect, the
 * coalesced burst, the fall back to an interval — and none of it is reachable without driving
 * `onopen`, `onmessage` and `onerror` by hand.
 *
 * <p>`null` is a supported answer and the default one off a browser: an SPA rendered on a server
 * has no `EventSource` constructor, and a source that threw there would take the whole chrome down
 * over a header affordance. With no factory the count is kept current by the fallback interval,
 * which is the same degraded path a stream the edge refuses lands on.
 */
export const QITS_EVENT_SOURCE = new InjectionToken<QitsEventSourceFactory | null>(
  'QITS_EVENT_SOURCE',
  {
    providedIn: 'root',
    factory: () =>
      typeof EventSource === 'undefined'
        ? null
        : (url: string) => new EventSource(url) as QitsEventSourceLike,
  },
);

/** The pipeline file's name — `.config/qits/ci-post-receive.yml` is one file, not a path to read. */
export function buildConfigName(configPath: string | undefined): string {
  const trimmed = (configPath ?? '').replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

/**
 * The predicted step durations, or nothing at all.
 *
 * **One unusable entry drops the whole prediction.** The bar the panel draws from this is a set of
 * proportions of one another, so a step whose expectation is missing, zero or not a number would
 * quietly redraw the shape of every *other* step rather than only its own — a wrong picture, where
 * no picture is a true statement about a run qits-ci cannot predict.
 */
function toExpectations(values: unknown): readonly number[] | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const usable = values.every(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  return usable ? (values as readonly number[]) : undefined;
}

/** A row with neither an id nor a repository is not something the panel can draw a line for. */
function toBuild(row: NonNullable<QitsBuildRuns['runs']>[number]): QitsBuild | undefined {
  if (!row?.id || !row.repoName) return undefined;
  return {
    id: row.id,
    repoName: row.repoName,
    branch: row.branch ?? '',
    status: (row.status ?? '').toUpperCase(),
    configPath: row.configPath ?? '',
    commitSha: row.commitSha || undefined,
    // Timestamps are carried as the strings the service sent them as, not parsed here: a run that
    // is only listed has no need of a `Date`, and the panel that ticks against them parses once.
    createdAt: row.createdAt || undefined,
    startedAt: row.startedAt || undefined,
    expectedStepDurationsMillis: toExpectations(row.expectedStepDurationsMillis),
  };
}

/** The rows of an answer, in the order qits-ci listed them. */
export function toBuilds(body: QitsBuildRuns | null | undefined): readonly QitsBuild[] {
  return (body?.runs ?? [])
    .map((row) => toBuild(row ?? {}))
    .filter((build): build is QitsBuild => build !== undefined);
}

/**
 * The active runs as qits-ci sees them, kept current whether or not anybody is looking.
 *
 * <p><b>The listing is read once at startup and then whenever something says to.</b> What says so
 * is the event stream ({@link QITS_BUILDS_STREAM_URL}): a frame carries no state, only the
 * instruction to read the listing again, and a burst of them is gathered into one read. That is
 * what makes a closed panel cheap *and* current at once — the old arrangement could have either,
 * because the only way to learn anything was to ask.
 *
 * <p><b>Every connect re-reads, reconnects included</b>, and that is not belt and braces. The
 * stream is live-only: no replay, no offset, no catch-up. A stream that dropped and came back has
 * missed everything in between and cannot say so, so the listing is the only road back to the
 * truth — and a reconnect is precisely the moment the count is most likely to be wrong.
 *
 * <p><b>Where the stream cannot be held, an interval takes over.</b> Not as a fallback in the sense
 * of a lesser correctness: the listing is the source of truth on both paths, and all that changes
 * is how late an answer may be ({@link QITS_BUILDS_FALLBACK_INTERVAL_MS}).
 *
 * <p>An open panel keeps its own cadence on top of all of this — `watch(true)` is still "ask now
 * and keep asking every few seconds", because a reader watching a run move wants it moving, and a
 * stream frame per second of a build's progress is not something qits-ci publishes.
 *
 * <p>Deliberately no rxjs import, for the reason `HttpNavigationSource` gives: `subscribe()`'s
 * return value is used, never named, so this package keeps its three peer dependencies.
 */
class HttpBuildsSource implements QitsBuildsSource {
  private readonly answered = signal<readonly QitsBuild[] | undefined>(undefined);
  private readonly gaveUp = signal(false);

  readonly runs: Signal<readonly QitsBuild[] | undefined> = this.answered.asReadonly();
  readonly failed: Signal<boolean> = this.gaveUp.asReadonly();

  private readonly http = inject(HttpClient);
  // A cancel function rather than a `Subscription`: naming that type would import rxjs.
  private cancel: (() => void) | undefined = undefined;
  /** The repeating read, and the period it is running at — `undefined` for "no timer at all". */
  private timer: ReturnType<typeof setInterval> | undefined = undefined;
  private period: number | undefined = undefined;
  private coalescing: ReturnType<typeof setTimeout> | undefined = undefined;
  private stream: QitsEventSourceLike | undefined = undefined;
  private failures = 0;
  private watching = false;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly intervalMs: number,
    private readonly fallbackIntervalMs: number,
    private readonly streamUrl: string,
    private readonly openStream: QitsEventSourceFactory | null,
  ) {
    inject(DestroyRef).onDestroy(() => this.stop());
    // The listing first and the stream second, in that order and both at once: the read is what
    // makes the bolt true now, the stream is what keeps it true, and neither waits for the other.
    this.read();
    this.connect();
    this.cadence();
  }

  watch(watching: boolean): void {
    // Idempotent: the layout says "open" on every toggle, and a second one must not double the poll.
    if (watching === this.watching) return;
    this.watching = watching;
    this.cadence();
    // Opening asks straight away, because the panel is about to draw what it gets. Closing asks
    // nothing and forgets nothing — the bolt is still showing the answer.
    if (watching) this.read();
  }

  /**
   * Open the stream, or leave it shut for good.
   *
   * <p>A failure closes it and tries once more; the second one hands the job to the interval and
   * stops. Retrying past that is retrying an edge that does not pass server-sent events, a browser
   * that cannot hold one, or a session the endpoint will not have — and none of those is a thing
   * asking again fixes. A connect that succeeds forgets the failures before it, so a redeploy costs
   * an attempt rather than the stream.
   */
  private connect(): void {
    if (this.stopped || this.stream || !this.openStream) return;
    if (this.failures >= QITS_BUILDS_STREAM_ATTEMPTS) return;
    const stream = this.openStream(this.streamUrl);
    this.stream = stream;
    stream.onopen = () => {
      this.failures = 0;
      this.cadence();
      // A connect is a gap: the stream replays nothing, so what happened while it was down is only
      // knowable from the listing. That is as true of the first connect as of the fifth.
      this.nudge();
    };
    stream.onmessage = () => this.nudge();
    stream.onerror = () => {
      if (this.stream !== stream) return;
      this.drop();
      this.failures += 1;
      this.connect();
      this.cadence();
    };
  }

  private drop(): void {
    this.stream?.close();
    this.stream = undefined;
  }

  /** A frame, or a connect: read the listing once, for this frame and every one right behind it. */
  private nudge(): void {
    clearTimeout(this.coalescing);
    this.coalescing = setTimeout(() => {
      this.coalescing = undefined;
      this.read();
    }, QITS_BUILDS_STREAM_DEBOUNCE_MS);
  }

  /**
   * How often the listing is read on its own, which is one of three things and never two of them:
   * the panel's rate while it is open, nothing at all while a stream is saying when to read, and
   * the slow interval where there is no stream to hold.
   *
   * <p>Comparing the period rather than a flag is what makes this callable from anywhere — a
   * toggle, a connect, a give-up — without restarting a timer that is already running at the right
   * rate, and a restarted interval is a tick that never comes.
   */
  private cadence(): void {
    const period = this.watching
      ? this.intervalMs
      : this.stream
        ? undefined
        : this.fallbackIntervalMs;
    if (period === this.period) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.period = period;
    if (period === undefined) return;
    this.timer = setInterval(() => this.read(), period);
  }

  /** The application is going away: every timer, the stream and a read in flight, all of them. */
  private stop(): void {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.coalescing);
    this.timer = undefined;
    this.period = undefined;
    this.coalescing = undefined;
    this.drop();
    this.cancel?.();
    this.cancel = undefined;
  }

  /**
   * One read. A refresh that fails leaves the failure on screen rather than the rows it had — the
   * queue it last saw is not evidence of the queue now — and a read still in flight when the next
   * tick comes is dropped, because its answer is already the older of the two.
   */
  private read(): void {
    this.cancel?.();
    const subscription = this.http.get<QitsBuildRuns>(this.url).subscribe({
      next: (body) => {
        this.answered.set(toBuilds(body));
        this.gaveUp.set(false);
      },
      // A listing that could not be fetched is not a failed application. The bolt draws itself as
      // unanswered, the panel says one quiet line, and every page around it renders exactly as it
      // did — which is the whole point on a host where `/ci` is not routed at all.
      error: () => {
        this.answered.set([]);
        this.gaveUp.set(true);
      },
    });
    this.cancel = () => subscription.unsubscribe();
  }
}

/**
 * Put the pending-builds bolt in the chrome's top bar, filled from qits-ci.
 *
 * **Requires `provideHttpClient()`** in the same application config. One request goes out when the
 * chrome is built, and from then on the count is kept current by the event stream — so an
 * application that provides this on a host where `/ci` is unreachable pays one failed request per
 * page, and draws a bolt that says out loud that it does not know.
 *
 * Providing it is what puts the bolt there: an application that provides nothing has no bolt, in the
 * same way it has no picker. Pass `url` to point at something other than `/ci/api/runs/active` — a
 * fixture, a dev proxy prefix — `intervalMs` to poll at another rate while the panel is open,
 * `fallbackIntervalMs` for the closed-panel rate where there is no stream, and `streamUrl` to
 * subscribe somewhere else.
 *
 * <p>`eventSource` is the constructor seam: a fake for a spec, and **`null` for no stream at all**,
 * which is the whole of how an application opts out — the count then rides the fallback interval,
 * which is exactly what a browser that cannot hold the stream ends up doing anyway. Left unsaid it
 * is {@link QITS_EVENT_SOURCE}, the browser's own.
 */
export function provideQitsBuilds(options?: {
  readonly url?: string;
  readonly intervalMs?: number;
  readonly fallbackIntervalMs?: number;
  readonly streamUrl?: string;
  readonly eventSource?: QitsEventSourceFactory | null;
}): EnvironmentProviders {
  const url = options?.url ?? QITS_BUILDS_URL;
  const intervalMs = options?.intervalMs ?? QITS_BUILDS_INTERVAL_MS;
  const fallbackIntervalMs = options?.fallbackIntervalMs ?? QITS_BUILDS_FALLBACK_INTERVAL_MS;
  const streamUrl = options?.streamUrl ?? QITS_BUILDS_STREAM_URL;
  return makeEnvironmentProviders([
    {
      provide: QITS_BUILDS,
      useFactory: () =>
        new HttpBuildsSource(
          url,
          intervalMs,
          fallbackIntervalMs,
          streamUrl,
          // `undefined` is "not said", which takes the token's answer; `null` is said, and means no
          // stream. `??` cannot tell those two apart, so the check is explicit.
          options?.eventSource !== undefined ? options.eventSource : inject(QITS_EVENT_SOURCE),
        ),
    },
  ]);
}

/**
 * The same contract answered from a literal: for specs, for stories, and for an app served without
 * the platform in front of it. Nothing is fetched, nothing is polled and no stream is opened, so
 * `watch()` is a no-op and there is no request to flush — the count is "current" by construction,
 * which is the one way this double keeps {@link QitsBuildsSource}' promise.
 */
export function provideQitsBuildList(
  runs: readonly QitsBuild[] | undefined,
  options?: { readonly failed?: boolean },
): EnvironmentProviders {
  const source: QitsBuildsSource = {
    runs: signal<readonly QitsBuild[] | undefined>(runs),
    failed: signal(options?.failed ?? false),
    watch: () => undefined,
  };
  return makeEnvironmentProviders([{ provide: QITS_BUILDS, useValue: source }]);
}
