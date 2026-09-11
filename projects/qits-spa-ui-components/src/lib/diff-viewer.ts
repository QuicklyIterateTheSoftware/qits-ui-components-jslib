import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** One drawn diff line, classed by its first character — the whole of unified-diff rendering. */
interface DiffLine {
  readonly kind: 'add' | 'del' | 'hunk' | 'meta' | 'context';
  readonly text: string;
}

/**
 * A single file's unified diff, coloured by line.
 *
 * The patch text is git's own and is rendered as lines, not parsed: `+`/`-` colour, `@@` marks a
 * hunk, and the `diff/index/---/+++` preamble dims. That is the whole of what a reader needs to see
 * a change, and everything smarter — side-by-side, intra-line highlights — is a fast-follow on the
 * same pane.
 *
 * **The patch arrives as an input; this component never fetches one.** Ported from
 * qits-githost-frontend's `code/diff-viewer.ts`, which injected the API client and read
 * `…/commits/{sha}/diff` for itself. Two callers now want these rows — a commit page and a release
 * request's changes tab, whose patch comes from `…/release-requests/{id}/changes/diff` and is cached
 * per fold — and a self-fetching child could serve neither without knowing about both. So each
 * caller keeps its own read and hands the text down.
 *
 * An EMPTY patch is an answer, not an absence, and has three causes: git emits none for a binary
 * change, none for a pure rename, and the service declines to send one that is too large to be
 * worth rendering. The sentence below says so rather than showing a blank pane.
 */
@Component({
  selector: 'qits-diff-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!path()) {
      <p class="empty" role="status">Select a changed file to view its diff.</p>
    } @else if (lines().length === 0) {
      <p class="unrenderable" role="status">
        No textual change to show — a binary file, a pure rename, or a patch too large to send.
      </p>
    } @else {
      <div class="code">
        <ol class="lines">
          @for (line of lines(); track $index) {
            <li class="line" [class]="line.kind">
              <code class="text">{{ line.text }}</code>
            </li>
          }
        </ol>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .empty,
    .unrenderable {
      margin: 0.5rem 0;
      color: #6b7280;
      font-size: 0.85rem;
    }
    .code {
      overflow: auto;
      max-height: 34rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.35rem;
      background: #ffffff;
    }
    .lines {
      margin: 0;
      padding: 0.35rem 0;
      list-style: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      line-height: 1.5;
    }
    .line {
      padding: 0 0.5rem;
    }
    .text {
      color: #111827;
      white-space: pre;
      tab-size: 2;
    }
    .line.add {
      background: #ecfdf5;
    }
    .line.add .text {
      color: #065f46;
    }
    .line.del {
      background: #fef2f2;
    }
    .line.del .text {
      color: #991b1b;
    }
    .line.hunk {
      background: #eff6ff;
    }
    .line.hunk .text {
      color: #1d4ed8;
    }
    .line.meta .text {
      color: #9ca3af;
    }
  `,
})
export class QitsDiffViewer {
  /** git's own unified-diff text. Empty is an answer — see the class javadoc. */
  readonly patch = input<string>('');

  /** The file the patch is of, or the empty string for the nothing-selected state. */
  readonly path = input<string>('');

  protected readonly lines = computed<readonly DiffLine[]>(() => {
    const patch = this.patch();
    if (!patch) {
      return [];
    }
    const pieces = patch.split('\n');
    if (pieces.length > 1 && pieces[pieces.length - 1] === '') {
      pieces.pop();
    }
    return pieces.map((text) => ({ kind: kindOf(text), text }));
  });
}

/**
 * A line's class, off its first characters. `+++`/`---` are file headers and dim with the
 * preamble; a bare `+`/`-` is the change itself.
 *
 * `\ No newline at end of file` dims too. It is git's own annotation rather than a line of the
 * file, and left to fall through it would draw in the body colour as though the words were content
 * — the one piece of classing this port adds over the githost original.
 */
function kindOf(text: string): DiffLine['kind'] {
  if (text.startsWith('@@')) {
    return 'hunk';
  }
  if (text.startsWith('+++') || text.startsWith('---')) {
    return 'meta';
  }
  if (text.startsWith('+')) {
    return 'add';
  }
  if (text.startsWith('-')) {
    return 'del';
  }
  if (
    text.startsWith('diff ') ||
    text.startsWith('index ') ||
    text.startsWith('new ') ||
    text.startsWith('old ') ||
    text.startsWith('rename ') ||
    text.startsWith('copy ') ||
    text.startsWith('similarity ') ||
    text.startsWith('deleted ') ||
    text.startsWith('Binary ') ||
    text.startsWith('\\ ')
  ) {
    return 'meta';
  }
  return 'context';
}
