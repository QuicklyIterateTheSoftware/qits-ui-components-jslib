import { HttpClient } from '@angular/common/http';
import {
  DestroyRef,
  effect,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  makeEnvironmentProviders,
  PendingTasks,
  signal,
  untracked,
  type EnvironmentProviders,
  type Signal,
} from '@angular/core';
import { afterApiOrigin, QitsAppLinks } from './app-links';
import { QITS_SCOPE, type QitsCategory } from './scope';

/** One repository, as the chrome needs it: an id, the name URLs spell, and the group it draws in. */
export interface QitsRepository {
  readonly id: string;
  readonly name: string;
  /**
   * The technical component this repository is part of — `qits-ci` — which is what the sidebar
   * groups by and what the address spells. Absent on a platform whose wrapper is not reorganised
   * yet, and then the archetype category below is the group.
   */
  readonly component?: string;
  /** `undefined` for an archetype this library does not know. */
  readonly category: QitsCategory | undefined;
}

/**
 * The archetype qits-projects records, mapped to the category the chrome groups a componentless
 * repository by — and, under it, the `<category>.details` slot its children come from.
 *
 * <p><b>Copied, not imported.</b> This library depends on no qits module, so the table lives here;
 * an archetype it does not know maps to nothing, and a repository with neither a component nor a
 * known archetype is left out of the groups rather than filed under a guess.
 */
const CATEGORY_OF: Readonly<Record<string, QitsCategory>> = {
  SERVICE: 'services',
  DAEMON: 'daemons',
  LIBRARY: 'libs',
  APP: 'apps',
  FRONTEND: 'frontends',
  CLI: 'cli',
  IMAGE: 'images',
};

/** The rows qits-projects answers a repository listing with, and the wrapper it names beside them. */
export interface QitsRepositoryEntries {
  readonly entries?: readonly {
    readonly repository?: {
      readonly id?: string;
      readonly name?: string;
      readonly archetype?: string;
      /**
       * The component, once qits-projects records one. `null` for a row that has none and absent
       * altogether from a platform released before the field existed — both mean the same here, so
       * neither is a reason to leave the row out.
       */
      readonly component?: string | null;
    };
  }[];
  readonly wrapper?: { readonly repositoryId?: string } | null;
}

/**
 * Where `QitsMainLayout` gets the repositories of the project in scope. The same three states the
 * other two sources have — nothing yet, an answer, given up — because the sidebar draws each one
 * differently, and "no project in scope" is the fourth: nothing to ask for, so nothing pending.
 */
export interface QitsRepositoriesSource {
  readonly repositories: Signal<readonly QitsRepository[] | undefined>;
  /** The project's wrapper repository, which is the one that holds the others as submodules. */
  readonly wrapperRepositoryId: Signal<string | undefined>;
  readonly failed: Signal<boolean>;
}

/** The repositories of the scoped project, behind a token so a literal can stand in for the read. */
export const QITS_REPOSITORIES = new InjectionToken<QitsRepositoriesSource>('QITS_REPOSITORIES');

/**
 * Where a project's repositories are asked for: under this path, on **qits-projects' own origin**
 * (`QitsAppLinks.apiOrigin('qits-projects')`), with the session carried by `withCredentials` — the
 * same arrangement as the project list. The project **id** goes in the path: ids are what the
 * service resolves, slugs are what URLs say.
 */
export const QITS_REPOSITORIES_URL = '/projects/api/projects';

/**
 * `provideQitsRepositories({ url })`'s `url`, for {@link QitsProjectRepositoryLookup} to ask under
 * the same base the scoped source does. Internal: unset, both wait for qits-projects' origin.
 */
const QITS_REPOSITORIES_BASE = new InjectionToken<string>('QITS_REPOSITORIES_BASE');

/** The listing of one project's repositories, under `root` — the one door both readers use. */
function repositoriesUrl(root: string, projectId: string): string {
  return `${root}/${encodeURIComponent(projectId)}/repositories`;
}

