import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

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
 * How `QitsMermaidDiagram` gets mermaid: a lazy `import('mermaid')`, called the first time a
 * diagram actually renders and never before, so the chunk loads only on a page that draws one.
 * A spec or story replaces it with `{ provide: QITS_MERMAID_LOADER, useValue: () => stub }`.
 */
export const QITS_MERMAID_LOADER = new InjectionToken<() => Promise<QitsMermaid>>(
  'QITS_MERMAID_LOADER',
  {
    providedIn: 'root',
    factory: () => async () => (await import('mermaid')).default as unknown as QitsMermaid,
  },
);

type DrawState = 'drawing' | 'drawn' | 'failed';

let sequence = 0;

const DARK = '(prefers-color-scheme: dark)';

/**
 * One Mermaid diagram, drawn from its definition — qits-docs-frontend's `renderMermaidBlocks`,
 * lifted into the library.
 *
 * - mermaid is imported lazily ({@link QITS_MERMAID_LOADER}), only once this component renders,
 *   and initialised with `securityLevel: 'strict'`: labels are text, never markup, and the SVG
 *   it returns has been through mermaid's own DOMPurify pass — which is why it may be put in place
 *   as it is.
 * - A definition mermaid cannot draw, or mermaid failing to load, leaves the definition in a
 *   `<pre>`, legible as text. It never throws.
 * - It redraws when `definition` changes, and when the host's `prefers-color-scheme` does:
 *   `theme: 'neutral'` on a light page, `'dark'` on a dark one.
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
  styles: `
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
      color: #111827;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    .drawing {
      margin: 0.25rem 0;
      color: #6b7280;
      font-size: 0.8rem;
    }
    @media (prefers-color-scheme: dark) {
      .definition {
        color: #e5e7eb;
        background: #111827;
        border-color: #374151;
      }
      .drawing {
        color: #9ca3af;
      }
    }
  `,
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
    const media =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(DARK)
        : null;
    if (media) {
      this.theme.set(media.matches ? 'dark' : 'neutral');
      const follow = (event: MediaQueryListEvent) =>
        this.theme.set(event.matches ? 'dark' : 'neutral');
      media.addEventListener?.('change', follow);
      inject(DestroyRef).onDestroy(() => media.removeEventListener?.('change', follow));
    }

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
