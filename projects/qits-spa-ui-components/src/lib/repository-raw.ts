import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, Injector, PendingTasks } from '@angular/core';

import { afterApiOrigin, QitsAppLinks } from './app-links';
import { QITS_GITHOST_REPOSITORIES_PATH } from './failures/source-files';

/** How many answers {@link QitsRepositoryRawClient} keeps; the least recently used goes first. */
export const QITS_REPOSITORY_RAW_CACHE_SIZE = 40;

/**
 * One file's raw bytes at one revision, read from qits-githost's browser plane —
 * `GET /githost/api/repositories/{repositoryId}/raw?rev=&path=` (qits-762), the door that answers
 * bytes to a browser where `/file` answers JSON and `/git/…/blob` refuses a session.
 *
 * The read goes to **qits-githost's own origin** — `QitsAppLinks.apiOrigin('qits-githost')` — and
 * waits for the navigation to state it, the way `provideQitsBuilds` waits for qits-ci's; nothing
 * here composes a hostname. It carries the session with `withCredentials: true`.
 *
 * It keeps the last {@link QITS_REPOSITORY_RAW_CACHE_SIZE} answers in memory, keyed by repository,
 * revision and path, so re-opening a screenshot costs nothing: at a commit sha the answer can never
 * change. A read that failed is not kept, so the next one tries again.
 *
 * Root-provided and replaceable: a story or a spec stands in for the whole read with
 * `{ provide: QitsRepositoryRawClient, useValue: fake }`.
 */
@Injectable({ providedIn: 'root' })
export class QitsRepositoryRawClient {
  private readonly http = inject(HttpClient);
  private readonly links = inject(QitsAppLinks);
  private readonly injector = inject(Injector);
  private readonly pending = inject(PendingTasks);
  /** Insertion order is recency: a hit moves its key to the end, an overflow drops the first. */
  private readonly cache = new Map<string, Promise<Blob>>();

  /** The file's bytes at `rev`; rejects on any failed read. */
  raw(repositoryId: string, rev: string, path: string): Promise<Blob> {
    const key = JSON.stringify([repositoryId, rev, path]);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const read = this.fetch(repositoryId, rev, path);
    read.catch(() => {
      if (this.cache.get(key) === read) this.cache.delete(key);
    });
    this.cache.set(key, read);
    while (this.cache.size > QITS_REPOSITORY_RAW_CACHE_SIZE) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    return read;
  }

  private fetch(repositoryId: string, rev: string, path: string): Promise<Blob> {
    const done = this.pending.add();
    return new Promise<Blob>((resolve, reject) => {
      afterApiOrigin(this.links, 'qits-githost', this.injector, () => {
        const url = `${QITS_GITHOST_REPOSITORIES_PATH}/${encodeURIComponent(repositoryId)}/raw`;
        this.http
          .get(this.links.apiUrl('qits-githost', url) ?? url, {
            params: new HttpParams().set('rev', rev).set('path', path),
            responseType: 'blob',
            withCredentials: true,
          })
          .subscribe({ next: resolve, error: reject });
      });
    }).finally(done);
  }
}
