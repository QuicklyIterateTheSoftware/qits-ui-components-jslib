import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { QITS_THEME_DEFAULTS } from './theme-defaults';

/** The mermaid theme a diagram is drawn in: `neutral` on a light page, `dark` on a dark one. */
export type QitsMermaidTheme = 'neutral' | 'dark';

/**
 * The two calls this library makes on mermaid — its default export, structurally. Declared here
 * rather than imported so the public API names no type of mermaid's, and a spec or story can hand
 * in a stub.
 */
export interface QitsMermaid {
  initialize(config: {
    startOnLoad: boolean;
    securityLevel: 'strict';
    theme: QitsMermaidTheme;
  }): void;
  render(id: string, definition: string): Promise<{ svg: string }>;
}

/**
 * How `QitsMermaidDiagram` gets mermaid. This entry point names the token but never loads mermaid
 * itself (ticket qits-1910): esbuild emits a dynamic import's whole chunk — mermaid is roughly
 * 3.4 MB — for every module it reaches, even one tree-shaken out of the running app, so a bare
 * dynamic import of mermaid here put that chunk in **every** consumer, whether or not it ever
 * drew a diagram. The real loader lives behind `@qits/ui-components/mermaid`'s
 * `provideQitsMermaid()`, which a consuming app adds to its providers only if it wants diagrams
 * drawn; without it this default factory's loader rejects, and a diagram falls back to its
 * definition as text, same as any other load failure. A spec or story replaces the token outright
 * with `{ provide: QITS_MERMAID_LOADER, useValue: () => stub }`.
 */
export const QITS_MERMAID_LOADER = new InjectionToken<() => Promise<QitsMermaid>>(
  'QITS_MERMAID_LOADER',
  {
    providedIn: 'root',
    factory: () => () =>
      Promise.reject(
        new Error(
          'QITS_MERMAID_LOADER has no mermaid loader: add provideQitsMermaid() from ' +
            "'@qits/ui-components/mermaid' to this app's providers to draw diagrams",
        ),
      ),
  },
);

type DrawState = 'drawing' | 'drawn' | 'failed';

let sequence = 0;

const DARK = '(prefers-color-scheme: dark)';

/**
 * The scheme the page is in, as theme.css says it: `dark` exactly when the document's
 * `--qits-color-scheme` is `dark`. The page decides, not the OS: an app with a forced
 * `data-theme="light"` stays light on a dark OS, and an app that loads no theme has no such
 * property, so its diagrams stay `neutral` on its light page whatever the OS prefers.
 */
function pageTheme(document: Document): QitsMermaidTheme {
  const view = document.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return 'neutral';
  const scheme = view
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--qits-color-scheme');
  return scheme.trim() === 'dark' ? 'dark' : 'neutral';
}

/**
 * One Mermaid diagram, drawn from its definition — qits-docs-frontend's `renderMermaidBlocks`,
 * lifted into the library.
 *
 * - mermaid is loaded lazily through {@link QITS_MERMAID_LOADER}, only once this component
 *   renders, and initialised with `securityLevel: 'strict'`: labels are text, never markup, and
 *   the SVG it returns has been through mermaid's own DOMPurify pass — which is why it may be put
 *   in place as it is. The loader that actually imports mermaid is installed by
 *   `provideQitsMermaid()` from `@qits/ui-components/mermaid`; without it the definition stays in
 *   its `<pre>`, same as any other load failure.
 * - A definition mermaid cannot draw, or mermaid failing to load, leaves the definition in a
 *   `<pre>`, legible as text. It never throws.
 * - It redraws when `definition` changes, and when the page's scheme does: `theme: 'dark'` exactly
 *   when theme.css's `--qits-color-scheme` on `<html>` is `dark`, `'neutral'` otherwise — so
 *   always `'neutral'` in an app that loads no theme. That property moves with the OS (when
 *   `<html>` has no `data-theme`) and with `<html>`'s `data-theme`, so both are watched.
 */
@Component({
  selector: 'qits-mermaid-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #canvas
      class="diagram"
      role="img"
      [attr.aria-label]="label()"
      [hidden]="state() !== 'drawn'"
    ></div>
    @if (state() === 'failed') {
      <pre class="definition">{{ definition() }}</pre>
    } @else if (state() === 'drawing') {
      <p class="drawing">Drawing diagram…</p>
    }
  `,
  styles: [
    QITS_THEME_DEFAULTS,
    `
      :host {
        display: block;
        min-width: 0;
      }
      .diagram {
        overflow-x: auto;
      }
      .diagram ::ng-deep svg {
        max-width: 100%;
        height: auto;
      }
      .definition {
        margin: 0;
        padding: 0.5rem 0.75rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.75rem;
        line-height: 1.4;
        white-space: pre;
        overflow-x: auto;
        color: var(--color-fg);
        background: var(--color-surface-subtle);
        border: 1px solid var(--color-line);
        border-radius: 6px;
      }
      .drawing {
        margin: 0.25rem 0;
        color: var(--color-fg-muted);
        font-size: 0.8rem;
      }
    `,
  ],
})
export class QitsMermaidDiagram {
  /** The Mermaid definition — `erDiagram …`, `flowchart …` — without the Markdown fence. */
  readonly definition = input.required<string>();
  /** What the drawn diagram is, for assistive technology. */
  readonly label = input<string>('Diagram');

  private readonly load = inject(QITS_MERMAID_LOADER);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  protected readonly state = signal<DrawState>('drawing');
  private readonly theme = signal<QitsMermaidTheme>('neutral');
  private drawn = 0;

  constructor() {
    // The media query and the attribute are only the moments the property may have moved; what
    // it moved to is read off the page each time. A set to the same theme is no change to the
    // signal, so nothing redraws for nothing.
    const document = inject(DOCUMENT);
    const follow = () => this.theme.set(pageTheme(document));
    follow();
    const view = document.defaultView;
    const media = typeof view?.matchMedia === 'function' ? view.matchMedia(DARK) : null;
    media?.addEventListener?.('change', follow);
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(follow) : null;
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    inject(DestroyRef).onDestroy(() => {
      media?.removeEventListener?.('change', follow);
      observer?.disconnect();
    });

    effect(() => {
      const definition = this.definition();
      const theme = this.theme();
      untracked(() => void this.draw(definition, theme));
    });
  }

  /** Draws one definition; a draw overtaken by a newer one is dropped when it lands. */
  private async draw(definition: string, theme: QitsMermaidTheme): Promise<void> {
    const draw = ++this.drawn;
    const id = `qits-mermaid-${++sequence}`;
    this.state.set('drawing');
    try {
      if (!definition.trim()) throw new Error('empty definition');
      const mermaid = await this.load();
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
      const { svg } = await mermaid.render(id, definition);
      if (draw !== this.drawn) return;
      // Put in place as it is, the way qits-docs-frontend does: mermaid's strict mode sanitised
      // this SVG already, and Angular's own HTML sanitiser would strip every SVG element out of it.
      this.canvas().nativeElement.innerHTML = svg;
      this.state.set('drawn');
    } catch {
      // mermaid leaves its scratch container (`#d<id>`, holding the error drawing) in the body
      // when a render fails; it is nobody's, so it goes.
      if (typeof document !== 'undefined') document.getElementById(`d${id}`)?.remove();
      // An undrawable diagram stays what it already is: the definition, legible as text.
      if (draw === this.drawn) this.state.set('failed');
    }
  }
}
