import {
  DestroyRef,
  DOCUMENT,
  inject,
  InjectionToken,
  Injector,
  makeEnvironmentProviders,
  signal,
  computed,
  type EnvironmentProviders,
  type Signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

import { QitsAppLinks } from './app-links';
import { QITS_PROJECTS } from './projects';
import { QITS_REPOSITORIES } from './repositories';

/**
 * The seven kinds of repository a project holds. The set is closed and the same in every SPA.
 *
 * `apps` and `frontends` are neighbours and are not the same thing: an app is a standalone web
 * application with its own server, its own image and its own deployment, where a frontend is a
 * microfrontend a service carries inside its image.
 */
export type QitsCategory =
  'services' | 'daemons' | 'libs' | 'apps' | 'frontends' | 'cli' | 'images';

/** Every category, in the order the sidebar draws its groups — the edge's slot order. */
export const QITS_CATEGORIES: readonly QitsCategory[] = [
  'services',
  'daemons',
  'libs',
  'apps',
  'frontends',
  'cli',
  'images',
];

function isCategory(segment: string | undefined): segment is QitsCategory {
  return QITS_CATEGORIES.includes(segment as QitsCategory);
}

/**
 * What the address says is on screen: a project, a group inside it, a repository inside that.
 * Empty is the system scope — a page about the platform rather than about one project.
 */
export interface QitsScope {
  /** The project **slug**, which is what URLs name. Ids never appear in a path. */
  readonly project?: string;
  /**
   * The middle segment: the repository's **component** — `qits-ci` — where the platform gives it
   * one, and its archetype category where it does not. One field because the URL has one segment;
   * which of the two spelled it is a fact about the platform, not about the address.
   */
  readonly group?: string;
  /**
   * The legacy archetype form of {@link group}, set only where the segment spells one of the seven.
   * Kept so a caller written before components — a route guard, a link built from a literal — reads
   * and writes the same field it always did.
   */
  readonly category?: QitsCategory;
  /** The repository name, which is unique inside a project. */
  readonly repository?: string;
}

/**
 * The middle segment of a scope, whichever field named it. Every address spells `group` where
 * `parseScope` produced it and `category` where a caller wrote a literal, so this is the one place
 * that knows the two are one segment.
 */
export function scopeGroup(scope: QitsScope | undefined): string | undefined {
  return scope?.group ?? scope?.category;
}

/**
 * The URL grammar every SPA on this platform shares:
 *
 *     /<projectSlug>/<component>/<repoName>/…  a repository, as the platform groups it now
 *     /<projectSlug>/<category>/<repoName>/…   a repository, in the archetype form
 *     /<projectSlug>/…                         a project
 *     /…                                       the platform
 *
 * <p><b>Nothing is a project or a group until the URL proves it.</b> Two closed facts and two
 * lists prove it:
 *
 * <ul>
 *   <li>the seven categories are compiled in, so `/qits/services/qits-ci/runs/1` reads on its own,
 *       before any list has answered;
 *   <li>`knownSlugs` — the project list the chrome already loaded — proves the first segment;
 *   <li>`knownComponents` — the components of the scoped project's repositories — proves the
 *       second. Component names are an <b>open</b> set that only the platform knows, which is why
 *       there is a list here where the categories needed none.
 * </ul>
 *
 * Everything else is the system scope, so an application's own route like `/traces` keeps working
 * and never reads as a project nobody has, and `/qits/epics/1` stays that app's own page inside a
 * project rather than a repository `1` in a component `epics`.
 *
 * <p>A component form therefore <b>settles</b>, exactly as the project form always has: until the
 * repository list answers, `/qits/qits-ci/qits-ci-service` is the project alone. The project it
 * names is the same either way, so nothing re-reads and no address changes underneath the reader.
 *
 * <p>A project is never a category: `/services` is this app's own `services` page, not the
 * services of a project called nothing. qits-projects refuses a slug that spells a category or a
 * routed segment, so the two vocabularies cannot collide from the other side either.
 *
 * <p>Pure by design — no router, no injector — so a route guard, a spec and the chrome all answer
 * the same question the same way.
 */
export function parseScope(
  path: string,
  knownSlugs?: ReadonlySet<string>,
  knownComponents?: ReadonlySet<string>,
): QitsScope {
  const segments = path
    .split(/[?#]/, 1)[0]
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(decodeSegment);
  const [first, second, third] = segments;
  if (!first || isCategory(first)) return {};
  if (isCategory(second)) {
    return third
      ? { project: first, group: second, category: second, repository: third }
      : { project: first, group: second, category: second };
  }
  // The component form is only ever read inside a project the platform names: the components come
  // from that project's own repositories, so without the slug there is nothing to have proved them.
  if (!knownSlugs?.has(first)) return {};
  if (second && knownComponents?.has(second)) {
    return third
      ? { project: first, group: second, repository: third }
      : { project: first, group: second };
  }
  return { project: first };
}

/** A segment that never decoded is better than one that threw: a malformed escape is not a crash. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Where a scope lives, as a directory path: `/`, `/qits/`, `/qits/qits-ci/qits-ci-service/`.
 *
 * The trailing slash is what makes it a prefix worth testing against — `/qits/` cannot match
 * `/qits-platform/`. A group without a repository does not get its own segment here: nothing is
 * served at `/qits/services/`, so the honest base for such a page is the project it is in.
 */
export function scopePath(scope: QitsScope | undefined): string {
  if (!scope?.project) return '/';
  const group = scopeGroup(scope);
  if (group && scope.repository) {
    return `/${scope.project}/${group}/${scope.repository}/`;
  }
  return `/${scope.project}/`;
}

/** The same prefix as router commands, for an in-app absolute link: `[...scopeCommands(s), 'runs']`. */
export function scopeCommands(scope: QitsScope | undefined): readonly string[] {
  if (!scope?.project) return ['/'];
  const group = scopeGroup(scope);
  if (group && scope.repository) {
    return ['/', scope.project, group, scope.repository];
  }
  return ['/', scope.project];
}

/**
 * How deep an application's own addresses go.
 *
 * - `repository` — its pages belong to one repository (ci, docs, artifacts, configuration,
 *   workspaces), so it routes `/<slug>/<group>/<repo>/…`;
 * - `project` — its pages belong to a project (events, deployments, observability, maintenance);
 * - `system` — its pages are about the platform (mirror, orchestrator, system, githost). Such an
 *   app has no project route at all, which is why picking a project there *leaves* for
 *   qits-projects rather than rewriting an address that would 404.
 */
export type QitsRouting = 'repository' | 'project' | 'system';

/**
 * What the chrome asks about the address, and what picking a project does.
 *
 * <p><b>There is deliberately no setter that only remembers.</b> `select` navigates, so the URL
 * stays the single statement of what is on screen. A scope that stored the pick beside the URL
 * would be a second source of truth, and the two would disagree the first time someone pressed the
 * back button.
 */
export interface QitsScopeSource {
  /** The scope the address states. */
  readonly scope: Signal<QitsScope>;
  /** The scoped project's id, resolved from the project list — `undefined` until it answers. */
  readonly projectId: Signal<string | undefined>;
  /** The scoped repository's id, resolved from the repository list of that project. */
  readonly repositoryId: Signal<string | undefined>;
  /** How deep this application's own addresses go. */
  readonly routing: QitsRouting;
  /** Go to a project — or, for `undefined`, out of the one currently scoped. */
  select(projectSlug: string | undefined): void;
}

/**
 * How the chrome asks what is in scope. Optional: with no scope provided the picker is not
 * rendered at all, because a control that cannot say what is selected and cannot act on a pick is
 * worse than the brand text it replaced.
 */
export const QITS_SCOPE = new InjectionToken<QitsScopeSource>('QITS_SCOPE');

/**
 * The scope, read from the address and nothing else.
 *
 * <p>The URL and <b>not</b> storage, deliberately. A remembered pick would make the same address
 * render differently for two people and would silently re-scope a page opened from a bookmark. The
 * path keeps every address a complete statement of what it shows, and keeps it shareable.
 *
 * <p>No rxjs operators: the router events are a plain subscription with an `instanceof` test, which
 * keeps this package on its three peer dependencies. The signal is <i>seeded</i> from `router.url`
 * as well as fed by the stream, because a reader landing directly on a scoped URL gets no
 * `NavigationEnd` before the first render.
 *
 * <p>The project list and the repository list are reached through the injector rather than injected
 * as fields: the repository source asks <i>this</i> scope which project is open, and a field would
 * make that a construction cycle instead of a read.
 *
 * <p>Not decorated, and constructed by `provideQitsScope`'s factory: `routing` is an argument, not
 * something the injector could supply.
 */
export class UrlScope implements QitsScopeSource {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly doc = inject(DOCUMENT);
  private readonly url = signal(this.router.url);

  readonly routing: QitsRouting;

  /**
   * The slugs the platform actually has. Needed for the project form of the grammar alone —
   * `/<slug>/whatever` is indistinguishable from this app's own `/whatever/…` page until the list
   * arrives, so a project-scoped page's first paint is unscoped and settles when it answers.
   */
  private readonly knownSlugs = computed(() => {
    const projects = this.injector.get(QITS_PROJECTS, null, { optional: true });
    return new Set((projects?.projects() ?? []).map((project) => project.slug).filter(Boolean));
  });

  /**
   * The components the scoped project's repositories carry. An open set that only the platform
   * knows, which is why it is read rather than compiled in — and why a component address settles
   * once the repository list answers, the way a project address settles on the project list.
   */
  private readonly knownComponents = computed(() => {
    const repositories = this.injector.get(QITS_REPOSITORIES, null, { optional: true });
    return new Set(
      (repositories?.repositories() ?? [])
        .map((repository) => repository.component)
        .filter((component): component is string => !!component),
    );
  });

  /**
   * The project alone, decided without the repository list.
   *
   * <p>Kept separate on purpose: the repository read is keyed on this, and the components come out
   * of what that read answers. Reading the deep scope here would make the answer re-trigger the
   * question. The two always agree on the project — the component form is only read for a slug
   * `knownSlugs` already proved.
   */
  private readonly projectScope = computed(() => parseScope(this.url(), this.knownSlugs()));

  readonly scope = computed(() =>
    parseScope(this.url(), this.knownSlugs(), this.knownComponents()),
  );

  readonly projectId = computed(() => {
    const slug = this.projectScope().project;
    if (!slug) return undefined;
    const projects = this.injector.get(QITS_PROJECTS, null, { optional: true });
    return projects?.projects()?.find((project) => project.slug === slug)?.id;
  });

  readonly repositoryId = computed(() => {
    const name = this.scope().repository;
    if (!name) return undefined;
    const repositories = this.injector.get(QITS_REPOSITORIES, null, { optional: true });
    return repositories?.repositories()?.find((repository) => repository.name === name)?.id;
  });

  constructor(routing: QitsRouting) {
    this.routing = routing;
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.url.set(this.router.url);
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  /**
   * Go to the project — on this host where this application has a project route, and to
   * qits-projects where it does not.
   *
   * A `system` app is about the platform rather than about a project, so `/<slug>/` there is not an
   * address it serves. Leaving for the projects host is the honest answer: the pick is acted on,
   * and the reader lands on the project rather than on a 404 with the right URL.
   *
   * <p><b>No trailing slash on the router's form, deliberately.</b> `DefaultUrlSerializer` parses
   * `/qits/` as two segments — `qits` and an empty one — so a route table with `:project` never
   * matches and every pick lands on the app's `**`. A full-document href keeps its trailing slash:
   * there the browser asks for the path and `Location` normalises it away before any route is
   * matched, which is why `scopePath` and `QitsAppLinks.href` are unaffected.
   */
  select(projectSlug: string | undefined): void {
    if (this.routing !== 'system') {
      void this.router.navigateByUrl(projectSlug ? `/${projectSlug}` : '/');
      return;
    }
    const links = this.injector.get(QitsAppLinks);
    const href = links.href(
      'qits-projects',
      '',
      projectSlug ? { project: projectSlug } : {},
      '/projects/',
    );
    if (href) this.doc.location.assign(href);
  }
}

/**
 * Read the scope out of the address, and say how deep this application's own addresses go.
 *
 * ```ts
 * bootstrapApplication(App, {
 *   providers: [provideHttpClient(), provideRouter(routes), provideQitsNavigation(),
 *               provideQitsProjects(), provideQitsScope('repository')],
 * });
 * ```
 */
export function provideQitsScope(routing: QitsRouting): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: QITS_SCOPE, useFactory: () => new UrlScope(routing) },
  ]);
}
