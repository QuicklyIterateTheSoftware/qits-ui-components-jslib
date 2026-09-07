# @qits/ui-components

Angular components shared across qits frontends: `QitsButton`, `QitsBadge`, `QitsCard`, `QitsPicker`
and the application skeleton `QitsMainLayout`. Standalone, `OnPush`, self-contained styles;
`@angular/core` and `@angular/common` are peers, and `@angular/router` for the layout's
`<router-outlet />`. The layout's navigation comes over `@angular/common/http`, a subpath of a peer
already there — nothing new to install.

## Install

The package is served from the platform's own npm repository, not npmjs — route the scope in an
`.npmrc` beside your `package.json`:

    registry=http://localhost:8082/artifacts/npm/npmjs/     # everything, through the npmjs cache
    @qits:registry=http://localhost:8081/artifacts/npm/npm/ # ours

    pnpm add @qits/ui-components

```ts
import { QitsBadge, QitsButton, QitsCard } from '@qits/ui-components';

@Component({
  imports: [QitsButton, QitsBadge, QitsCard],
  template: `
    <qits-card heading="Latest run" elevated>
      <qits-button qitsCardActions size="sm" variant="secondary" (pressed)="rerun()">
        Re-run
      </qits-button>
      <qits-badge label="SUCCESS" tone="success" />
    </qits-card>
  `,
})
export class RunSummary { /* … */ }
```

`QitsMainLayout` is the root *route* component, not a wrapper tag — mounting it there is what keeps
the chrome alive across navigation:

```ts
import { provideQitsNavigation, QitsMainLayout } from '@qits/ui-components';

export const routes: Routes = [
  { path: '', component: QitsMainLayout, children: [/* the app */] },
];

bootstrapApplication(App, {
  providers: [provideHttpClient(), provideRouter(routes), provideQitsNavigation()],
});
```

Sidebar from 768px up, burger below it, all in CSS. The entries are plain `<a href>` paths, because
each destination is a separate application behind its own base path.

`provideQitsNavigation()` — which needs `provideHttpClient()` — asks the gateway once, at
`/main-navigation`, what the platform contains; nothing here is compiled in. Until it answers the
navigation is empty and `aria-busy`; if it fails or comes back empty the layout offers one link to
`/`. `provideQitsNavigationLinks([…])` answers the same contract from a literal, without a request,
for specs and stories. A non-empty `[links]` input overrides both.

`provideQitsBuilds()` adds the pending-builds bolt beside the project picker: a popover of what
qits-ci is building and what is queued, read from `/ci/api/runs/active` when it opens and every five
seconds while it stays open — and nothing at all while it is closed. Each row links into the run on
the ci host, and where qits-ci predicted the run's steps it draws them to scale as a segmented bar,
filling against a local one-second clock with the time actually taken beside it. No provider, no
bolt; an unreachable `/ci` is one quiet line inside the panel. `provideQitsBuildList([…])` is the
literal form.

An app can hang its own menu under its own entry with `<ng-template qitsNavSubmenu>` — declared in
the app shell beside the `<router-outlet />`, never inside a page, or it is rebuilt on every
navigation and loses its state.

Source, the component reference and the development commands are in the
[repository README](https://github.com/QuicklyIterateTheSoftware/qits-ui-components-jslib).
