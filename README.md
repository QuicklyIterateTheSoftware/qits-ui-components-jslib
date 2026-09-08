# qits-ui-components-jslib

The shared Angular component library for qits frontends, published as **`@qits/ui-components`**.

Standalone components with typed inputs, `OnPush` change detection and self-contained styles.
Nothing here fetches or stores: a component that needed data would belong to the app that has it.

**One exception, and only one: `QitsMainLayout` asks the platform what the platform contains.** The
rule holds because it is about _ownership_ — a component must not go looking for data some
application already has. The chrome is the case where no application has it. What the platform
serves is known to the edge and to nothing else; what a project holds is known to qits-projects; and
each SPA knows only itself. So the chrome makes three reads, and everything else in this package
still takes what it renders as an input.

A fourth read hangs off the same rule and is opt-in: the pending-builds bolt asks qits-ci what it is
building, and keeps that count current off the platform's event stream whether or not anybody has
opened the panel over it.

| Component        | Selector             | What it is                                                                                                                                                                                                                      |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QitsButton`     | `<qits-button>`      | The button. `variant` (`primary`/`secondary`/`ghost`), `size` (`sm`/`md`/`lg`), `type`, `disabled`, `busy`; emits `pressed`.                                                                                                     |
| `QitsBadge`      | `<qits-badge>`       | A short status word. Required `label`, semantic `tone` (`neutral`/`info`/`success`/`warning`/`danger`).                                                                                                                          |
| `QitsCard`       | `<qits-card>`        | A titled surface. `heading`, `subheading`, `elevated`; projects into the body, and `[qitsCardActions]` into the header.                                                                                                          |
| `QitsPicker`     | `<qits-picker>`      | Pick one of a list. Required `options` (`{ value: T, label: string }[]`), two-way `value` of `T \| undefined`; `compareWith`, `placeholder`, `disabled`.                                                                         |
| `QitsMainLayout` | `<qits-main-layout>` | The application skeleton: the project picker, the pending-builds bolt beside it, the nested sidebar, and the `<router-outlet />` the app's child routes render into. `brand` is the top-left fallback; `links` an override in the flat shape. |
| `QitsNavSubmenu` | `[qitsNavSubmenu]`   | Marks an `<ng-template>` as the sub-menu under the current navigation row. The layout gives it a box; the app styles what goes in it.                                                                                            |

`busy` is separate from `disabled` on purpose: both stop a press, but only `busy` sets
`aria-busy`, so a host can say "working…" without also claiming the action is unavailable. Tones
are semantic names rather than colours, which keeps a restyle of the whole system inside this
repository.

In `QitsPicker` the list **is** the empty state: with nothing chosen the options stand open in the
flow of the page, and choosing one collapses them into the bar above beside a clear button that
puts them back. There is no closed-and-empty state, so nobody has to open anything to see what
they can pick. A rail down the left of the bar and the rows carries a caret: half opacity where
the pointer or the arrow keys are resting, full opacity once the choice is locked into the bar.

```ts
type Env = { id: string };
const environments: QitsPickerOption<Env>[] = [
  { value: { id: 'dev' }, label: 'Development' },
  { value: { id: 'prod' }, label: 'Production' },
];
```

```html
<qits-picker [options]="environments" [(value)]="env" [compareWith]="sameId" />
```

`value` is a `model`, so `[(value)]` binds both ways and `(valueChange)` alone is the output —
`T | undefined`, the second half meaning cleared. Values are matched with `Object.is` unless
`compareWith` says otherwise, which is what objects that crossed a serialisation boundary need. A
`value` matching no option shows the list, because the component cannot render a label it was not
given. The rows follow the ARIA listbox pattern: the list is one tab stop, arrows and `Home`/`End`
move the caret, `Enter` picks.

## The URL is the single source of truth

Every service on this platform is its own host, and every SPA under it shares one grammar:

    https://<app>.<env>.<domain>/<projectSlug>/<component>/<repoName>/…  a repository
    https://<app>.<env>.<domain>/<projectSlug>/<category>/<repoName>/…   the same, before components
    https://<app>.<env>.<domain>/<projectSlug>/…                         a project
    https://<app>.<env>.<domain>/…                                       the platform

The middle segment is the repository's **component** — the technical unit `qits-ci`, which its
service, its frontend and its daemon all belong to. A repository the platform has not given one
keeps spelling its archetype category there; the six are `services daemons libs frontends cli
images`. Both forms resolve, and `QitsScope` carries the segment as `group` either way, with
`category` set as well where it spells one of the six.

```ts
parseScope('/qits/services/qits-ci-service/runs/1'); // { project, group: 'services', category: 'services', repository: 'qits-ci-service' }
parseScope('/traces'); //                           {} — an application's own page
parseScope('/qits/epics/1', knownSlugs); //         { project: 'qits' } — the platform has that slug
parseScope('/qits/qits-ci/qits-ci-service', knownSlugs, knownComponents);
//                                                  { project: 'qits', group: 'qits-ci', repository: 'qits-ci-service' }
```

**Nothing is a project or a group until the URL proves it.** The six categories are compiled in, so
the archetype form reads before any list has answered. Everything else takes a list: `knownSlugs` —
the project list the chrome loaded — proves segment one, and `knownComponents` — the components of
that project's repositories — proves segment two, because component names are an **open** set only
the platform knows. So a component address _settles_, exactly as the project form always has: until
the repository list answers, `/qits/qits-ci/qits-ci-service` is the project alone, and the project
it names never changes. That rule is what lets every SPA keep its own top-level routes, and what
keeps `/qits/epics/1` an application's page inside a project rather than a repository `1` in a
component `epics`. A project is never a category either, so `/services` stays this app's own page —
and qits-projects refuses a slug that spells a category or a routed segment, so the two vocabularies
cannot collide from the other side.

`scopePath(scope)` gives the directory form (`/`, `/qits/`, `/qits/qits-ci/qits-ci-service/`) and
`scopeCommands(scope)` the same prefix as router commands, for an in-app absolute link:

```ts
router.navigate([...scopeCommands(scope()), 'runs', id]);
```

Both are pure functions of a `QitsScope`, so a route guard, a spec and the chrome answer the same
question the same way. Both read `group` first and `category` after it — `scopeGroup(scope)` is
that rule in one place — so a link built from `{ project, category, repository }` before components
existed still spells the address it always did.

## The three reads

```ts
bootstrapApplication(App, {
  providers: [
    provideHttpClient(),
    provideRouter(routes),
    provideQitsNavigation(), //   GET /main-navigation        — what the platform serves
    provideQitsProjects(), //     GET /projects/api/projects  — and its repositories, per project
    provideQitsScope('repository'), // the address, as this application routes it
  ],
});
```

All three URLs are **absolute**, deliberately unlike the platform's `api/config.json` convention of
a SPA reading from its own backend. Every SPA is served same-origin behind the edge, so an absolute
path is not a shortcut: it is what carries the browser's session cookie to the service that owns the
answer, with no machine token and no CORS pre-flight. A SPA asking its own backend would be asking a
service that knows what it does and nothing about what is deployed beside it.

**`provideQitsNavigation()`** issues one `GET /main-navigation` for the life of the application. The
edge answers with slots — one entry per application, filed under where it belongs in the chrome:

```json
{
  "environment": "dev",
  "origin": "https://dev.example.com",
  "projectOrigin": "https://dev.example.com",
  "slots": {
    "system": [{ "app": "qits-projects", "label": "Overview", "host": "projects", "path": "/projects", "origin": "https://projects.dev.example.com", "position": 1 }],
    "platform": [{ "app": "qits-platform-events", "label": "Events", "host": "events", "path": "/events", "origin": "https://events.dev.example.com", "position": 1 }],
    "project.detail": [{ "app": "qits-workspaces", "label": "Workspaces", "host": "workspaces", "path": "/workspaces", "origin": "https://workspaces.dev.example.com", "position": 1 }],
    "services.details": [{ "app": "qits-ci", "label": "CI", "host": null, "path": "/ci", "origin": "https://dev.example.com", "position": 2 }]
  }
}
```

Every entry carries both `host` and `path`, and the last one above is an application the platform
does not serve on a host of its own yet: `host: null`, the environment origin, and `/ci` as the
segment it answers on there. `HttpNavigationSource` normalises the payload into a `QitsNavTree`:
every slot flattened into one list sorted by position then label, each entry carrying its slot and
its path prefix, plus the environment origin. `projectOrigin` rides beside `origin` and is carried
through untouched as `tree.projectOrigin`: the same origin with the environment label **always**
spelled out, where `origin` on the default environment is the bare apex. An application that builds
a per-project host prefixes its own name onto it; nothing here composes anything from it, and an
edge that does not serve it leaves the field `undefined` rather than having a frontend work the
label out from the apex. An edge that predates slots answers the flat `{"links":[…]}` shape instead,
and the tree carries it as `legacy` — set **only** when no slots were served, because the two are
exclusive: `legacy` means "this platform cannot tell me its shape", and the sidebar then draws the
flat list it always drew.

`provideQitsNavigationTree(payload)` and `provideQitsNavigationLinks([…])` answer the same contract
from a literal — specs, stories, an `ng serve` with no platform in front of it. Nothing is fetched,
so there is no request to flush and no pending task to wait on.

**`provideQitsProjects()`** issues one `GET /projects/api/projects` and installs
`QITS_REPOSITORIES` beside it: the repositories of whatever project is in scope, one `GET
/projects/api/projects/{id}/repositories` per project and none at all while none is open. Leaving a
project cancels a read still in flight. Each row carries its `component` where qits-projects records
one — that is what the sidebar groups by and what the address spells — and its archetype, mapped
through a table copied here rather than imported: `SERVICE`→`services`, `DAEMON`→`daemons`,
`LIBRARY`→`libs`, `FRONTEND`→`frontends`, `CLI`→`cli`, `IMAGE`→`images`. This library depends on no
qits module, so an archetype it does not know maps to nothing, and a repository with **neither** a
component nor a known archetype is left out of the groups rather than filed under a guess.
`provideQitsProjectList([…])` and `provideQitsRepositoryList([…], wrapperId)` are the literal forms.

**`provideQitsScope(routing)`** installs `UrlScope`, which reads the address and nothing else — no
storage, deliberately. A remembered pick would make the same URL render differently for two people
and would silently re-scope a page opened from a bookmark. `routing` says how deep this
application's own addresses go:

| `routing`      | the applications                            | what a pick does                           |
| -------------- | ------------------------------------------- | ------------------------------------------ |
| `'repository'` | ci, docs, artifacts, configuration, workspaces | goes to `/<slug>` on this host           |
| `'project'`    | events, deployments, observability, maintenance | goes to `/<slug>` on this host          |
| `'system'`     | mirror, orchestrator, system, githost       | **leaves** for the projects host           |

A system app is about the platform rather than about a project, so `/<slug>/` is not an address it
serves; leaving is the honest answer to a pick it cannot act on itself. The router's form carries
**no trailing slash**: `DefaultUrlSerializer` reads `/qits/` as `qits` plus an empty segment, which
matches no `:project` route and lands every pick on the application's `**`. A full-document href
keeps its slash — there the browser asks for the path and `Location` normalises it away before
anything is matched — so `scopePath` and `href` are unaffected. There is deliberately no
setter that only remembers: `select` navigates, so the URL stays the single statement of what is on
screen and the back button cannot disagree with the pill.

The scope also resolves what the API needs: `projectId()` maps the slug through the project list,
`repositoryId()` maps the repository name through the repository list. URLs name slugs, services
resolve ids, and this is where the two meet.

## Linking to another application

```ts
const appLinks = inject(QitsAppLinks); // providedIn: 'root'

