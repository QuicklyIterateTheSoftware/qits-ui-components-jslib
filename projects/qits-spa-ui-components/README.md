# @qits/ui-components

Angular components shared across qits frontends: `QitsButton`, `QitsBadge`, `QitsCard`, `QitsPicker`
and the application skeleton `QitsMainLayout`. Standalone, `OnPush`, self-contained styles;
`@angular/core` and `@angular/common` are peers, and `@angular/router` for the layout's
`<router-outlet />`. The layout's navigation comes over `@angular/common/http`, a subpath of a peer
already there — nothing new to install. The build stream opens through `@qits/angular`'s
`QITS_EVENT_SOURCE`, and `<qits-work-ref>` renders an in-app link through its `QitsExit`
(`>= 2026.1109.234938`); the app itself depends on `@qits/angular`: this package imports it but does
not declare it, so an app bumping this package needs that `@qits/angular` too. An in-app work link
is an exit the app declares with `outcomes()` — `QITS_WORK_LINK`'s `{ exit, params }`. Platform
reads go through the app's `HttpClient`; add `@qits/angular`'s `qitsBearerInterceptor` there.

## Install

The package is served from the platform's own npm repository, not npmjs — route the scope in an
`.npmrc` beside your `package.json`:

    registry=https://mirror.qits.wohlben.eu/npm/npmjs/        # everything, through the npmjs cache
    @qits:registry=https://registry.qits.wohlben.eu/artifacts/npm/npm/ # ours

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
export class RunSummary {
  /* … */
}
```

`QitsMainLayout` is the root _route_ component, not a wrapper tag — mounting it there is what keeps
the chrome alive across navigation:

```ts
import { provideQitsNavigation, QitsMainLayout } from '@qits/ui-components';

export const routes: Routes = [{ path: '', component: QitsMainLayout, children: [/* the app */] }];

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
qits-ci is building and what is queued, read from `/ci/api/runs/active` on qits-ci's own origin (`QitsAppLinks.apiOrigin`) when it opens and every five
seconds while it stays open — and nothing at all while it is closed. Each row links into the run on
the ci host, and where qits-ci predicted the run's steps it draws them to scale as a segmented bar,
filling against a local one-second clock with the time actually taken beside it. No provider, no
bolt; an unreachable `/ci` is one quiet line inside the panel. `provideQitsBuildList([…])` is the
literal form.

`QitsDiffViewer` and `QitsChangeTree` are the two halves of a change view. The tree takes the
changed files (`{ path, previousPath, changeType }`) and reports the one that was picked; the viewer
takes git's patch text for that file and colours it by line. **The viewer never fetches** — a commit
page and a release request's Changes tab read different routes for the same rows, so each caller
keeps its own read. An empty patch is an answer, not a failure: a binary file, a pure rename, or a
patch the service declined to send for its size.

```html
<qits-change-tree [entries]="changes()" [(selected)]="path" />
<qits-diff-viewer [path]="path() ?? ''" [patch]="patch()" />
```

Single-child directory chains fold into one row, so
`components/qits-projects/qits-projects-service/pom.xml` is two rows rather than four — which is
what makes a wrapper release request legible. A directory click folds a row shut and never moves
the selection.

An app can hang its own menu under its own entry with `<ng-template qitsNavSubmenu>` — declared in
the app shell beside the `<router-outlet />`, never inside a page, or it is rebuilt on every
navigation and loses its state.

