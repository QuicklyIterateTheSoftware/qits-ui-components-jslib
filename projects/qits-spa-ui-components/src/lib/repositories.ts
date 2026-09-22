import { HttpClient } from '@angular/common/http';
import {
  DestroyRef,
  effect,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  signal,
  type EnvironmentProviders,
  type Signal,
} from '@angular/core';
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
 * Where a project's repositories are asked for — **absolute**, like the other two reads, so the
 * browser's session cookie reaches qits-projects with no machine token and no CORS pre-flight.
 * The project **id** goes in the path: ids are what the service resolves, slugs are what URLs say.
 */
export const QITS_REPOSITORIES_URL = '/projects/api/projects';

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

  constructor(base: string) {
    const http = inject(HttpClient);
    const scope = inject(QITS_SCOPE, { optional: true });

    effect(() => {
      const projectId = scope?.projectId();
      if (projectId === this.asked) return;
      this.asked = projectId;
      this.cancel?.();
      this.answered.set(undefined);
      this.wrapper.set(undefined);
      this.gaveUp.set(false);
      if (!projectId) return;
      const subscription = http
        .get<QitsRepositoryEntries>(`${base}/${encodeURIComponent(projectId)}/repositories`)
        .subscribe({
          next: (body) => {
            this.answered.set(
              (body?.entries ?? [])
                .map((entry) => toRepository(entry?.repository ?? {}))
                .filter((repository): repository is QitsRepository => repository !== undefined),
            );
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
  const url = options?.url ?? QITS_REPOSITORIES_URL;
  return makeEnvironmentProviders([
    { provide: QITS_REPOSITORIES, useFactory: () => new HttpRepositoriesSource(url) },
  ]);
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
  return makeEnvironmentProviders([{ provide: QITS_REPOSITORIES, useValue: source }]);
}