appLinks.href('qits-ci', '', scope()); //            https://ci.dev.example.com/qits/qits-ci/qits-ci-service/
appLinks.href('qits-ci', 'runs/7', { project }); //  https://ci.dev.example.com/qits/runs/7
appLinks.href('qits-artifacts', 'images', scope()); // https://dev.example.com/artifacts/images
appLinks.origin('qits-artifacts'); //                undefined — no host of its own yet
appLinks.environmentOrigin(); //                     https://dev.example.com — clone URLs live here
```

`href` is the origin from the navigation, the scope path, then the path. An application the platform
does **not** serve on a host of its own is reached at its own segment — the `path` every entry
carries — under the environment origin, and the **scope is dropped** there: such an application has
no scoped address, and spelling one would produce a URL that 404s. Only an application the platform
names in no entry at all has no address here, and `href` says so with `undefined` rather than
inventing one; `legacyFallback` is a caller's segment for exactly that case, and an entry's own path
wins over it, being the platform's live statement rather than a guess frozen at release time.

`entries(slot)` reads one slot, and `isCurrent(entry, scope)` says whether an entry is the page on
screen — **host and path together**. The host alone would mark every entry of an application current
wherever the reader is inside it; the path alone would mark the ci entry current on the docs host,
because both spell the same repository path. An application with no host of its own is asked the
same question in its own terms: current where the reader is on the environment origin, under its
segment. `QITS_BROWSER_ORIGIN` is the seam a spec replaces to
say "we are on the ci host"; its factory reads the document, so a server render has an answer too.

## The layout

`QitsMainLayout` is the one component with a peer beyond `@angular/core` and `@angular/common`: it
renders a `<router-outlet />`, so `@angular/router` is a peer too. Mount it as the root _route_
component, never as a tag around your content —

```ts
export const routes: Routes = [{ path: '', component: QitsMainLayout, children: [/* the app */] }];
```

— and the chrome survives navigation while only the outlet changes. Its breakpoint is CSS, not a
media query in TypeScript: a persistent sidebar from 768px up, a burger in the top bar below it,
and the burger is the only state the component keeps.

The sidebar, top to bottom, is what the three reads make possible:

- **the project picker** in the top-left slot, its value the project slug;
- **Project**, when a project is in scope — the project's own page on qits-projects, with "Project
  setup" and the `project.detail` entries under it;
- **one group per component that has repositories** — `qits-ci`, `qits-projects` — in name order,
  and after them the archetype categories that still hold something — SERVICES, DAEMONS, LIBS,
  FRONTENDS, CLI, IMAGES, in that order. One row per repository, ordered by name and blind to case,
  and under the repository **in scope** the `<category>.details` entries of that repository's own
  archetype: the slots say which _kinds_ of repository an application has something to say about,
  which is a different question from which component it is part of. Only the repository in scope
  opens: a tree that opened every repository would be as long as the project is big and would say
  nothing about where the reader is;
- **PLATFORM**, the `platform` entries, hidden while no project is in scope, because the group is
  about one;
- **SYSTEM**, the `system` entries, which are about the platform itself.

At most one row is marked current, and it is the most specific: the rows are built deepest-first and
the first current one wins. Two rows claiming the page would be two answers to "where am I", and the
sub-menu would have two places to go.

**One application may hold several entries in one slot** — `Workspaces` and `Editor` under the
Project node, the second one opening the same app's `editor` view. The platform files an entry under
its slot and its label, so that is what names a row here as well: keying a row by the application
alone would give two rows one `@for … track` key (NG0955) and one place for the sub-menu. Between
two such rows the **longest matching subpath** is the page — `isCurrent` asks whether the reader is
_inside_ an entry's view, which is a prefix test, so on `/qits/editor` the subpath-less sibling
answers yes as well and would otherwise take the highlight by sitting first.

The links leave the SPA on purpose. Each destination is its own Angular application on its own host,
so they are plain `<a href>` full-document navigations — `routerLink` would look right and go
nowhere. That holds for the repository rows too: they address qits-projects, not this app.

Four states, and no compiled-in list behind any of them:

- **waiting** — no rows, and `aria-busy` on the `<nav>`;
- **answered** — the tree above, or the flat list for a legacy answer;
- **stranded** (empty answer, request failed, or no provider at all) — one link to `/` under a
  "Navigation unavailable" line. `/` is the platform's own root rather than a registry entry, so it
  is the one destination that cannot go stale;
- **repositories still coming** — "Loading repositories…" where the groups will be, and a spoken
  alert where that read failed.

A fallback list compiled in here would put back the drift this replaced _and hide it_: the chrome
would sometimes show what the platform serves and sometimes a guess frozen at release time, with
nothing on screen telling them apart. Nothing is guessed for an application without a host of its
own either — the platform states its segment as the entry's `path`, so it is drawn in its slot at
`<environment origin><path>/`. Under a repository such a row is drawn but never marked current: the
link goes to that application's front page, which says nothing about the repository on screen.

`[links]` is an explicit override in the flat shape. A **non-empty** list wins outright and the
source is not consulted, which is what lets a story or a spec render the real chrome with no
provider anywhere. Empty — the default — means "ask".

Both halves of the picker are required. With a list but no scope the slot keeps the wordmark: a
control that can neither say what is open nor act on a pick is worse in the most prominent place in
the chrome than the name it would have replaced. An app that provides neither is unchanged.

### The sub-menu

An application can hang its own menu under its own row: a documentation tree, a version picker.
Declare it **in the app shell, beside the `<router-outlet />`** —

```html
<ng-template qitsNavSubmenu><app-doc-tree /></ng-template> <router-outlet />
```

— and never inside a page. Getting that wrong is silent: a page's declaration is destroyed and
rebuilt on every navigation, so the panel would lose its scroll position and every open group on
each hop, in a menu that did not itself change. The layout renders it in a bare block and styles
nothing inside it, and the content keeps the shell's style scope, because view encapsulation
follows where a node is declared rather than where it is inserted. Where no row is this application
— the platform does not serve it yet, a bare `ng serve` — the sub-menu goes to the foot of the
navigation instead of nowhere.

### The pending-builds bolt

Beside the picker, a lightning bolt: what qits-ci has in hand right now, from any page of any
application. `provideQitsBuilds()` is what puts it there — no provider, no bolt, exactly as no
project source means no picker.

```ts
bootstrapApplication(App, {
  providers: [provideHttpClient(), provideRouter(routes), provideQitsBuilds()],
});
```

```json
{
  "runs": [
    {
      "id": "…",
      "repoName": "qits-ci-service",
      "branch": "release/7f3c2a",
      "status": "RUNNING",
      "configPath": ".config/qits/ci-event-release-request.yml",
      "commitSha": "18f7422",
      "createdAt": "2026-09-07T11:58:00Z",
      "startedAt": "2026-09-07T11:59:00Z",
      "expectedStepDurationsMillis": [12000, 95000, 60000, 25000]
    }
  ]
}
```

`GET /ci/api/runs/active`, a **same-origin path** like the chrome's other reads and for the same
reason: the edge routes `/ci` on every vhost, so the browser's own session reaches qits-ci with no
machine token, no CORS pre-flight and no origin compiled in here. **That listing is the single
source of truth** and the only thing ever drawn; everything below is about when to read it again.

**The count stays current while the panel is shut**, because the bolt says something on a page
nobody has clicked. It is not a closed-state poll: the listing is read once as the chrome is built,
and after that whenever the platform says something happened —

    GET /events/api/stream?names=BuildStatusChanged,BuildSuccessful,BuildFailed

an `EventSource` on a bare same-origin path, for `/ci`'s reason: the edge routes `/events` on every
vhost too. `BuildStatusChanged` fires on every transition of a run's status — queued, started, and
each terminal state — so both edges of the active listing are announced. A frame carries **nothing
this library reads**: it means only "go and look", and a burst of them is coalesced into one read
(250ms). Every connect re-reads, **reconnects included** — the stream is live-only, with no replay,
no offset and no catch-up, so a stream that dropped and came back has missed everything in between
and the listing is the only road back.

**Where the stream cannot be held, degrade rather than disappear.** An edge that will not pass it, a
browser that keeps failing, a session without the roles (`qits:admin`/`qits:system`, the same wall
`/ci/api/runs/active` already stands behind), or no `EventSource` at all on a server render: after
two consecutive failures the stream is given up for good and a slow interval takes over
(`QITS_BUILDS_FALLBACK_INTERVAL_MS`, 30s). Same listing, same drawing, later answers.
`provideQitsBuilds({ eventSource: null })` opts out of the stream up front and lands on the same
path; `streamUrl`, `fallbackIntervalMs` and a fake `eventSource` are all overridable.

**The open panel keeps its own cadence on top of that**: opening reads at once and again every five
seconds, because a reader watching a run move wants it moving. Closing drops back to keeping the
count current quietly — it does **not** stop, and it does not forget, since forgetting would blank
the bolt at the moment the reader stopped looking at the panel and started relying on the bolt.
Nothing ticks behind a shut panel. It closes on Escape — handing the focus back to the bolt — and on
a click outside itself.

**The bolt itself says four things, in colour, in a number and in words.**

| state              | the bolt                                | the badge   | `aria-label`                        |
| ------------------ | --------------------------------------- | ----------- | ----------------------------------- |
| something building | amber `#d97706`                         | the queue   | `Pending builds: 3 running, 2 queued` |
| nothing building   | the button's grey `#6b7280`             | none        | `Pending builds: none`              |
| the read failed    | hollow — `fill: none`, stroked, faded   | none        | `Pending builds: unavailable`       |
| nothing yet        | the resting grey, quietly               | none        | `Pending builds: checking`          |