/** qits-projects' answer, as the repositories the chrome knows how to draw; unusable rows dropped. */
function toRepositories(body: QitsRepositoryEntries | null): QitsRepository[] {
  return (body?.entries ?? [])
    .map((entry) => toRepository(entry?.repository ?? {}))
    .filter((repository): repository is QitsRepository => repository !== undefined);
}

function toRepository(row: {
  id?: string;
  name?: string;
  archetype?: string;
  component?: string | null;
}): QitsRepository | undefined {
  if (!row?.id || !row.name) return undefined;
  return {
    id: row.id,
    name: row.name,
    component: row.component || undefined,
    category: CATEGORY_OF[row.archetype ?? ''],
  };
}

/**
 * The repositories of whatever project is in scope: one request per project, and none at all while
 * no project is open.
 *
 * <p>The read is keyed on the project <b>id</b>, so re-rendering, a query parameter changing or a
 * hop between two pages of the same project cost nothing. Leaving a project cancels a read still in
 * flight — its answer would be about a project nobody is looking at any more.
 */
class HttpRepositoriesSource implements QitsRepositoriesSource {
  private readonly answered = signal<readonly QitsRepository[] | undefined>(undefined);
  private readonly wrapper = signal<string | undefined>(undefined);
  private readonly gaveUp = signal(false);

  readonly repositories: Signal<readonly QitsRepository[] | undefined> = this.answered.asReadonly();
  readonly wrapperRepositoryId: Signal<string | undefined> = this.wrapper.asReadonly();
  readonly failed: Signal<boolean> = this.gaveUp.asReadonly();

  private asked: string | undefined = undefined;
  // A cancel function rather than a `Subscription`: naming that type would import rxjs, which this
  // package does not have as a peer. `subscribe()`'s return value is used, never described.
  private cancel: (() => void) | undefined = undefined;

  /**
   * `base` given is used exactly as given; left unsaid, each read waits for qits-projects' origin
   * and goes under {@link QITS_REPOSITORIES_URL} there.
   */
  constructor(base: string | undefined) {
    const http = inject(HttpClient);
    const scope = inject(QITS_SCOPE, { optional: true });
    const links = base === undefined ? inject(QitsAppLinks) : undefined;

    effect(() => {
      const projectId = scope?.projectId();
      // Until the navigation says where qits-projects is there is nowhere to ask, and nothing is
      // recorded as asked — the effect runs again the moment the answer lands.
      const root = base ?? links?.apiUrl('qits-projects', QITS_REPOSITORIES_URL);
      if (root === undefined) return;
      if (projectId === this.asked) return;
      this.asked = projectId;
      this.cancel?.();
      this.answered.set(undefined);
      this.wrapper.set(undefined);
      this.gaveUp.set(false);
      if (!projectId) return;
      const subscription = http
        .get<QitsRepositoryEntries>(repositoriesUrl(root, projectId), { withCredentials: true })
        .subscribe({
          next: (body) => {
            this.answered.set(toRepositories(body));
            this.wrapper.set(body?.wrapper?.repositoryId ?? undefined);
          },
          // A listing that could not be fetched is not a failed application: the sidebar says so
          // and every page still renders.
          error: () => {
            this.answered.set([]);
            this.gaveUp.set(true);
          },
        });
      this.cancel = () => subscription.unsubscribe();
    });

    inject(DestroyRef).onDestroy(() => this.cancel?.());
  }
}

/**
 * The repository listing behind `QITS_REPOSITORIES`, installed by `provideQitsProjects()`.
 *
 * **Requires `provideHttpClient()` and a scope** (`provideQitsScope`): with no scope there is no
 * project to ask about, and the source stays empty rather than guessing at one.
 */
export function provideQitsRepositories(options?: { readonly url?: string }): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: QITS_REPOSITORIES, useFactory: () => new HttpRepositoriesSource(options?.url) },
    ...(options?.url === undefined
      ? []
      : [{ provide: QITS_REPOSITORIES_BASE, useValue: options.url }]),
  ]);
}

