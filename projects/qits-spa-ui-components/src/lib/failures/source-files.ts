import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, Injector, PendingTasks } from '@angular/core';

import { afterApiOrigin, QitsAppLinks } from '../app-links';

/** The git host's answer to one file read (`FileResponse`). */
export interface QitsSourceFileResponse {
  readonly path: string;
  /** True for a binary blob and for one past the host's 2 MiB content cap alike. */
  readonly binary: boolean;
  /** The blob's real size in bytes, always. */
  readonly size: number;
  /** Absent where `binary` is true. */
  readonly content?: string | null;
}

/**
 * What became of one file read. Every outcome is an answer a page can draw; none is thrown.
 *
 * - `file` — the text;
 * - `no-such-repository`, `no-such-rev`, `no-such-path` — the git host's own 404s, which name the
 *   thing that is absent;
 * - `binary` — not text; `too-large` — over {@link QITS_SOURCE_FILE_MAX_BYTES};
 * - `failed` — anything else: the host down, a 5xx, a 403.
 */
export type QitsSourceFile =
  | { readonly kind: 'file'; readonly content: string }
  | { readonly kind: 'no-such-repository' | 'no-such-rev' | 'no-such-path' | 'failed' }
  | { readonly kind: 'binary' | 'too-large'; readonly size: number };

/** Past this size the git host sends no content, and the preview says the file is too large. */
export const QITS_SOURCE_FILE_MAX_BYTES = 2 * 1024 * 1024;

/** Where qits-githost answers a repository's content reads, on its own origin. */
export const QITS_GITHOST_REPOSITORIES_PATH = '/githost/api/repositories';

const NOT_FOUND = new Set(['no-such-repository', 'no-such-rev', 'no-such-path']);

/**
 * Files at a commit, read from qits-githost and **kept**: one read per (repository, commit, path)
 * for the life of the application. A commit's file never changes, so reopening a failure, or a
 * second failure in the same file, costs nothing. A read that failed is not kept, so the next open
 * tries again.
 *
 * The read goes to **qits-githost's own origin** — `QitsAppLinks.apiOrigin('qits-githost')` — and
 * waits for the navigation to state it, the way `provideQitsBuilds` waits for qits-ci's; nothing
 * here composes a hostname. It carries the session with `withCredentials: true`.
 *
 * Root-provided and replaceable: a story or a spec stands in for the whole read with
 * `{ provide: QitsSourceFiles, useValue: fake }`.
 */
@Injectable({ providedIn: 'root' })
export class QitsSourceFiles {
  private readonly http = inject(HttpClient);
  private readonly links = inject(QitsAppLinks);
  private readonly injector = inject(Injector);
  private readonly pending = inject(PendingTasks);
  private readonly cache = new Map<string, Promise<QitsSourceFile>>();

  /** `GET /githost/api/repositories/{repositoryId}/file?rev={sha}&path={path}`, at most once. */
  read(repositoryId: string, sha: string, path: string): Promise<QitsSourceFile> {
    const key = JSON.stringify([repositoryId, sha, path]);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const read = this.fetch(repositoryId, sha, path).then((file) => {
      if (file.kind === 'failed') this.cache.delete(key);
      return file;
    });
    this.cache.set(key, read);
    return read;
  }

  private fetch(repositoryId: string, sha: string, path: string): Promise<QitsSourceFile> {
    const done = this.pending.add();
    return new Promise<QitsSourceFile>((resolve) => {
      afterApiOrigin(this.links, 'qits-githost', this.injector, () => {
        const url = `${QITS_GITHOST_REPOSITORIES_PATH}/${encodeURIComponent(repositoryId)}/file`;
        this.http
          .get<QitsSourceFileResponse>(this.links.apiUrl('qits-githost', url) ?? url, {
            params: { rev: sha, path },
            withCredentials: true,
          })
          .subscribe({
            next: (body) => resolve(toSourceFile(body)),
            error: (error: unknown) => resolve(fromError(error)),
          });
      });
    }).finally(done);
  }
}

function toSourceFile(body: QitsSourceFileResponse | null): QitsSourceFile {
  if (!body || typeof body !== 'object') return { kind: 'failed' };
  const size = typeof body.size === 'number' ? body.size : 0;
  if (size > QITS_SOURCE_FILE_MAX_BYTES) return { kind: 'too-large', size };
  if (body.binary) return { kind: 'binary', size };
  if (typeof body.content !== 'string') return { kind: 'failed' };
  return { kind: 'file', content: body.content };
}

function fromError(error: unknown): QitsSourceFile {
  if (error instanceof HttpErrorResponse && error.status === 404) {
    const name = (error.error as { error?: unknown } | null)?.error;
    if (typeof name === 'string' && NOT_FOUND.has(name)) {
      return { kind: name as 'no-such-repository' | 'no-such-rev' | 'no-such-path' };
    }
  }
  return { kind: 'failed' };
}