*Pending* is the active listing being non-empty — there is no threshold and no status to consult.
The amber is the **bolt's own** fill rather than a fourth colour on the button, because hovering a
busy bolt would otherwise repaint it and quietly un-say the thing it exists to say. A failed read is
drawn as visibly *unanswered* rather than grey, so that grey keeps meaning "we asked, and nothing is
building"; and "checking" is allowed to look like rest but is never reported as idle, since the
label is the only channel a screen reader has — neither the fill nor the badge is announced.

**The badge is the queue**, a small red dot at the bolt's bottom-left (the wrapper is already
`position: relative`, so it needs no structure of its own; it is `aria-hidden` and click-through).
It counts the runs that have **not started** — `status !== 'RUNNING'`, never `status === 'QUEUED'`,
because the status is carried through as qits-ci said it and a word this library has not heard of is
still a build nobody is building yet. Zero draws **nothing at all**, rather than a dot reading `0`;
past nine it reads `9+`, because a wider dot would move the bolt and everything beside it in the bar.

Each row is four facts: the repository, the status, the branch, and the pipeline file's **name**
(`ci-event-release-request.yml`), since every run on this platform shares the directories in front of
it. A
`RUNNING` run carries the info tone and a rail down its left; anything else is neutral, so the two
are told apart by more than a colour. The status word is whatever qits-ci said, upper-cased and
never narrowed: a state this library does not know is still a pending build.

