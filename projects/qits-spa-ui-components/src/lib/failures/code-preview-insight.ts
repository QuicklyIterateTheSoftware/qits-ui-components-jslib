import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { QitsAppLinks } from '../app-links';
import { QITS_PROJECTS } from '../projects';
import type { QitsReportContext } from '../reports';
import { QITS_REPOSITORIES, type QitsRepository } from '../repositories';
import { QITS_SCOPE } from '../scope';
import type { QitsTestFailure } from '../test-results-report';
import { QitsCodeExcerpt } from './code-excerpt';
import type { QitsFailureKind } from './failure-kinds';
import type { QitsFailureInsightProvider } from './failure-insights';
import { QitsSourceFiles, type QitsSourceFile } from './source-files';

/** The most lines an excerpt draws; the rest is counted, not shown. */
export const QITS_CODE_PREVIEW_MAX_LINES = 200;

/** Where the failure's repository stands: still being listed, not resolvable here, or known. */
type Target =
  | { readonly state: 'waiting' }
  | { readonly state: 'unresolved' }
  | { readonly state: 'resolved'; readonly repository: QitsRepository };

/** What the preview draws: the excerpt, or one muted sentence. */
type View =
  | { readonly kind: 'pending' }
  | { readonly kind: 'muted'; readonly text: string }
  | {
      readonly kind: 'excerpt';
      readonly lines: readonly string[];
      readonly firstLine: number;
      readonly more: number;
    };

/**
 * The code-preview insight's component: the failing test's lines, read from qits-githost at the
 * commit the run tested, with a link to the same lines on the git host's Code page.
 *
 * The repository is named in the coordinates and resolved to its id through the chrome's
 * repository listing (`QITS_REPOSITORIES`), which lists the project in scope — so a failure of
 * another project's repository is not resolvable here, and says so. The read itself is
 * {@link QitsSourceFiles}', and is made once per file and commit.
 *
 * Every way it can go short of the excerpt is one muted line, never an error: no repository here,
 * a commit the host no longer has, a path not in it, a binary or oversized file, a failed read, a
 * line range outside the file. The link is offered whenever the repository and the commit are
 * known, because the Code page can say more than this can.
 */
@Component({
  selector: 'qits-code-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsCodeExcerpt],
  template: `
    @let v = view();
    @switch (v.kind) {
      @case ('pending') {
        <p class="muted pending">Reading the test code…</p>
      }
      @case ('muted') {
        <p class="muted degraded">{{ v.text }}</p>
      }
      @case ('excerpt') {
        <qits-code-excerpt [lines]="v.lines" [firstLine]="v.firstLine" [language]="language()" />
        @if (v.more > 0) {
          <p class="muted more">… {{ v.more }} more lines</p>
        }
      }
    }
    @if (href(); as link) {
      <a class="open" [href]="link">Open in githost at {{ sha7() }}</a>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .muted {
      margin: 0.25rem 0;
      color: #6b7280;
    }
    .open {
      display: inline-block;
      margin-top: 0.25rem;
      font-size: 0.8rem;
      color: #1d4ed8;
    }
  `,
})
export class QitsCodePreview {
  readonly failure = input.required<QitsTestFailure>();
  readonly kind = input<QitsFailureKind | null>(null);
  readonly context = input<QitsReportContext | null>(null);

  private readonly repositories = inject(QITS_REPOSITORIES, { optional: true });
  private readonly scope = inject(QITS_SCOPE, { optional: true });
  private readonly projects = inject(QITS_PROJECTS, { optional: true });
  private readonly links = inject(QitsAppLinks);
  private readonly files = inject(QitsSourceFiles);

  private readonly coordinates = computed(() => this.failure().coordinates);
  protected readonly language = computed(
    () => this.kind()?.language ?? this.coordinates().language ?? '',
  );
  private readonly sha = computed(
    () => this.coordinates().commitSha || this.context()?.commitSha || '',
  );
  protected readonly sha7 = computed(() => this.sha().slice(0, 7));

  private readonly target = computed<Target>(() => {
    const { name, projectId } = this.coordinates().repository ?? {};
    if (!this.repositories || !name) return { state: 'unresolved' };
    // The listing is the scoped project's; a failure of another project's repository is not in it.
    const scoped = this.scope?.projectId();
    if (scoped && projectId && scoped !== projectId) return { state: 'unresolved' };
    if (this.repositories.failed()) return { state: 'unresolved' };
    const listed = this.repositories.repositories();
    if (listed === undefined) return { state: 'waiting' };
    const repository = listed.find((candidate) => candidate.name === name);
    return repository ? { state: 'resolved', repository } : { state: 'unresolved' };
  });

  /** The read the effect last asked for, and its answer once there is one. */
  private readonly answer = signal<{ readonly key: string; readonly file?: QitsSourceFile } | null>(
    null,
  );
  private readonly readKey = computed(() => {
    const target = this.target();
    const file = this.coordinates().file;
    const sha = this.sha();
    return target.state === 'resolved' && file && sha
      ? JSON.stringify([target.repository.id, sha, file])
      : null;
  });

