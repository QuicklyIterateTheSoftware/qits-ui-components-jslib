import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  inject,
  Injectable,
  InjectionToken,
  makeEnvironmentProviders,
  PLATFORM_ID,
  signal,
  type EnvironmentProviders,
  type Signal,
  type WritableSignal,
} from '@angular/core';

import { QitsAppLinks } from './app-links';

/**
 * One work item, as small as a reference's popover needs it — the row qits-projects answers
 * `GET /projects/api/projects/{project}/work/briefs` with (qits-1897). Copied here rather than
 * shared, for the reason `QitsProject` gives: this library depends on no qits module.
 */
export interface QitsWorkBrief {
  readonly id: string;
  /** `<project slug>-<number>`, e.g. `qits-1897`: what a commit subject spells. */
  readonly qualifiedId: string;
  readonly archetype: string;
  readonly status: string;
  readonly title: string;
  /** The instant it last changed, ISO-8601. */
  readonly updatedAt: string;
}

/** The body the briefs door answers with: ids it does not know are simply not in it. */
export interface QitsWorkBriefsResponse {
  readonly briefs: readonly QitsWorkBrief[];
}

/**
 * What a reference knows about its item: the brief, `'pending'` while it is being asked for, and
 * `undefined` where there is none to show — unknown to qits-projects, a read that failed, or a
 * server render, which never asks. A caller draws everything but a brief as plain text.
 */
export type QitsWorkBriefState = QitsWorkBrief | 'pending' | undefined;

/**
 * Where the briefs come from: the briefs of `ids` (qualified ids) in `project` (a slug or an id).
 * An id it does not answer for is missing; a rejection marks every id of the call missing.
 */
export type QitsWorkBriefSource = (
  project: string,
  ids: readonly string[],
) => Promise<readonly QitsWorkBrief[]>;

/** The most ids one call asks for — the door's own limit; more are split into several calls. */
export const QITS_WORK_BRIEFS_MAX_IDS = 200;

/** The briefs door under a project, on qits-projects' own origin: `…/{project}/work/briefs`. */
export const QITS_WORK_BRIEFS_PATH = '/projects/api/projects';

/**
 * The default source: `GET {QITS_WORK_BRIEFS_PATH}/{project}/work/briefs?id=qits-1,qits-2` on
 * qits-projects' own origin, once the navigation has said where that is
 * (`QitsAppLinks.whenApiUrl`), through the app's `HttpClient` — whose `qitsBearerInterceptor` signs
 * it — exactly the way `provideQitsProjects()` reaches qits-projects. The ids go as ONE `id`
 * parameter, comma-separated, each URL-encoded: the form the door's golden master records. An
 * application without
 * `provideHttpClient()` gets no briefs, and every reference stays plain text.
 */
function httpWorkBriefSource(): QitsWorkBriefSource {
  const http = inject(HttpClient, { optional: true });
  const links = inject(QitsAppLinks);
  return async (project, ids) => {
    if (!http) return [];
    const path = `${QITS_WORK_BRIEFS_PATH}/${encodeURIComponent(project)}/work/briefs`;
    const url = await links.whenApiUrl('qits-projects', path);
    const query = `id=${ids.map((id) => encodeURIComponent(id)).join(',')}`;
    return new Promise<readonly QitsWorkBrief[]>((resolve, reject) => {
      http.get<QitsWorkBriefsResponse>(`${url}?${query}`).subscribe({
        next: (body) => resolve(body?.briefs ?? []),
        error: reject,
      });
    });
  };
}

/**
 * The source `QitsWorkBriefs` reads through. Root-provided with the HTTP read above, so a frontend
 * that renders a `<qits-commit-message>` needs nothing else; `provideQitsWorkBriefs(source)` puts
 * an application's own read — or a story's literal — in its place.
 */
export const QITS_WORK_BRIEF_SOURCE = new InjectionToken<QitsWorkBriefSource>(
  'QITS_WORK_BRIEF_SOURCE',
  { providedIn: 'root', factory: httpWorkBriefSource },
);

/**
 * Replace where briefs come from. Without an argument it installs the default HTTP read, which
 * the root already provides — useful only to undo a parent's override.
 *
 * ```ts
 * providers: [provideQitsWorkBriefs((project, ids) => myApi.briefs(project, ids))]
 * ```
 */
export function provideQitsWorkBriefs(source?: QitsWorkBriefSource): EnvironmentProviders {
  return makeEnvironmentProviders([
    source
      ? { provide: QITS_WORK_BRIEF_SOURCE, useValue: source }
      : { provide: QITS_WORK_BRIEF_SOURCE, useFactory: httpWorkBriefSource },
  ]);
}

const NOTHING: Signal<QitsWorkBriefState> = signal<QitsWorkBriefState>(undefined).asReadonly();

/**
 * Work briefs by qualified id, asked for in batches and kept for the life of the application.
 *
 * - **One call per project per tick.** Every `request` made in the same turn of the event loop — a
 *   page of commits rendering forty references — is queued, and one microtask later each project's
 *   ids go out together, split at {@link QITS_WORK_BRIEFS_MAX_IDS}. A microtask rather than a zone
 *   hook, so it works zoneless.
 * - **Asked once.** A brief that arrived, and an id that came back missing or failed, are both
 *   answers: nothing is asked twice, so a flaky door costs one call and leaves plain text.
 * - **Never on the server.** A server render asks nothing and gets `undefined` for every id, so it
 *   renders plain text — the same markup the browser starts from before its answer lands.
 */
@Injectable({ providedIn: 'root' })
export class QitsWorkBriefs {
  private readonly source = inject(QITS_WORK_BRIEF_SOURCE);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly known = new Map<string, WritableSignal<QitsWorkBriefState>>();
  private readonly queued = new Map<string, string[]>();
  private scheduled = false;

  /**
   * What is known about `qualifiedId` in `project`: a signal that starts `'pending'` and settles on
   * the brief or `undefined`. The same signal for the same pair, every time.
   */
  request(project: string, qualifiedId: string): Signal<QitsWorkBriefState> {
    if (!this.browser || !project || !qualifiedId) return NOTHING;
    const key = keyOf(project, qualifiedId);
    let state = this.known.get(key);
    if (!state) {
      state = signal<QitsWorkBriefState>('pending');
      this.known.set(key, state);
      const ids = this.queued.get(project) ?? [];
      ids.push(qualifiedId);
      this.queued.set(project, ids);
      this.schedule();
    }
    return state.asReadonly();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      const batches = [...this.queued];
      this.queued.clear();
      for (const [project, ids] of batches) {
        for (let i = 0; i < ids.length; i += QITS_WORK_BRIEFS_MAX_IDS) {
          this.ask(project, ids.slice(i, i + QITS_WORK_BRIEFS_MAX_IDS));
        }
      }
    });
  }

  private ask(project: string, ids: readonly string[]): void {
    const settle = (briefs: readonly QitsWorkBrief[]) => {
      const byId = new Map(briefs.map((brief) => [brief.qualifiedId, brief]));
      for (const id of ids) this.known.get(keyOf(project, id))?.set(byId.get(id));
    };
    // `then` rather than a direct call, so a source that throws synchronously is a rejection too.
    Promise.resolve()
      .then(() => this.source(project, ids))
      .then(
        (briefs) => settle(Array.isArray(briefs) ? briefs : []),
        () => settle([]),
      );
  }
}

function keyOf(project: string, qualifiedId: string): string {
  return `${project}\u0000${qualifiedId}`;
}