**The row is the way into the run.** It links to `runs/<id>` on the ci host, at the scope path the
reader came in through — `QitsAppLinks.href('qits-ci', …)`, a full-document navigation, because
qits-ci is another application on a host of its own. A platform that names no ci host gives no
honest address, and the row is then the same four facts as text rather than a link to nowhere.

**And, where qits-ci predicted one, the run's expected shape.** `expectedStepDurationsMillis` is one
p95 per pipeline step, and the bar under the facts is that prediction drawn to scale: the track is
divided per step in proportion to how long each is expected to take, with a small seam at every
boundary — two steps of 10s and 90s are 9%, a 1% seam, 90%, the seam carved out of the step _before_
it so the last step keeps its whole share. A `RUNNING` run fills it left to right against
`now - startedAt`; one still queued shows the shape empty. Past the prediction the bar stays full in
a quieter tone rather than overflowing: late is a fact about the run, not a wider track.

Beside the bar, what the run has **actually** taken — since `startedAt` for one under way, since
`createdAt` for one still waiting, rendered `41s` / `4m 12s` / `1h 04m` exactly as qits-ci's own run
page renders it. It ticks off a **local** clock, once a second, while the panel is open and never
otherwise: `now - startedAt` is a subtraction, and polling qits-ci to learn what a subtraction knows
would turn a panel somebody left open into traffic.

