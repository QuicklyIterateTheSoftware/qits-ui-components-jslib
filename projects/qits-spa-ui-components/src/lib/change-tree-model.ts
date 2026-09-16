/**
 * The tree a *change set* draws, as pure functions — ported from qits-githost-frontend's
 * `code/tree-model.ts` and turned from a committed tree into a set of changes.
 *
 * What changed in the port, and why. The githost model builds from a listing of every blob path in
 * a commit; this one builds from entries that each carry a change type and, for a rename, the path
 * the file came from. So a leaf is not a bare path any more — it is the change, and the row that
 * draws it has the change in hand without a second lookup.
 *
 * What stayed is the load-bearing half: implying directories from deep slash-separated paths, and
 * flattening with single-child directory chains folded into one row. The fold is the whole reason
 * this exists as arithmetic rather than as a template — a wrapper release request whose every path
 * reads `components/<component>/<repository>/…` is otherwise four rows of chrome per file, and the
 * one file is the only row anybody wants to see. Folding it is a property of the *model*, which is
 * why it can be tested as arithmetic and not through a DOM.
 *
 * The fold joins the chain into a single segment string rather than a run of dimmed prefixes:
 * `components/qits-projects/qits-projects-service` reads as the one address it is, and the row
 * count for that path drops from four to two.
 *
 * **A directory may carry a change of its own, and that is how a submodule is spelled.** A wrapper
 * release request changes a gitlink — one entry at `components/qits-ci/qits-ci-service`, of type
 * `MODIFIED`, whose content is the pin move — and the reader wants the files behind that bump in
 * the *same* tree, nested under the path they belong to. So the sibling repository's changed files
 * arrive as entries below that same path. The node where the two meet is therefore both a directory
 * (it has children) and a change (the pin move): expandable *and* selectable, because selecting it
 * is how a reader asks for the commits behind the bump. Nothing new is needed on the input to say
 * so — a caller states it by having entries both *at* and *below* a path, which is exactly what the
 * service already emits, and the model reads the shape rather than a flag it would have to trust.
 *
 * Two consequences fall out of that, and both are load-bearing:
 *
 * - **Building is order-independent.** The entries arrive in whatever order the fold produced them,
 *   and the gitlink's own entry may come before or after the files under it. Neither order may lose
 *   a row. An entry landing where a directory already stands attaches its change to that directory;
 *   a directory needed under a path where a file node already stands promotes that node in place,
 *   keeping its change and its path. The earlier model dropped the first case on the floor and
 *   hung children off a `'file'` node in the second — silently, and differently depending on the
 *   order, which is the worst way for a view to be wrong.
 * - **The fold stops at such a directory**, as the head of a run and as a link in it. Folding exists
 *   to delete rows nobody would click; a submodule's row is precisely a row somebody clicks, so
 *   swallowing it into the label above it would take the selection away with it.
 */

/** The service's `CommitFileChangeDto.changeType` vocabulary, spelled as it arrives on the wire. */
export type QitsChangeType =
  | 'ADDED'
  | 'MODIFIED'
  | 'DELETED'
  | 'RENAMED'
  | 'COPIED'
  | 'TYPE_CHANGED';

/** One changed file — the `CommitFileChangeDto` shape, and the only input this model takes. */
export interface QitsChangeEntry {
  /** The path after the change. For a delete, the path that is gone. */
  readonly path: string;
  /** Where a rename or a copy came from; absent for everything else. */
  readonly previousPath?: string | null;
  readonly changeType: QitsChangeType;
}

/** What a node is. There are no lazy stubs here: a change set arrives whole or not at all. */
export type QitsChangeNodeKind = 'file' | 'dir';

/** One node of the change tree. */
export interface QitsChangeNode {
  readonly kind: QitsChangeNodeKind;
  /** Root-relative. The empty string is the tree root, which is never rendered. */
  readonly path: string;
  /** The last segment, which is what an unfolded row shows. */
  readonly name: string;
  readonly children: readonly QitsChangeNode[];
  /**
   * The change this node stands for, or null where the node is only an implied directory.
   *
   * A file node always has one. A *directory* has one exactly when the change set named the
   * directory's own path as well as paths beneath it — which is a submodule: its own change is the
   * pin move recorded in the parent repository, and its children are the files behind that bump.
   */
  readonly change: QitsChangeEntry | null;
}