  constructor() {
    effect(() => {
      const key = this.readKey();
      if (!key) return;
      untracked(() => {
        if (this.answer()?.key === key) return;
        this.answer.set({ key });
        const [repositoryId, sha, path] = JSON.parse(key) as [string, string, string];
        void this.files.read(repositoryId, sha, path).then((file) => {
          if (this.answer()?.key === key) this.answer.set({ key, file });
        });
      });
    });
  }

  protected readonly view = computed<View>(() => {
    const { file, lineStart, lineEnd, repository } = this.coordinates();
    const target = this.target();
    if (target.state === 'waiting') return { kind: 'pending' };
    if (target.state === 'unresolved') {
      return muted(
        `The repository ${repository?.name ?? '(unnamed)'} cannot be resolved here, so its test code is not shown.`,
      );
    }
    if (!this.sha()) return muted('The run names no commit, so the test code is not shown.');
    if (!file || lineStart === null || lineEnd === null) {
      return muted('The failure names no lines, so the test code is not shown.');
    }
    const answer = this.answer();
    if (!answer?.file || answer.key !== this.readKey()) return { kind: 'pending' };
    const read = answer.file;
    const sha7 = this.sha7();
    switch (read.kind) {
      case 'file':
        return excerpt(read.content, file, sha7, lineStart, lineEnd);
      case 'no-such-rev':
        return muted(`The commit ${sha7} is no longer on the git host.`);
      case 'no-such-path':
        return muted(`${file} is not in commit ${sha7} on the git host.`);
      case 'no-such-repository':
        return muted(`The git host has no repository ${repository?.name ?? ''}.`);
      case 'binary':
        return muted(`${file} is a binary file, so it is not shown.`);
      case 'too-large':
        return muted(`${file} is larger than 2 MiB, so it is not shown.`);
      default:
        return muted('The test code could not be read from the git host.');
    }
  });

  /** The Code page at the commit, the file open and the lines marked — once its address is known. */
  protected readonly href = computed<string | undefined>(() => {
    const target = this.target();
    const sha = this.sha();
    const { file, lineStart, lineEnd, repository } = this.coordinates();
    if (target.state !== 'resolved' || !sha) return undefined;
    const project = this.projectSlug(repository?.projectId);
    const group = target.repository.component ?? target.repository.category;
    if (!project || !group) return undefined;
    const query: string[] = [];
    if (file) query.push(`path=${encodeURIComponent(file).replace(/%2F/g, '/')}`);
    if (file && lineStart !== null && lineEnd !== null) {
      query.push(`lines=${lineStart === lineEnd ? lineStart : `${lineStart}-${lineEnd}`}`);
    }
    const path = `branches/${encodeURIComponent(sha)}${query.length ? `?${query.join('&')}` : ''}`;
    return this.links.href('qits-githost', path, {
      project,
      group,
      repository: target.repository.name,
    });
  });

  /** The project's slug: from the project list, else from the scope when it is that project. */
  private projectSlug(projectId: string | undefined): string | undefined {
    const listed = projectId
      ? this.projects?.projects()?.find((project) => project.id === projectId)?.slug
      : undefined;
    if (listed) return listed;
    const scoped = this.scope?.scope();
    const scopedId = this.scope?.projectId();
    if (scoped?.project && (!projectId || !scopedId || scopedId === projectId)) {
      return scoped.project;
    }
    return undefined;
  }
}

function muted(text: string): View {
  return { kind: 'muted', text };
}

function excerpt(
  content: string,
  file: string,
  sha7: string,
  lineStart: number,
  lineEnd: number,
): View {
  const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
  // A file that ends in a newline has no line after it.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  if (lineStart < 1 || lineEnd < lineStart || lineEnd > lines.length) {
    return muted(
      `Lines ${lineStart}–${lineEnd} are outside ${file}, which has ${lines.length} lines at ${sha7}.`,
    );
  }
  const range = lines.slice(lineStart - 1, lineEnd);
  return {
    kind: 'excerpt',
    lines: range.slice(0, QITS_CODE_PREVIEW_MAX_LINES),
    firstLine: lineStart,
    more: Math.max(0, range.length - QITS_CODE_PREVIEW_MAX_LINES),
  };
}

/**
 * The `code-preview` insight: the failing test's code under the title "Test code", for any
 * classified failure whose coordinates locate it — a file and both ends of a line range.
 */
export const QitsCodePreviewInsight: QitsFailureInsightProvider = {
  id: 'code-preview',
  title: 'Test code',
  appliesTo: (_kind: QitsFailureKind, failure: QitsTestFailure) => {
    const coordinates = failure?.coordinates;
    return (
      !!coordinates?.file &&
      typeof coordinates.lineStart === 'number' &&
      typeof coordinates.lineEnd === 'number'
    );
  },
  component: QitsCodePreview,
};