All three fields are optional on the wire. A run that carries none of them — an older qits-ci, a
pipeline nobody has measured yet — is drawn exactly as every row was before there was a bar to draw,
and a prediction with one unusable entry is dropped whole, because the segments are proportions of
one another and a wrong shape is worse than no shape.

An empty queue says "Nothing building.", a read still in flight "Checking…", and a `/ci` that could
not be reached one quiet line — "Builds unavailable." — inside the panel. That last one is the
ordinary case on a host where the edge routes no `/ci` at all, and it is why the failure is a hollow
bolt and a sentence in a popover rather than anything the layout around it notices.
`provideQitsBuildList([…])` answers the same contract from a literal, with nothing fetched, nothing
polled and no stream opened.

## Install

`@qits/ui-components` lives in the platform's own npm repository, not on npmjs. A consumer needs
one `.npmrc` next to its `package.json` — the scope routing, nothing else:

    registry=http://localhost:8082/artifacts/npm/npmjs/     # everything, through the npmjs cache
    @qits:registry=http://localhost:8081/artifacts/npm/npm/ # ours

    pnpm add @qits/ui-components

Those are the addresses of a local platform as published on the deployment host, and they are two
services since the byte-plane split: the cache is `qits-platform-mirror` on 8082, the hosted scope
is `qits-artifacts` on 8081. Inside qits-net — a CI step, another container — the same two roots
are `http://qits-platform-mirror:8080/artifacts/npm/npmjs/` and
`http://qits-artifacts:8080/artifacts/npm/npm/`, and CI writes them from environment rather than
reading any file (see `.config/qits/ci-event-release-request.yml`). Neither registry wants a
credential.