/** A root with nothing in it — what an empty change set builds to. */
export const QITS_EMPTY_CHANGE_NODE: QitsChangeNode = {
  kind: 'dir',
  path: '',
  name: '',
  children: [],
  change: null,
};

/** One rendered line of the tree. Folding means a row is not always one node. */
export interface QitsChangeRow {
  readonly kind: QitsChangeNodeKind;
  /**
   * The path the row acts on: the file's path, or — for a folded chain — the deepest directory in
   * it. This is what a click toggles and what the selection is compared against.
   */
  readonly path: string;
  /**
   * What the row reads. A file shows its last segment; a folded directory chain shows its segments
   * joined with `/`, so `components/qits-projects/qits-projects-service` is one row and one string.
   */
  readonly label: string;
  /** Every directory path this one row stands for, deepest last. Empty on a file row. */
  readonly chain: readonly string[];
  /** Indent level. A whole folded chain counts as one. */
  readonly depth: number;
  /** Whether this row's children are showing. Always false on a file row. */
  readonly open: boolean;
  /**
   * The change this row draws its mark from, or null where the row is only an implied directory.
   *
   * A file row always has one. A directory row has one when it is a submodule — the row stands for
   * the pin move as well as for the subtree — and such a row is never folded into the label above
   * it, so the change on it always belongs to the row's own `path`.
   */
  readonly change: QitsChangeEntry | null;
}

/**
 * Build the tree from the change entries. Directories are implied by the paths and created on the
 * way down, exactly as the githost model does it — a change set names files and nothing else, so
 * there is no separate directory listing to reconcile against.
 *
 * A path that appears twice keeps the first entry: a change set is one entry per path by
 * construction, and silently drawing two rows for one file would be worse than ignoring the
 * second.
 */
export function buildChangeTree(entries: readonly QitsChangeEntry[]): QitsChangeNode {
  const draft = newDraft('dir', '', '');
  for (const entry of entries) {
    addChange(draft, entry);
  }
  return freeze(draft);
}

/**
 * The rows to render, in order: a shut directory is not descended into, and a run of single-child
 * directories folds into one row whose label is the run joined with `/`.
 *
 * The set names the directories the reader has folded **shut**, not the ones that are open. A
 * change set is small and is the entire point of the view, so it opens with every changed file
 * visible; an expanded-set model would have to be seeded with every directory before the first
 * paint and would quietly show nothing if a caller forgot.
 */
export function flattenChanges(
  root: QitsChangeNode,
  closed: ReadonlySet<string> = new Set<string>(),
): readonly QitsChangeRow[] {
  const rows: QitsChangeRow[] = [];
  const walk = (parent: QitsChangeNode, depth: number): void => {
    for (const child of parent.children) {
      if (child.kind === 'file') {
        rows.push({
          kind: 'file',
          path: child.path,
          label: child.name,
          chain: [],
          depth,
          open: false,
          change: child.change,
        });
        continue;
      }
      const chain = foldChain(child);
      const tail = chain[chain.length - 1];
      const open = !closed.has(tail.path);
      rows.push({
        kind: 'dir',
        path: tail.path,
        label: chain.map((node) => node.name).join('/'),
        chain: chain.map((node) => node.path),
        depth,
        open,
        // Only a submodule's directory has one, and the fold never puts one anywhere but the tail.
        change: tail.change,
      });
      if (open) {
        walk(tail, depth + 1);
      }
    }
  };
  walk(root, 0);
  return rows;
}

/** The one-letter mark a change type is drawn as. */
export function qitsChangeLetter(changeType: QitsChangeType): string {
  switch (changeType) {
    case 'ADDED':
      return 'A';
    case 'MODIFIED':
      return 'M';
    case 'DELETED':
      return 'D';
    case 'RENAMED':
      return 'R';
    case 'COPIED':
      return 'C';
    case 'TYPE_CHANGED':
      return 'T';
  }
}

/** The mark's tone, named for what it means. The names are `QitsBadge`'s, minus `neutral`. */
export type QitsChangeTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * The mark's tone, as a semantic name rather than a colour — the same rule `QitsBadge` follows, so
 * a restyle of the whole system stays inside this repository.
 */
