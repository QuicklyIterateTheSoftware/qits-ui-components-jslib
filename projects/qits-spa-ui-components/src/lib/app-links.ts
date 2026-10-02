import {
  DOCUMENT,
  effect,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';

import { QITS_NAVIGATION, type QitsNavEntry, type QitsNavSlot } from './navigation';
import { scopePath, type QitsScope } from './scope';

/**
 * The origin the browser has this SPA open at — the seam a spec replaces to say "we are on the ci
 * host". The factory reads the document rather than `window`, so a server render has an answer too.
 */
export const QITS_BROWSER_ORIGIN = new InjectionToken<string>('QITS_BROWSER_ORIGIN', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).location?.origin ?? '',
});

/** The host part of an origin, port included — or `undefined` for something that is not one. */
function hostOf(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}

/** `a` + `b` with exactly one slash between them, whatever each side brought. */
function join(prefix: string, path: string): string {
  return `${prefix.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Addresses of the *other* applications on this platform.
 *
 * <p>Every service is its own host — `ci.dev.example.com` — and every SPA shares one URL grammar
 * beneath it, so a cross-application link is an origin from the navigation plus the scope path of
 * whatever is on screen. Nothing here is compiled in: an application the platform does not serve
 * has no origin, and this says so with `undefined` rather than inventing one.
 *
 * <p>Full-document links on purpose. The destination is a different Angular application, so
 * `routerLink` would compile and go nowhere.
 */
@Injectable({ providedIn: 'root' })
export class QitsAppLinks {
  private readonly source = inject(QITS_NAVIGATION, { optional: true });
  private readonly browserOrigin = inject(QITS_BROWSER_ORIGIN);
  private readonly doc = inject(DOCUMENT);
  /**
   * Optional: an application always has one, a bare spec of this service need not. The router is
   * asked before the document because it is the address the reader actually navigated to.
   */
  private readonly router = inject(Router, { optional: true });
  private readonly injector = inject(Injector);

  /** The first entry for an application — one application may appear in several slots. */
  private entry(app: string): QitsNavEntry | undefined {
    return this.source?.tree()?.entries.find((entry) => entry.app === app);
  }

  /**
   * Where an application is served on a host of its own, or `undefined` while it has none. The
   * platform's `applications.<app>.origin` wins where it was served — it is the edge's statement
   * of where the application answers — and the origin of a hosted entry is the older answer.
   */
  origin(app: string): string | undefined {
    const declared = this.source?.tree()?.origins?.[app];
    if (declared) return declared;
    const entry = this.entry(app);
    return entry?.host ? entry.origin : undefined;
  }

  /**
   * The origin to prefix an API path of another application with — `https://projects.example` for
   * `/projects/api/projects` — read from `applications.<app>.origin` of the navigation.
   *
   * Three answers, and a caller treats each differently:
   *
   * - `undefined`: the navigation has not answered yet. **Wait**, rather than firing at `''` — a
   *   relative call made now goes to this SPA's own host, which no longer routes another
   *   application's paths. Reading this inside a `computed`/`effect` re-runs when the answer
   *   lands; outside one, use {@link whenApiOrigin}.
   * - an origin: the application's own, no trailing slash. The call is cross-origin and has to
   *   carry the session itself — `credentials: 'include'` / `withCredentials: true`.
   * - `''`: the navigation answered (or gave up) and named no origin for this application, or there
   *   is no navigation provided at all. The path is used as it is, same-origin — exactly the call
   *   every SPA made before the field existed, which keeps an edge that does not serve it working.
   *
   * Deliberately **not** the hosted entry's origin as a fallback: an edge too old to serve this
   * field is also too old to answer the cross-origin request such a call would be.
   */
  apiOrigin(app: string): string | undefined {
    if (!this.source) return '';
    const tree = this.source.tree();
    if (!tree) return undefined;
    return tree.origins?.[app] ?? '';
  }

  /**
   * {@link apiOrigin} joined to `path` — `https://projects.example/projects/api/projects`, the bare
   * `/projects/api/projects` where no origin was declared, and `undefined` while the navigation has
   * not answered.
   */
  apiUrl(app: string, path: string): string | undefined {
    const origin = this.apiOrigin(app);
    return origin === undefined ? undefined : origin ? join(origin, path) : path;
  }

  /**
   * {@link apiOrigin} once it is known: resolves immediately when the navigation has answered, and
   * the moment it does otherwise. Never rejects — a navigation that fails resolves with `''`.
   */
  whenApiOrigin(app: string): Promise<string> {
    return new Promise((resolve) => afterApiOrigin(this, app, this.injector, resolve));
  }

  /** {@link apiUrl} once it is known, on {@link whenApiOrigin}'s terms. */
  whenApiUrl(app: string, path: string): Promise<string> {
    return new Promise((resolve) =>
      afterApiOrigin(this, app, this.injector, () => resolve(this.apiUrl(app, path) ?? path)),
    );
  }

  /** Where the environment itself is served — the origin of a clone URL, and of a legacy link. */
  environmentOrigin(): string | undefined {
    return this.source?.tree()?.environmentOrigin;
  }

  /** The entries of one slot, in the order they are meant to be drawn. */
  entries(slot: QitsNavSlot): readonly QitsNavEntry[] {
    return this.source?.tree()?.entries.filter((entry) => entry.slot === slot) ?? [];
  }

  /**
   * Where an application's browsable API document lives, as a full URL — the application's own
   * origin plus the path it declared. `undefined` is a real answer with two causes a caller treats
   * alike: the application publishes no document, or the platform has not answered yet.
   *
   * The application's own host on purpose: the path is one of its own routes, and its own host is
   * what serves those — `applications.<app>.origin` first, then a hosted entry's origin. Only an
   * application with neither falls back to the environment origin, which is where an older
   * platform still serves it.
   */
  apiDocsUrl(app: string): string | undefined {
    const path = this.source?.tree()?.apiDocs[app];
    const origin = this.origin(app) ?? this.environmentOrigin();
    if (!path || !origin) return undefined;
    return join(origin, path);
  }

  /**
   * A link into another application: its origin, the scope path, then `path`.
   *
   * An application with **no host of its own** is still served under the environment origin at its
   * own segment, which the platform states as `entry.path`. It has no scoped address, so the scope
   * is deliberately dropped there rather than spelled into a URL that would 404 —
   * `https://dev.example.com/artifacts/images`, not `…/artifacts/qits/services/…`.
   *
   * `legacyFallback` is that same segment for an application the platform names in no entry at all.
   * The entry's own path wins where there is one: it is the platform's live statement, and the
   * argument is a caller's guess frozen at release time. With neither, there is no address this
   * library can honestly spell and the caller gets `undefined`.
   */
  href(app: string, path: string, scope?: QitsScope, legacyFallback?: string): string | undefined {
    const own = this.origin(app);
    if (own) return join(own, join(scopePath(scope), path));
    const environment = this.environmentOrigin();
    const segment = this.entry(app)?.path || legacyFallback;
    if (!environment || !segment) return undefined;
    return join(environment, join(`${segment}/`, path));
  }

  /** The path the reader is on: the router's URL where there is one, else the document's. */
  currentPath(): string {
    const url = this.router?.url ?? this.doc.location?.pathname ?? '/';
    return url.split(/[?#]/, 1)[0] || '/';
  }

  /**
   * Whether an entry is the page on screen: the host that serves it, and a path inside its scope.
   *
   * Both halves are needed. The host alone would mark every entry of an application current
   * wherever the reader is inside it; the path alone would mark the ci entry current on the docs
   * host, because both spell the same repository path.
   *
   * An application with no host of its own is asked the same question in its own terms: it is
   * current where the reader is on the environment origin, under its segment. The scope plays no
   * part there, because such an application has no scoped address to be inside.
   *
   * An entry with a subpath is current only inside that view — the scope path plus the subpath —
   * which with the empty subpath reduces exactly to the scope test every entry always had.
   */
  isCurrent(entry: QitsNavEntry, scope?: QitsScope): boolean {
    const host = hostOf(entry.origin);
    if (!host || host !== hostOf(this.browserOrigin)) return false;
    // Both sides are compared slash-terminated. The router serializes the scope ROOT without its
    // trailing slash — `/qits/services/qits-ci`, one character short of the scope path — and that
    // page is exactly the one this entry's own row opens; bare `startsWith` also let a sibling
    // whose name extends the asked-for path (`…/api-docs-2` under `…/api-docs`) read as inside it.
    const current = `${this.currentPath().replace(/\/+$/, '')}/`;
    if (!entry.host) return entry.path !== '' && current.startsWith(`${entry.path}/`);
    return current.startsWith(`${join(scopePath(scope), entry.subpath).replace(/\/+$/, '')}/`);
  }
}

/**
 * Run `then` with an application's API origin as soon as there is one — **synchronously** when the
 * navigation has already answered (a literal tree, no navigation at all), so a read that could go
 * out at once still does, and otherwise from an effect the moment it answers. Returns a cancel.
 *
 * Internal to the library: the chrome's sources wait through this, an application uses
 * `whenApiOrigin`.
 */
export function afterApiOrigin(
  links: QitsAppLinks,
  app: string,
  injector: Injector,
  then: (origin: string) => void,
): () => void {
  const now = links.apiOrigin(app);
  if (now !== undefined) {
    then(now);
    return () => undefined;
  }
  let done = false;
  const ref = effect(
    () => {
      const origin = links.apiOrigin(app);
      if (origin === undefined || done) return;
      done = true;
      untracked(() => then(origin));
      ref.destroy();
    },
    { injector },
  );
  return () => {
    done = true;
    ref.destroy();
  };
}