The published package is the **prebuilt ng-packagr output** — FESM bundles and type definitions, in
Angular's partial compilation format. There is nothing to compile on install and no `prepare` hook;
consumers install a tarball like any other dependency.

### `main` is the latest released main

**`@qits/ui-components@main` names the newest released version**, and the release pipeline puts it
there with `npm dist-tag add` immediately after its publish. It is a separate call rather than a
publish flag because `npm publish` can claim exactly one dist-tag and a published version is
immutable — no single publish is under both `latest` and `main`.

The tag used to mean something else: prereleases named `<last released version>-main.g<sha7>`, cut on
every push to `main`. There are no pushes to `main` to hang that leg off now that a commit is proved
on the fold of a release request, so the leg went — and with it the only thing that ever wrote this
tag, which is why `main` sat on `2026.902.204627-main.geec9f2c` while releases kept moving `latest`.
Main only advances at a release under this flow, so the tag was repointed at releases rather than
left frozen.

**Pinning `^<version>` is still the ordinary thing to do.** `@main` says "follow this repository's
released mains" and `latest` says "follow whatever the registry's ordering rule allows"; today they
name the same version, and the difference is what each one promises to keep meaning.

Getting ahead of a release is not a pin at all: name your branch in a release request, let the fold
gate it, and install the CalVer that comes out. If you do reach for an old prerelease that is still
in the registry, spell it **exactly** — the caret is a trap:

    "@qits/ui-components": "2026.806.184725-main.gc03ad30"     # yes
    "@qits/ui-components": "^2026.806.184725-main.gc03ad30"    # no