Source, the component reference and the development commands are in the
[repository README](https://github.com/QuicklyIterateTheSoftware/qits-ui-components-jslib).

## Theme

`@qits/ui-components/theme.css` is the one look of every qits frontend: the palette, the semantic
colour tokens with their light and dark values, and a `dark:` variant, as Tailwind v4 CSS. A
Tailwind app imports it right after Tailwind:

```css
@import 'tailwindcss';
@import '@qits/ui-components/theme.css';
```

and paints with the tokens as utilities — `bg-surface`, `text-fg-muted`, `border-line` — or as
`var(--color-surface)` in its own styles. The file also points Tailwind at this package's compiled
templates (`@source`), so a utility a component uses is generated in the app's build.

**An app without Tailwind keeps today's light look and imports nothing.** Every component registers
its tokens with `@property` (`QITS_THEME_DEFAULTS`), each at its light value, which is exactly the
colour the component painted before it had tokens. The theme, where it is loaded, overrides those
on `:root`.

**Light or dark is decided by `data-theme` on `<html>`:**

- absent — follow the OS (`prefers-color-scheme`);
- `data-theme="light"` — light, whatever the OS says;
- `data-theme="dark"` — dark, whatever the OS says.

The `dark:` variant follows the same rule (Tailwind's own reads only the media query), and so does
`--qits-color-scheme` on `:root`: `light` or `dark`, for code that needs the answer rather than the
colours — `<qits-mermaid-diagram>` draws mermaid's `dark` theme exactly when it is `dark`, and
`neutral` otherwise, so always `neutral` in an app without the theme. `color-scheme` is set with
it, so native controls and scrollbars follow.

**The token names are a contract.** Every frontend paints with them, so renaming or removing one is
a breaking change for all of them. A frontend adds no colours of its own — no palette step, no
literal, no app-local token; `@qits/angular`'s `qits/theme-colors` lint rule reports each. A colour
a frontend needs and no token names is added **here**, with its light and dark value and a role,
and released. In dark, `fg`, `fg-soft`, `fg-muted`, `accent`, `danger`, `warning` and `success`
reach WCAG AA (4.5:1) on `surface`, `surface-subtle` and `surface-muted`; `theme.spec.ts` computes
it from theme.css.

A dark value named as a step (`charcoal-brown-950`) is that palette colour; the others are written
out — the translucent shadows and tint, and the violet and pink that the palette lacks.

| Token                   | Light                    | Dark                              | Role                                                                                  |
| ----------------------- | ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| `surface`               | `#ffffff`                | `charcoal-brown-950`              | Page, card, panel, input and button backgrounds                                       |
| `surface-subtle`        | `#f9fafb`                | `charcoal-brown-900`              | Code blocks, table heads, the layout bar and sidebar, a running build row             |
| `surface-muted`         | `#f3f4f6`                | `charcoal-brown-800`              | Hover rows, the neutral badge, the secondary button                                   |
| `surface-active`        | `#e5e7eb`                | `charcoal-brown-700`              | Pressed and current: the current nav link, an open toggle, a hovered secondary button |
| `surface-inverse`       | `#1f2937`                | `charcoal-brown-100`              | The primary button: a fill in the opposite scheme                                     |
| `surface-inverse-hover` | `#374151`                | `charcoal-brown-200`              | The primary button under the pointer                                                  |
| `surface-tint`          | `rgba(31, 41, 55, 0.08)` | `oklch(96.36% 0.003 106.45 / 8%)` | A translucent wash over whatever is below: the ghost button under the pointer         |
| `fg`                    | `#111827`                | `charcoal-brown-50`               | Body text, headings                                                                   |
| `fg-soft`               | `#374151`                | `charcoal-brown-200`              | Secondary text, neutral badge text, table heads, captions of a figure                 |
| `fg-muted`              | `#6b7280`                | `charcoal-brown-300`              | Captions, meta, notes, carets                                                         |
| `fg-faint`              | `#9ca3af`                | `charcoal-brown-400`              | Placeholders, disabled text, section headings of the sidebar                          |
| `fg-control`            | `#1f2937`                | `charcoal-brown-100`              | A control's own ink: the ghost button's text, the picker's caret and focus outline    |
| `fg-on-accent`          | `#ffffff`                | `charcoal-brown-950`              | Text on an accent or danger fill                                                      |
| `fg-on-inverse`         | `#f9fafb`                | `charcoal-brown-950`              | Text on surface-inverse                                                               |
| `line`                  | `#e5e7eb`                | `charcoal-brown-800`              | Borders, dividers, an unfilled progress track                                         |
| `line-subtle`           | `#f3f4f6`                | `charcoal-brown-900`              | The quietest divider: under a card header, between list rows                          |
| `line-strong`           | `#d1d5db`                | `charcoal-brown-700`              | Input, button and segmented-switch borders                                            |
| `accent`                | `#1d4ed8`                | `ocean-deep-300`                  | Links, the info tone, selection, a run under way, a filled progress step              |
| `accent-soft`           | `#eff6ff`                | `ocean-deep-950`                  | Info badge and selected-row background, a diff hunk line                              |
| `accent-line`           | `#bfdbfe`                | `ocean-deep-800`                  | Info badge border                                                                     |
| `accent-muted`          | `#93a3c8`                | `ocean-deep-600`                  | A progress step past its expected duration: quieter than accent                       |
| `focus-ring`            | `#3b82f6`                | `ocean-deep-400`                  | Focus outline                                                                         |
| `danger`                | `#b91c1c`                | `cinnabar-300`                    | Failure text and marks, the danger tone, the queued-builds count                      |
| `danger-soft`           | `#fef2f2`                | `cinnabar-950`                    | Danger badge background, a removed diff line                                          |
| `danger-line`           | `#fecaca`                | `cinnabar-800`                    | Danger badge border                                                                   |
| `danger-strong`         | `#991b1b`                | `cinnabar-200`                    | Text of a removed diff line, on danger-soft                                           |
| `warning`               | `#b45309`                | `sunflower-gold-400`              | Warning text and marks, the warning tone                                              |
| `warning-soft`          | `#fffbeb`                | `sunflower-gold-950`              | Warning badge and notice background                                                   |
| `warning-line`          | `#fde68a`                | `sunflower-gold-800`              | Warning badge and notice border                                                       |
| `warning-strong`        | `#92400e`                | `sunflower-gold-200`              | Text of a warning notice, on warning-soft                                             |
| `warning-fill`          | `#d97706`                | `sunflower-gold-500`              | A shape filled with the warning colour: the busy builds bolt                          |
| `success`               | `#047857`                | `mint-leaf-400`                   | Success text and marks, the success tone                                              |
| `success-soft`          | `#ecfdf5`                | `mint-leaf-950`                   | Success badge background, an added diff line                                          |
| `success-line`          | `#a7f3d0`                | `mint-leaf-800`                   | Success badge border                                                                  |
| `success-strong`        | `#065f46`                | `mint-leaf-200`                   | Text of an added diff line, on success-soft                                           |
| `special`               | `#6d28d9`                | `oklch(81.1% 0.111 293.571)`      | The highlight tone: a thing singled out as ready or planned                           |
| `special-soft`          | `#f5f3ff`                | `oklch(28.3% 0.141 291.089)`      | Highlight badge background                                                            |
| `special-line`          | `#ddd6fe`                | `oklch(43.2% 0.232 292.759)`      | Highlight badge border                                                                |
| `code-keyword`          | `#7c3aed`                | `oklch(81.1% 0.111 293.571)`      | Code excerpts: keywords                                                               |
| `code-string`           | `#047857`                | `mint-leaf-300`                   | Code excerpts: string literals                                                        |
| `code-number`           | `#b45309`                | `sunflower-gold-300`              | Code excerpts: number literals                                                        |
| `code-annotation`       | `#be185d`                | `oklch(82.3% 0.12 346.018)`       | Code excerpts: annotations and decorators                                             |
| `code-type`             | `#1d4ed8`                | `ocean-deep-300`                  | Code excerpts: type names                                                             |
| `code-punctuation`      | `#4b5563`                | `charcoal-brown-300`              | Code excerpts: punctuation                                                            |
| `shadow`                | `rgb(17 24 39 / 12%)`    | `oklch(0% 0 0 / 50%)`             | Popover and panel shadows                                                             |
| `shadow-near`           | `rgba(0, 0, 0, 0.12)`    | `oklch(0% 0 0 / 50%)`             | An elevated card's tight shadow                                                       |
| `shadow-far`            | `rgba(0, 0, 0, 0.08)`    | `oklch(0% 0 0 / 35%)`             | An elevated card's wide shadow                                                        |

## Pacts of the calls it makes

`@qits/ui-components/testing` records, in the consuming frontend's own specs, the pacts of the REST
calls this package makes on that frontend's behalf — one line in `src/app/ui-components.pact.spec.ts`:

```ts
import { uiComponentsPact } from '@qits/ui-components/testing';
import { appConfig } from './app.config';

describe('@qits/ui-components pacts', () =>
  uiComponentsPact({ consumer: 'qits-ci-frontend', appConfig, sources: 'src/app' }));
```

It needs `@pact-foundation/pact`, `@qits/angular` and the providers' golden-master packages as
the consumer's own devDependencies; this package declares none of them. See the repository README for what it pacts and why.
