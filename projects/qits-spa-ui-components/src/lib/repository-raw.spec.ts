import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { QITS_NAVIGATION, toNavTree, type QitsNavTree } from './navigation';
import { QITS_REPOSITORY_RAW_CACHE_SIZE, QitsRepositoryRawClient } from './repository-raw';

const GITHOST = 'https://githost.qits.example';
const ORIGINS = { slots: {}, applications: { 'qits-githost': { origin: GITHOST } } };
const REPO = '488363a1-6ba0-4101-948a-14a8bfcb9e79';
const RAW = `${GITHOST}/githost/api/repositories/${REPO}/raw`;

describe('QitsRepositoryRawClient', () => {
  let tree: ReturnType<typeof signal<QitsNavTree | undefined>>;

  function setup(answered = true): {
    client: QitsRepositoryRawClient;
    http: HttpTestingController;
  } {
    tree = signal<QitsNavTree | undefined>(answered ? toNavTree(ORIGINS) : undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QITS_NAVIGATION, useValue: { tree, failed: signal(false) } },
      ],
    });
    return {
      client: TestBed.inject(QitsRepositoryRawClient),
      http: TestBed.inject(HttpTestingController),
    };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads qits-githost’s raw door on its own origin, as a blob, with the session, path encoded', async () => {
    const { client, http } = setup();
    const read = client.raw(REPO, 'abc123', 'src/a b/x&y+z.png');
    const request = http.expectOne((r) => r.url === RAW);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.responseType).toBe('blob');
    expect(request.request.params.get('rev')).toBe('abc123');
    expect(request.request.params.get('path')).toBe('src/a b/x&y+z.png');
    expect(request.request.urlWithParams).toBe(`${RAW}?rev=abc123&path=src/a%20b/x%26y%2Bz.png`);
    const bytes = new Blob(['png']);
    request.flush(bytes);
    expect(await read).toBe(bytes);
  });

  it('asks nothing until the navigation says where qits-githost is', () => {
    const { client, http } = setup(false);
    void client.raw(REPO, 'abc123', 'a.png');
    http.expectNone(() => true);
    tree.set(toNavTree(ORIGINS));
    TestBed.tick();
    http.expectOne((r) => r.url === RAW).flush(new Blob(['png']));
  });

  it('answers a second read of the same file from memory, and retries one that failed', async () => {
    const { client, http } = setup();
    const first = client.raw(REPO, 'abc123', 'a.png');
    http.expectOne((r) => r.url === RAW).flush(new Blob(['png']));
    await first;
    expect(client.raw(REPO, 'abc123', 'a.png')).toBe(first);
    http.expectNone(() => true);

    const failed = client.raw(REPO, 'abc123', 'b.png');
    http
      .expectOne((r) => r.params.get('path') === 'b.png')
      .flush(new Blob(['gone']), { status: 404, statusText: 'Not Found' });
    await expect(failed).rejects.toBeTruthy();
    void client.raw(REPO, 'abc123', 'b.png');
    http.expectOne((r) => r.params.get('path') === 'b.png').flush(new Blob(['png']));
  });

  it(`keeps at most ${QITS_REPOSITORY_RAW_CACHE_SIZE} answers, dropping the least recently used`, () => {
    const { client, http } = setup();
    for (let i = 0; i <= QITS_REPOSITORY_RAW_CACHE_SIZE; i++) {
      void client.raw(REPO, 'abc123', `${i}.png`);
      http.expectOne((r) => r.params.get('path') === `${i}.png`).flush(new Blob(['png']));
    }
    void client.raw(REPO, 'abc123', `${QITS_REPOSITORY_RAW_CACHE_SIZE}.png`);
    http.expectNone(() => true);
    void client.raw(REPO, 'abc123', '0.png');
    http.expectOne((r) => r.params.get('path') === '0.png').flush(new Blob(['png']));
  });
});
