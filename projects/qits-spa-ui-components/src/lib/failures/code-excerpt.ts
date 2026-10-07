import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  highlighterFor,
  QITS_PLAIN_HIGHLIGHTER,
  QITS_SYNTAX_HIGHLIGHTERS,
  type QitsCodeToken,
} from './syntax';

/**
 * `<qits-code-excerpt>`: a run of a file's lines with their real line numbers, highlighted for
 * `language` by whichever {@link QitsSyntaxHighlighter} is registered for it — plain where none is.
 *
 * **Presentational: it fetches nothing.** The lines arrive as an input, as `<qits-diff-viewer>`'s
 * patch does, so a code preview, a story and anything else that holds lines can draw them.
 *
 * The numbers are an `<ol start>` for what the list means and a gutter for what it shows; the
 * gutter is not selectable, so copying an excerpt copies code. Long lines scroll inside the box
 * and never widen the page around it — `contain: inline-size` keeps the excerpt from asking a table
 * cell for more room than it has.
 *
 * Token colours are custom properties — `--qits-code-keyword`, `--qits-code-string`, … — with a
 * light and a dark value through `light-dark()`, so a page that declares `color-scheme: dark`
 * gets the dark set and a page may override any one of them.
 */
@Component({
  selector: 'qits-code-excerpt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="excerpt">
      <ol class="lines" [start]="first()">
        @for (line of tokens(); track $index) {
          <li class="line">
            <span class="gutter" aria-hidden="true">{{ first() + $index }}</span>
            <!-- prettier-ignore -->
            <code class="text">@for (token of line; track $index) {<span [class]="'t-' + token.type">{{ token.text }}</span>}</code>
          </li>
        }
      </ol>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
    .excerpt {
      contain: inline-size;
      overflow-x: auto;
      overflow-y: hidden;
      border: 1px solid var(--qits-code-border, light-dark(#e5e7eb, #374151));
      border-radius: 0.35rem;
      background: var(--qits-code-background, light-dark(#ffffff, #111827));
    }
    .lines {
      display: table;
      min-width: 100%;
      margin: 0;
      padding: 0.35rem 0;
      list-style: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      line-height: 1.5;
    }
    .line {
      display: table-row;
    }
    .gutter {
      display: table-cell;
      min-width: 2.5rem;
      padding: 0 0.75rem 0 0.5rem;
      text-align: right;
      color: var(--qits-code-gutter, light-dark(#9ca3af, #6b7280));
      user-select: none;
      -webkit-user-select: none;
    }
    .text {
      display: table-cell;
      padding-right: 0.75rem;
      white-space: pre;
      tab-size: 4;
      color: var(--qits-code-plain, light-dark(#111827, #e5e7eb));
    }
    .t-keyword {
      color: var(--qits-code-keyword, light-dark(#7c3aed, #c4b5fd));
    }
    .t-string {
      color: var(--qits-code-string, light-dark(#047857, #6ee7b7));
    }
    .t-comment {
      color: var(--qits-code-comment, light-dark(#6b7280, #9ca3af));
      font-style: italic;
    }
    .t-number {
      color: var(--qits-code-number, light-dark(#b45309, #fcd34d));
    }
    .t-annotation {
      color: var(--qits-code-annotation, light-dark(#be185d, #f9a8d4));
    }
    .t-type {
      color: var(--qits-code-type, light-dark(#1d4ed8, #93c5fd));
    }
    .t-punctuation {
      color: var(--qits-code-punctuation, light-dark(#4b5563, #9ca3af));
    }
  `,
})
export class QitsCodeExcerpt {
  /** The lines to draw, without their line ends. */
  readonly lines = input<readonly string[]>([]);
  /** The first line's number in its file, 1-based. */
  readonly firstLine = input<number>(1);
  /** `java`, `typescript`, … — as `QitsTestCoordinates.language` spells it. */
  readonly language = input<string>('');

  private readonly highlighters = inject(QITS_SYNTAX_HIGHLIGHTERS, { optional: true });

  protected readonly first = computed(() => {
    const first = this.firstLine();
    return Number.isInteger(first) && first > 0 ? first : 1;
  });

  /**
   * The highlighter's tokens — or, for a line whose tokens do not spell it back exactly (a
   * highlighter's bug, or a throw), the line as one plain token. What is drawn is always the code.
   */
  protected readonly tokens = computed<readonly (readonly QitsCodeToken[])[]>(() => {
    const lines = this.lines() ?? [];
    let highlighted: readonly (readonly QitsCodeToken[])[] = [];
    try {
      highlighted = highlighterFor(this.language(), this.highlighters).highlight(lines);
    } catch {
      highlighted = [];
    }
    const plain = QITS_PLAIN_HIGHLIGHTER.highlight(lines);
    return lines.map((line, index) => {
      const tokens = highlighted[index];
      return tokens && tokens.map((token) => token.text).join('') === line ? tokens : plain[index];
    });
  });
}
