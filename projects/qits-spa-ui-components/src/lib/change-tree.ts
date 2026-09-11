import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import {
  buildChangeTree,
  flattenChanges,
  qitsChangeLetter,
  qitsChangeTitle,
  qitsChangeTone,
  type QitsChangeEntry,
  type QitsChangeRow,
} from './change-tree-model';

/**
 * The files a change set touches, as a tree — a commit's changes, or a release request's fold.
 *
 * It holds no data and makes no request: everything it draws was decided in `change-tree-model.ts`
 * and everything it reports is the selection. That split is what lets the model be tested as
 * arithmetic rather than through a DOM, and it is the only reason the fold below is cheap to trust.
 *
 * **Single-child directory chains fold into one row.** `components/qits-projects/qits-projects-service`
 * is one row reading one address, not three rows of chrome around the file anybody opened the view
 * for. A wrapper release request, where every path has that shape, is the case that asked for it.
 *
 * **The chevron is drawn in CSS**: a rotated bordered corner costs the same as a `▸` character and
 * cannot fail to render where the font has no glyph.
 *
 * **A folder click never moves the selection.** Folding a directory shut while reading a diff is
 * navigation, not a choice of file, and stealing the highlight would lose the reader's place. The
 * shut set is this component's own state for that reason — it is a view's posture, not a fact any
 * caller has an opinion about.
 *
 * **The flattened list is deliberate.** A recursive component would nest one host element per level
 * and make `aria-level` a lie about the DOM; a flat list with `aria-level` is the pattern
 * assistive technology expects.
 */
@Component({
  selector: 'qits-change-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="qits-change-tree" role="tree" [attr.aria-label]="label()">
      @for (row of rows(); track row.path) {
        <li
          class="qits-change-tree-row"
          role="treeitem"
          [class.qits-change-tree-selected]="row.kind === 'file' && row.path === selected()"
          [attr.aria-level]="row.depth + 1"
          [attr.aria-expanded]="row.kind === 'file' ? null : row.open"
          [attr.aria-selected]="row.kind === 'file' && row.path === selected()"
          [style.padding-left.rem]="0.35 + row.depth * 0.85"
        >
          <button
            type="button"
            class="qits-change-tree-entry"
            [attr.data-path]="row.path"
            [attr.data-kind]="row.kind"
            [attr.title]="titleOf(row)"
            (click)="press(row)"
          >
            @if (row.kind === 'file') {
              <span class="qits-change-tree-gap" aria-hidden="true"></span>
            } @else {
              <span
                class="qits-change-tree-chevron"
                [class.qits-change-tree-chevron-open]="row.open"
                aria-hidden="true"
              ></span>
            }
            <span class="qits-change-tree-name">{{ row.label }}</span>
            @if (row.change; as change) {
              <span
                class="qits-change-tree-mark qits-change-tree-mark-{{ toneOf(change) }}"
                [attr.data-change]="change.changeType"
                >{{ letterOf(change) }}</span
              >
            }
          </button>
        </li>
      } @empty {
        <li class="qits-change-tree-none" role="none">No files changed.</li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .qits-change-tree {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .qits-change-tree-row {
      display: block;
    }
    .qits-change-tree-none {
      padding: 0.35rem;
      color: #6b7280;
      font-size: 0.85rem;
    }
    .qits-change-tree-entry {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      width: 100%;
      padding: 0.15rem 0.35rem;
      border: 0;
      border-radius: 0.25rem;
      background: none;
      color: #111827;
      font: inherit;
      font-size: 0.85rem;
      text-align: left;
      cursor: pointer;
    }
    .qits-change-tree-entry:hover {
      background: #f3f4f6;
    }
    .qits-change-tree-selected > .qits-change-tree-entry {
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 600;
    }
    /* A rotated bordered corner rather than a ▸ character: no font can fail to render a border. */
    .qits-change-tree-chevron,
    .qits-change-tree-gap {
      flex: 0 0 auto;
      width: 0.7rem;
      height: 0.7rem;
    }
    .qits-change-tree-chevron::before {
      content: '';
      display: block;
      width: 0.34rem;
      height: 0.34rem;
      margin: 0.16rem 0 0 0.1rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: rotate(-45deg);
      transition: transform 120ms ease;
    }
    .qits-change-tree-chevron-open::before {
      transform: rotate(45deg);
    }
    @media (prefers-reduced-motion: reduce) {
      .qits-change-tree-chevron::before {
        transition: none;
      }
    }
    .qits-change-tree-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .qits-change-tree-mark {
      flex: 0 0 auto;
      margin-left: auto;
      width: 1rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.75rem;
      font-weight: 700;
      text-align: center;
    }
    .qits-change-tree-mark-info {
      color: #1d4ed8;
    }
    .qits-change-tree-mark-success {
      color: #047857;
    }
    .qits-change-tree-mark-warning {
      color: #b45309;
    }
    .qits-change-tree-mark-danger {
      color: #b91c1c;
    }
  `,
})
export class QitsChangeTree {
  /** The changed files. Order does not matter: the model sorts directories first, then by name. */
  readonly entries = input<readonly QitsChangeEntry[]>([]);

  /** What the tree is called, for a screen reader. */
  readonly label = input('Changed files');

  /**
   * The open file's path, and the only row drawn as chosen. A `model`, so `[(selected)]` binds both
   * ways and `(selectedChange)` alone reads as the output — the caller that routes on a selection
   * wants the second form, and the caller that just keeps a signal wants the first.
   */
  readonly selected = model<string | null>(null);

  /** The directories the reader has folded shut. Everything else is open — see the model. */
  private readonly closed = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly rows = computed<readonly QitsChangeRow[]>(() =>
    flattenChanges(buildChangeTree(this.entries()), this.closed()),
  );

  protected letterOf(change: QitsChangeEntry): string {
    return qitsChangeLetter(change.changeType);
  }

  protected toneOf(change: QitsChangeEntry): string {
    return qitsChangeTone(change.changeType);
  }

  /** A file states its change, and a rename the path it came from; a directory states its path. */
  protected titleOf(row: QitsChangeRow): string {
    return row.change ? qitsChangeTitle(row.change) : row.path;
  }

  protected press(row: QitsChangeRow): void {
    if (row.kind === 'file') {
      this.selected.set(row.path);
      return;
    }
    // A directory only ever changes what is visible. The selection stays where the reader put it.
    const next = new Set(this.closed());
    if (next.has(row.path)) {
      next.delete(row.path);
    } else {
      next.add(row.path);
    }
    this.closed.set(next);
  }
}