export function qitsChangeTone(changeType: QitsChangeType): QitsChangeTone {
  switch (changeType) {
    case 'ADDED':
      return 'success';
    case 'DELETED':
      return 'danger';
    case 'RENAMED':
    case 'COPIED':
      return 'warning';
    case 'MODIFIED':
    case 'TYPE_CHANGED':
      return 'info';
  }
}

/**
 * The row's `title`. A rename or a copy states the path it came from, because the label shows only
 * the new one and the old path is the whole of what a rename *is*.
 */
export function qitsChangeTitle(entry: QitsChangeEntry): string {
  const word = WORDS[entry.changeType];
  if (entry.previousPath && entry.previousPath !== entry.path) {
    return `${entry.path} — ${word} from ${entry.previousPath}`;
  }
  return `${entry.path} — ${word}`;
}

const WORDS: Record<QitsChangeType, string> = {
  ADDED: 'added',
  MODIFIED: 'modified',
  DELETED: 'deleted',
  RENAMED: 'renamed',
  COPIED: 'copied',
  TYPE_CHANGED: 'type changed',
};

// ---- the mechanics ------------------------------------------------------------------------------

interface Draft {
  kind: QitsChangeNodeKind;
  path: string;
  name: string;
  children: Map<string, Draft>;
  change: QitsChangeEntry | null;
}

function newDraft(kind: QitsChangeNodeKind, path: string, name: string): Draft {
  return { kind, path, name, children: new Map(), change: null };
}

function addChange(root: Draft, entry: QitsChangeEntry): void {
  const segments = entry.path.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) {
    return;
  }
  let node = root;
  for (let at = 0; at < segments.length - 1; at += 1) {
    node = childDraft(node, segments[at]);
  }
  const name = segments[segments.length - 1];
  const existing = node.children.get(name);
  if (existing) {
    // A directory already stands here — the files behind a submodule's bump arrived before the
    // bump itself. The directory takes the change; it does not lose it and it does not become a
    // file. A second entry for a path that already has a change is the duplicate case, and the
    // first entry keeps the row.
    if (existing.change === null) {
      existing.change = entry;
    }
    return;
  }
  const made = newDraft('file', joinPath(node.path, name), name);
  made.change = entry;
  node.children.set(name, made);
}

function childDraft(parent: Draft, name: string): Draft {
  const existing = parent.children.get(name);
  if (existing) {
    // A file node standing where a directory is needed is a submodule whose own entry arrived
    // first. Promote it in place: the path and the change are the row's, and the children are
    // about to be hung off it. Replacing it would drop the pin move, which is the other order's
    // bug read backwards.
    existing.kind = 'dir';
    return existing;
  }
  const made = newDraft('dir', joinPath(parent.path, name), name);
  parent.children.set(name, made);
  return made;
}

/** Directories before files, then by name — the order every file browser has. */
function freeze(draft: Draft): QitsChangeNode {
  const children = [...draft.children.values()]
    .map(freeze)
    .sort(
      (left, right) => rankOf(left) - rankOf(right) || left.name.localeCompare(right.name, 'en'),
    );
  return {
    kind: draft.kind,
    path: draft.path,
    name: draft.name,
    children,
    change: draft.change,
  };
}

function rankOf(node: QitsChangeNode): number {
  return node.kind === 'file' ? 1 : 0;
}

/**
 * Fold a run of single-child directories into one row. The run stops at the first directory with
 * more than one child, and at a directory whose only child is a file — a file is a row of its own.
 *
 * It also stops at a directory carrying a change, at both ends: such a directory is a submodule,
 * and its row is one a reader selects to see the commits behind the bump. A row somebody chooses
 * cannot be a segment of somebody else's label.
 */
function foldChain(head: QitsChangeNode): readonly QitsChangeNode[] {
  const chain: QitsChangeNode[] = [head];
  if (head.change) {
    return chain;
  }
  let node = head;
  for (;;) {
    const only = node.children.length === 1 ? node.children[0] : null;
    if (!only || only.kind !== 'dir' || only.change) {
      return chain;
    }
    chain.push(only);
    node = only;
  }
}

function joinPath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`;
}