The caret range admits `2026.806.184725` as well — a prerelease sorts _below_ the release it is
named after, so npm resolves the release and never mentions the prerelease again. What arrives is
the build the caller was trying to get ahead of, and the failure lands somewhere else entirely:
`error TS2305: Module '@qits/ui-components' has no exported member 'QitsPicker'`.

The trap was quiet because the caret usually worked. It did for the first client to pin a `main`
build — but only because no stable release of that version existed yet for the range to prefer.
The moment one did, every caret pin silently moved backwards.

Then, in a standalone component:

```ts
import { QitsBadge, QitsButton, QitsCard } from '@qits/ui-components';

@Component({
  imports: [QitsButton, QitsBadge, QitsCard],
  template: `
    <qits-card heading="Latest run" subheading="main @ 18f7422" elevated>
      <qits-button qitsCardActions size="sm" variant="secondary" (pressed)="rerun()">
        Re-run
      </qits-button>
      <qits-badge label="SUCCESS" tone="success" />
    </qits-card>
  `,
})
export class RunSummary {
  /* … */
}
```

## Development

    pnpm install
    pnpm lint            # eslint + angular-eslint, the qits- selector prefix enforced
    pnpm test            # vitest under jsdom
    pnpm build           # ng-packagr → dist/qits-spa-ui-components, then check-exports
    pnpm storybook       # the component workbench on :6006
    pnpm build-storybook # the same, static, into storybook-static/

`pnpm build` runs `scripts/check-exports.mjs` over the output: it is the manifest ng-packagr
_writes_ that gets published, so the check reads that one — the package name, the version against
`projects/qits-spa-ui-components/package.json`, the absence of a `private` flag, the peer ranges,
and that every path in `exports` exists on disk. A publish that would have failed after a green
pipeline fails at build time instead.

The workspace root is a harness: its `package.json` is `private: true` and carries only tooling.
The publishable unit is `dist/qits-spa-ui-components`, and
`projects/qits-spa-ui-components/package.json` is the single source of truth for the package's
name, version and dependencies.

Tests run browserless, in jsdom, which is enough for rendering, inputs, projection and emitted
events. A component that genuinely needs a layout engine gets a `.browser.spec.ts` — the `test`
target already excludes that suffix — and a `test-browser` target running vitest browser mode;
until a build image ships a browser, that target is a local-only affair and CI stays on `pnpm test`.

