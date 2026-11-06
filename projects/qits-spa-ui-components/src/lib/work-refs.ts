import { isPlatformBrowser } from '@angular/common';
import {
  afterRenderEffect,
  ApplicationRef,
  createComponent,
  Directive,
  ElementRef,
  EnvironmentInjector,
  inject,
  Injector,
  input,
  PLATFORM_ID,
  untracked,
  type ComponentRef,
} from '@angular/core';

import { qitsCommitMessageRuns } from './commit-message';
import { QitsWorkBriefs } from './work-briefs';
import { QitsWorkRef } from './work-ref';

/** Undoes one `qitsLinkWorkIds`; calling it again does nothing. */
export type QitsWorkIdsDisposer = () => void;

/** The host tag every reference is drawn into — the component's own selector. */
const HOST_TAG = 'qits-work-ref';

/**
 * Elements whose text is never an id: a link stays that link, a reference already drawn is not
 * drawn again, and script, style and form text is not prose.
 */
const NOT_LINKED = new Set(['A', 'QITS-WORK-REF', 'SCRIPT', 'STYLE', 'TEXTAREA']);

const NOTHING_TO_UNDO: QitsWorkIdsDisposer = () => undefined;

/**
 * Draws every work id of `project` in the text under `root` — HTML already rendered, typically
 * markdown through `[innerHTML]` — as a `<qits-work-ref>`, with the same tokeniser as
 * `<qits-commit-message>` (`qitsCommitMessageRuns`) and the same briefs.
 *
 * - **Which text.** Every text node under `root`, `<code>` and `<pre>` included — an id in a code
 *   span is still an id, and the reference inherits the code font. Text inside an `<a>` is left
 *   alone, so a markdown link stays that link, and so is text inside a reference already drawn:
 *   linking a root twice draws nothing twice.
 * - **One request.** Every id found is registered with `QitsWorkBriefs` during the walk, so one
 *   call — several, in one tick — asks qits-projects once per project.
 * - **DOM, never markup.** A text node is split into text nodes and reference hosts; nothing is
 *   parsed. Each reference is a `QitsWorkRef` attached to the `ApplicationRef`, rendered at once
 *   (the id as plain text) and redrawn when its brief settles.
 *
 * `project` is the slug the ids spell. Without one, and anywhere but the browser, nothing changes.
 * `injector` supplies `QitsWorkBriefs`, `QITS_WORK_LINK` and the environment the references are
 * created in — a component's own `inject(Injector)` is the usual one.
 *
 * The answer undoes it: every reference is destroyed and, where its host is still in the document,
 * replaced by its id as text again. Undo before the subtree is re-rendered or re-linked.
 */
export function qitsLinkWorkIds(
  root: HTMLElement,
  project: string | undefined,
  injector: Injector,
): QitsWorkIdsDisposer {
  if (!project || !isPlatformBrowser(injector.get(PLATFORM_ID))) return NOTHING_TO_UNDO;
  const doc = root.ownerDocument;
  const briefs = injector.get(QitsWorkBriefs);

  // Collected first: the walk must not see the nodes it is about to replace.
  const texts: Text[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      return NOT_LINKED.has((node as Element).tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_SKIP;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);

  const placed: { host: HTMLElement; qualifiedId: string }[] = [];
  for (const text of texts) {
    const runs = qitsCommitMessageRuns(text.data, project);
    if (!runs.some((run) => run.kind === 'ref')) continue;
    const pieces = doc.createDocumentFragment();
    for (const run of runs) {
      if (run.kind === 'text') {
        pieces.append(doc.createTextNode(run.text));
        continue;
      }
      // Registering asks nothing yet: every id of this walk goes out in one call.
      briefs.request(project, run.qualifiedId);
      const host = doc.createElement(HOST_TAG);
      pieces.append(host);
      placed.push({ host, qualifiedId: run.qualifiedId });
    }
    text.replaceWith(pieces);
  }
  if (!placed.length) return NOTHING_TO_UNDO;

  const appRef = injector.get(ApplicationRef);
  const environmentInjector = injector.get(EnvironmentInjector);
  const refs: { ref: ComponentRef<QitsWorkRef>; host: HTMLElement; qualifiedId: string }[] = [];
  for (const { host, qualifiedId } of placed) {
    const ref = createComponent(QitsWorkRef, {
      hostElement: host,
      environmentInjector,
      elementInjector: injector,
    });
    // The reference asks `QitsWorkBriefs` for the same signal registered above, and its view reads
    // it: attached to the application, it is redrawn when the brief settles.
    ref.setInput('project', project);
    ref.setInput('qualifiedId', qualifiedId);
    appRef.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    refs.push({ ref, host, qualifiedId });
  }

  let undone = false;
  return () => {
    if (undone) return;
    undone = true;
    for (const { ref, host, qualifiedId } of refs) {
      // Before the destroy, which takes the host out of the document.
      if (host.parentNode) restore(host, qualifiedId);
      ref.destroy();
    }
  };
}

/** Puts the id back as text where its host was, merged with the text on either side. */
function restore(host: HTMLElement, qualifiedId: string): void {
  let text = host.ownerDocument.createTextNode(qualifiedId);
  host.replaceWith(text);
  const before = text.previousSibling;
  if (before?.nodeType === Node.TEXT_NODE) {
    (before as Text).appendData(text.data);
    text.remove();
    text = before as Text;
  }
  const after = text.nextSibling;
  if (after?.nodeType === Node.TEXT_NODE) {
    text.appendData((after as Text).data);
    after.remove();
  }
}

/**
 * Draws the work ids of a project in the HTML rendered into its element as `<qits-work-ref>`s —
 * `qitsLinkWorkIds` on the host, redone when the HTML or the project changes and undone on
 * destroy.
 *
 * `qitsWorkRefs` is the project's slug; none leaves the HTML exactly as rendered. Bind
 * `qitsWorkRefsHtml` to the same value as `[innerHTML]`: a new `innerHTML` replaces the subtree,
 * and that input is how the directive knows to link the new one. Without it the first render is
 * linked and later ones are not.
 *
 * ```html
 * <div class="markdown" [innerHTML]="html()" [qitsWorkRefs]="slug()" [qitsWorkRefsHtml]="html()"></div>
 * ```
 */
@Directive({ selector: '[qitsWorkRefs]' })
export class QitsWorkRefs {
  /** The slug of the project whose work ids the HTML spells; none means it is left alone. */
  readonly qitsWorkRefs = input<string | undefined>(undefined);
  /** What was bound to `[innerHTML]`: any change re-links the new subtree. */
  readonly qitsWorkRefsHtml = input<unknown>(undefined);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    // After the render, so `[innerHTML]` has already replaced the subtree; the previous references
    // are undone first — restoring their text where the subtree survived, a project change.
    afterRenderEffect((onCleanup) => {
      const project = this.qitsWorkRefs();
      this.qitsWorkRefsHtml();
      const undo = untracked(() =>
        qitsLinkWorkIds(this.host.nativeElement, project, this.injector),
      );
      onCleanup(undo);
    });
  }
}