/** One project's repositories as {@link QitsProjectRepositoryLookup} has them so far. */
export interface QitsProjectRepositories {
  /** `undefined` while the listing is being asked for. */
  readonly repositories: readonly QitsRepository[] | undefined;
  readonly failed: boolean;
}

/**
 * The repositories of **any** project by id, for a page that has to resolve a repository outside
 * the project in scope — or with no project in scope at all, like qits-ci's `/runs/<id>`.
 *
 * <p>The same door and the same mapping as `QITS_REPOSITORIES`' own read: `GET
 * {@link QITS_REPOSITORIES_URL}/{projectId}/repositories` on qits-projects' origin, waiting for the
 * navigation to state it, with the session. One request per project for the life of the
 * application; a failed read is not kept, so the next ask tries again. Each read is a pending task,
 * so `whenStable()` waits for it.
 *
 * <p>Root-provided and replaceable; `provideQitsRepositoryList(...)` stands in for it with its
 * literal, so a spec or a story fetches nothing here either.
 */
@Injectable({ providedIn: 'root' })
export class QitsProjectRepositoryLookup {
  private readonly http = inject(HttpClient);
  private readonly links = inject(QitsAppLinks);
  private readonly injector = inject(Injector);
  private readonly pending = inject(PendingTasks);
  private readonly base = inject(QITS_REPOSITORIES_BASE, { optional: true }) ?? undefined;
  private readonly cache = new Map<string, Signal<QitsProjectRepositories>>();

  /**
   * The project's repositories, asked for on the first call and shared by every later one. Safe to
   * call from a `computed`: nothing it starts is tracked.
   */
  repositories(projectId: string): Signal<QitsProjectRepositories> {
    const cached = this.cache.get(projectId);
    if (cached) return cached;
    const state = signal<QitsProjectRepositories>({ repositories: undefined, failed: false });
    this.cache.set(projectId, state.asReadonly());
    untracked(() => {
      const done = this.pending.add();
      const ask = (root: string) =>
        this.http
          .get<QitsRepositoryEntries>(repositoriesUrl(root, projectId), { withCredentials: true })
          .subscribe({
            next: (body) => {
              state.set({ repositories: toRepositories(body), failed: false });
              done();
            },
            error: () => {
              this.cache.delete(projectId);
              state.set({ repositories: [], failed: true });
              done();
            },
          });
      if (this.base !== undefined) {
        ask(this.base);
        return;
      }
      afterApiOrigin(this.links, 'qits-projects', this.injector, () =>
        ask(this.links.apiUrl('qits-projects', QITS_REPOSITORIES_URL) ?? QITS_REPOSITORIES_URL),
      );
    });
    return state.asReadonly();
  }
}

/**
 * The same contract answered from a literal: for specs, for stories, and for an app served without
 * the platform in front of it. Nothing is fetched, so there is no request to flush.
 */
export function provideQitsRepositoryList(
  repositories: readonly QitsRepository[],
  wrapperRepositoryId?: string,
  options?: { readonly failed?: boolean },
): EnvironmentProviders {
  const source: QitsRepositoriesSource = {
    repositories: signal<readonly QitsRepository[] | undefined>(repositories),
    wrapperRepositoryId: signal(wrapperRepositoryId),
    failed: signal(options?.failed ?? false),
  };
  const answer = signal<QitsProjectRepositories>({
    repositories,
    failed: options?.failed ?? false,
  }).asReadonly();
  // The literal stands for whichever project asks, the way it does for the scoped listing.
  const lookup: Pick<QitsProjectRepositoryLookup, 'repositories'> = { repositories: () => answer };
  return makeEnvironmentProviders([
    { provide: QITS_REPOSITORIES, useValue: source },
    { provide: QitsProjectRepositoryLookup, useValue: lookup },
  ]);
}