### Storybook

Storybook is the place to _look_ at a component, which is the one thing a jsdom spec cannot do.
Both targets live in `angular.json` and run through **`@storybook/angular-vite`**: this workspace
builds on Vite under Angular 21, and the webpack-era `@storybook/angular` would mean a second
toolchain disagreeing with the first. The config is `projects/qits-spa-ui-components/.storybook`.

Stories sit next to the component they document, as `src/lib/<component>.stories.ts` — the same
place the specs sit. `tsconfig.lib.json` excludes both `*.spec.ts` and `*.stories.ts`, so neither
reaches the published package; `pnpm build` output stays the five files it always was.

Property tables come from **compodoc**, which the framework runs before either target and which
reads the components' own JSDoc and `input()` signatures into a gitignored `documentation.json`.
That is why the doc comments in `src/lib` are worth keeping accurate: they are the docs.

`pnpm build-storybook` runs in the pipeline too. It ships nothing — `storybook-static/` is
gitignored and dies with the container — but it compiles every story, the `.storybook` config and
the compodoc pass, so a broken workbench surfaces at the QA gate rather than the next time someone
opens it. Like the build it is Vite compiling, not a browser rendering, so the browserless CI image is
enough.

## Releasing

The version in `projects/qits-spa-ui-components/package.json` is stamped by Auto Release — the
CalVer that names the release commit and the tag — and never edited by hand. The release pipeline
below stops when the built manifest and the tag disagree, so a hand-picked number is a red release
rather than a version. A breaking change is therefore not a different kind of number: it is the next
CalVer, and what consumers need is the note in _Pinning_ above.

**A release starts as a release REQUEST**, opened against this repository in qits-projects:

```
POST /projects/api/repositories/<repoId>/release-requests
{ "branch": "<your branch>", "summary": "<the release's subject>" }
```

qits-projects folds `main`, that branch and any released tags still in flight onto a backing branch
`release/<id>`, re-folding whenever the set changes. Nothing merges and nothing is released at that
call.

Two pipelines run here, and they run at different moments.

`.config/qits/ci-event-release-request.yml` is the **QA** pipeline. It reacts to the fold — install,
lint, `pnpm test`, `pnpm build`, `pnpm build-storybook` — and every step is gating, because a fold
publishes nothing. Its verdict is the quality gate: Auto Release stamps the CalVer, bumps the
manifest, tags and publishes `SCMRelease` only over a green one, and `main` is finalized only after
the release has deployed. There is no push pipeline any more; a commit is proved on the fold it is
released from rather than on the branch it landed on.

`.config/qits/ci-event-release.yml` is the release pipeline. It reacts to `SCMRelease`, checks the
release tag out, builds it and publishes the real version under `latest`, then points `main` at that
same version with `npm dist-tag add`. It publishes **if absent** — published versions are immutable
and an event can be redelivered, so a second run of one release goes green rather than fighting the
registry — while the tag move is unconditional, so a redelivery repairs a tag the first run did not
manage to set.

**An edit to this file takes effect on the release that merges it**, not the one after. qits-ci
selects the recipe at `main`, and Auto Release merges the fold before it publishes the `SCMRelease`
that triggers the run, so `main` already carries the edit. The QA pipeline above is the one read at
the pre-merge `main`; do not carry that intuition across.

The tag is still the durable stamp, but it no longer triggers: qits-githost's tag primitive
announces nothing, so a bootstrap replay restores this release by pushing the tag quietly and
re-presenting the `SCMRelease` through qits-ci's manual trigger door, which runs the same pipeline
and re-derives the tarball from the tag.

The release train runs through this library. A real release also publishes `SCMRelease`, which says
only that source control has the version; `SoftwareRelease` is what qits-ci publishes where a green
release run and an `SCMRelease` meet, and it means the tarball is in the registry. Consumers trigger
on the last one, so a bump pipeline can install what it was told about — and a replay, which has no
`SCMRelease`, republishes silently and wakes no train (scm-release-split-plan.md,
bootstrap-replay-plan.md).

The layout no longer carries a list of the platform's doors. It asks the gateway, which derives the
answer from the routes it actually serves — so a component appearing, moving or being retired is one
deployment of one process, not a release here and a bump in nine SPAs.
