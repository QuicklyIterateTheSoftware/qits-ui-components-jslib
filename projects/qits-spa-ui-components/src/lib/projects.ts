import { HttpClient } from '@angular/common/http';
import {
  DestroyRef,
  inject,
  Injector,
  InjectionToken,
  makeEnvironmentProviders,
  signal,
  type EnvironmentProviders,
  type Signal,
} from '@angular/core';

import { afterApiOrigin, QitsAppLinks } from './app-links';
import { provideQitsRepositories } from './repositories';

/**
 * One project, as the chrome needs it: an id the API resolves, the **slug** URLs spell, and a name
 * to show. Two identifiers because the two planes disagree on purpose — a slug is readable and can
 * be corrected, an id is stable — and this library is where the reader's URL meets the API.
 */
export interface QitsProject {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

/**
 * The body qits-projects answers a listing with. Two levels deep because the service wraps every
 * row in an entry envelope — room for what a row is *about* the project rather than of it — and the
 * shape is copied here rather than shared: this library depends on no qits module, and the two
 * fields it reads are the two that cannot change without breaking every SPA at once.
 */
export interface QitsProjectEntries {
  readonly entries: readonly { readonly project: QitsProject }[];
}

/**
 * Where `QitsMainLayout` gets the projects its picker offers. The same three states
 * `QitsNavigationSource` has, for the same reason: one page load passes through nothing-yet, an
 * answer, and given-up, and the chrome draws each of them differently.
 */
export interface QitsProjectsSource {
  readonly projects: Signal<readonly QitsProject[] | undefined>;
  readonly failed: Signal<boolean>;
}

/**
 * The projects the chrome offers, behind a token so the two shipped implementations — one that
 * fetches and lives through a pending state, one answered from a literal — do not have to pretend
 * to be one class.
 *
 * **Optional by construction.** An application that provides nothing gets the brand text in the top
 * left, exactly as before this existed. Providing it is what puts the picker there.
 */
export const QITS_PROJECTS = new InjectionToken<QitsProjectsSource>('QITS_PROJECTS');

/**
 * Where the projects are asked for: this path, on **qits-projects' own origin** — the
 * `applications.qits-projects.origin` the navigation serves (see `QitsAppLinks.apiOrigin`).
 *
 * The edge routes an application's paths on its own host only, so from any other SPA this is a
 * cross-origin call: it waits for the navigation to say where qits-projects is, and carries the
 * session with `withCredentials`. A SPA asking *its own* backend for projects would be asking a
 * service that does not own them.
 */
export const QITS_PROJECTS_URL = '/projects/api/projects';

/**
 * The project list as qits-projects sees it: one request, at startup, for the life of the app.
 *
 * Deliberately no rxjs import, for the reason `HttpNavigationSource` gives — `Observable` appears
 * only as an inferred type, types are erased, and this package keeps its three peer dependencies.
 */
class HttpProjectsSource implements QitsProjectsSource {
  private readonly answered = signal<readonly QitsProject[] | undefined>(undefined);
  private readonly gaveUp = signal(false);

  readonly projects: Signal<readonly QitsProject[] | undefined> = this.answered.asReadonly();
  readonly failed: Signal<boolean> = this.gaveUp.asReadonly();

  /**
   * `url` given is used exactly as given; left unsaid, the read waits for qits-projects' origin
   * and goes to {@link QITS_PROJECTS_URL} there.
   */
  constructor(url: string | undefined) {
    // Constructed from a `useFactory`, which runs inside an injection context — that is what makes
    // these `inject()` calls legal from a plain class the injector never sees.
    const http = inject(HttpClient);
    let cancel: (() => void) | undefined;
    const ask = (target: string) => {
      const subscription = http
        .get<QitsProjectEntries>(target, { withCredentials: true })
        .subscribe({
          next: (body) => this.answered.set((body?.entries ?? []).map((entry) => entry.project)),
          // A list that could not be fetched is not a failed application: every page still
          // renders, the chrome just cannot say which projects there are. The layout draws that.
          error: () => {
            this.answered.set([]);
            this.gaveUp.set(true);
          },
        });
      cancel = () => subscription.unsubscribe();
    };
    if (url !== undefined) {
      ask(url);
    } else {
      const links = inject(QitsAppLinks);
      const waiting = afterApiOrigin(links, 'qits-projects', inject(Injector), () =>
        ask(links.apiUrl('qits-projects', QITS_PROJECTS_URL) ?? QITS_PROJECTS_URL),
      );
      cancel ??= waiting;
    }
    inject(DestroyRef).onDestroy(() => cancel?.());
  }
}

/**
 * Put the project picker in the chrome's top-left slot, filled from qits-projects.
 *
 * **Requires `provideHttpClient()`** in the same application config; this issues one `GET` and owns
 * nothing else. The read goes to qits-projects' own origin once `provideQitsNavigation()` has said
 * where that is, and waits until it has. Pass `url` only to point somewhere else — a fixture, a dev
 * proxy prefix — and it is used exactly as given, with no wait.
 *
 * It also installs `QITS_REPOSITORIES`, the repositories of whatever project is in scope: the two
 * reads belong together because the second is only ever about a project from the first. **Which**
 * project is in scope is not decided here — that is the address's job, so an application says how
 * deep its own addresses go with `provideQitsScope(...)`.
 *
 * ```ts
 * bootstrapApplication(App, {
 *   providers: [provideHttpClient(), provideRouter(routes), provideQitsNavigation(),
 *               provideQitsProjects(), provideQitsScope('repository')],
 * });
 * ```
 */
export function provideQitsProjects(options?: { readonly url?: string }): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: QITS_PROJECTS, useFactory: () => new HttpProjectsSource(options?.url) },
    provideQitsRepositories(),
  ]);
}

/**
 * The same contract answered from a literal: for specs, for stories, and for any app served without
 * the platform in front of it.
 *
 * Nothing is fetched, and that is the point rather than a detail — there is no request for
 * `HttpTestingController.verify()` to complain about and no pending task to keep
 * `fixture.whenStable()` from resolving, so a spec about anything *else* in the chrome does not
 * have to know the picker makes a request.
 */
export function provideQitsProjectList(
  projects: readonly QitsProject[],
  options?: { readonly failed?: boolean },
): EnvironmentProviders {
  const source: QitsProjectsSource = {
    projects: signal<readonly QitsProject[] | undefined>(projects),
    failed: signal(options?.failed ?? false),
  };
  return makeEnvironmentProviders([{ provide: QITS_PROJECTS, useValue: source }]);
}
