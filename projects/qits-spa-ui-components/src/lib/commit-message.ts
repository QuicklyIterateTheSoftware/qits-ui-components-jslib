import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { QitsWorkBriefs } from './work-briefs';
import { QitsWorkRef } from './work-ref';

/** One run of a commit message: text as it is, or a work item's qualified id. */
export type QitsCommitMessageRun =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'ref'; readonly qualifiedId: string };

/**
 * `message` split into text and the work ids of `project` it names — `<slug>-<digits>`, the slug
 * as given (regex-escaped, case-sensitive) and for that slug only.
 *
 * An id is a whole word: the character before the slug is none of `[A-Za-z0-9_-]`, so neither
 * `fooqits-1` nor the `qits-1` inside `other-qits-1` is one, and the character after the digits is
 * none of `[A-Za-z0-9_]`, so `qits-1897x` is not one either. A `-` after the digits ends it —
 * `qits-1897-followup` names `qits-1897` — and `qits-ci-service` never matches, having no digits
 * after the slug. No project, or no id in the message, is one text run (none for an empty message).
 */
export function qitsCommitMessageRuns(
  message: string,
  project: string | undefined,
): QitsCommitMessageRun[] {
  if (!message) return [];
  if (!project) return [{ kind: 'text', text: message }];
  const slug = project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])${slug}-\\d+(?![A-Za-z0-9_])`, 'g');
  const runs: QitsCommitMessageRun[] = [];
  let from = 0;
  for (const match of message.matchAll(pattern)) {
    if (match.index > from) runs.push({ kind: 'text', text: message.slice(from, match.index) });
    runs.push({ kind: 'ref', qualifiedId: match[0] });
    from = match.index + match[0].length;
  }
  if (from < message.length) runs.push({ kind: 'text', text: message.slice(from) });
  return runs;
}

/**
 * A commit message — usually its subject — with every work id of `project` in it drawn as a
 * `<qits-work-ref>`: `feat(qits-1897): …` gets a popover on `qits-1897` with the item's status, age
 * and title.
 *
 * `project` is the **slug** the ids spell. Without one the message is plain text. Text is
 * interpolated, never `innerHTML`, so a message is never markup.
 *
 * Every id the message names is registered with `QitsWorkBriefs` as it renders, so a list of
 * commits asks qits-projects once for all of them; an id with no brief stays plain text.
 *
 * Inline by construction: `display: inline`, no wrapper around a run, so it drops into an existing
 * `<span class="message">` or a truncating span, and the popover is not clipped there (see
 * `QitsWorkRef`).
 *
 * ```html
 * <span class="message truncate"><qits-commit-message [message]="commit.subject" [project]="slug()" /></span>
 * ```
 */
@Component({
  selector: 'qits-commit-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsWorkRef],
  template: `@for (run of runs(); track $index) {
    @if (run.kind === 'ref') {
      <qits-work-ref [project]="project()" [qualifiedId]="run.qualifiedId" />
    } @else {
      <ng-container>{{ run.text }}</ng-container>
    }
  }`,
  styles: `
    :host {
      display: inline;
    }
  `,
})
export class QitsCommitMessage {
  /** The message, as git has it. */
  readonly message = input<string>('');
  /** The slug of the project whose work ids the message spells; none means plain text. */
  readonly project = input<string | undefined>(undefined);

  private readonly briefs = inject(QitsWorkBriefs);

  protected readonly runs = computed(() => {
    const project = this.project();
    const runs = qitsCommitMessageRuns(this.message() ?? '', project);
    // Registering asks nothing yet: the briefs of one tick go out together.
    if (project) {
      for (const run of runs) if (run.kind === 'ref') this.briefs.request(project, run.qualifiedId);
    }
    return runs;
  });
}
