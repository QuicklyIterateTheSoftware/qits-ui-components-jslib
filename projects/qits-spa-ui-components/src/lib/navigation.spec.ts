import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  EnvironmentInjector,
  createEnvironmentInjector,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideQitsNavigation,
  provideQitsNavigationLinks,
  provideQitsNavigationTree,
  QITS_NAVIGATION,
  QITS_NAVIGATION_URL,
  toNavTree,
  type QitsNavigation,
  type QitsNavigationSource,
} from './navigation';

describe('toNavTree', () => {
  it('flattens every slot, tags each entry with it, and sorts by position then label', () => {
    const tree = toNavTree({
      environment: 'dev',
      origin: 'https://dev.example.com',
      slots: {
        system: [
          {
            app: 'qits-platform-system',
            label: 'System',
            host: 'system',
            path: '/system',
            origin: 'https://system.dev.example.com',
            position: 4,
          },
          {
            app: 'qits-projects',
            label: 'Overview',
            host: 'projects',
            path: '/projects',
            origin: 'https://projects.dev.example.com',
            position: 1,
          },
        ],
        'services.details': [
          {
            app: 'qits-ci',
            label: 'CI',
            host: 'ci',
            path: '/ci',
            origin: 'https://ci.dev.example.com',
            position: 2,
          },
          {
            app: 'qits-docs',
            label: 'Docs',
            host: 'docs',
            path: '/docs',
            origin: 'https://docs.dev.example.com',
            position: 2,
          },
        ],
      },
    });

    expect(tree.environmentOrigin).toBe('https://dev.example.com');
    // Slots sort together: each group reads them back with `entries(slot)`, and one order is enough.
    expect(tree.entries.map((entry) => [entry.slot, entry.label, entry.position])).toEqual([
      ['system', 'Overview', 1],
      ['services.details', 'CI', 2],
      ['services.details', 'Docs', 2],
      ['system', 'System', 4],
    ]);
    // Slots served means the flat shape is gone, not empty: the sidebar draws the tree.
    expect(tree.legacy).toBeUndefined();
  });

  it('carries a host-less application as such: the environment origin, and its segment', () => {
    const tree = toNavTree({
      origin: 'https://dev.example.com',
      slots: {
        system: [
          {
            app: 'qits-ci',
            label: 'CI',
            host: null,
            path: '/ci',
            origin: 'https://dev.example.com',
            position: 2,
          },
        ],
      },
    });
    expect(tree.entries[0].host).toBeNull();
    expect(tree.entries[0].origin).toBe('https://dev.example.com');
    expect(tree.entries[0].path).toBe('/ci');
  });

  /**
   * The label is always spelled out here, which is the whole point of a second field: on the default
   * environment `origin` is the bare apex and this one still names the environment.
   */
  it('carries the project origin the edge serves, beside the environment origin', () => {
    const tree = toNavTree({
      origin: 'https://example.com',
      projectOrigin: 'https://prod.example.com',
      slots: { system: [{ app: 'a', label: 'A', origin: 'https://a.example.com', position: 1 }] },
    });
    expect(tree.environmentOrigin).toBe('https://example.com');
    expect(tree.projectOrigin).toBe('https://prod.example.com');

    // And beside the flat shape too, from an edge answering both halves mid-upgrade.
    const legacy = toNavTree({
      origin: 'https://example.com',
      projectOrigin: 'https://prod.example.com',
      links: [{ label: 'CI', href: '/ci/' }],
    });
    expect(legacy.projectOrigin).toBe('https://prod.example.com');
  });

  /** An edge that predates the field says nothing, and nothing is what the tree carries. */
  it('leaves the project origin undefined where the edge serves none', () => {
    const tree = toNavTree({
      origin: 'https://dev.example.com',
      slots: { system: [{ app: 'a', label: 'A', origin: 'https://a.example.com', position: 1 }] },
    });
    expect(tree.environmentOrigin).toBe('https://dev.example.com');
    expect(tree.projectOrigin).toBeUndefined();
    expect(toNavTree({ links: [{ label: 'CI', href: '/ci/' }] }).projectOrigin).toBeUndefined();
  });

  /** One spelling to join to, whatever the platform sent — and nothing invented where it sent none. */
  it('normalises the path prefix at both ends', () => {
    const tree = toNavTree({
      slots: {
        system: [
          { app: 'a', label: 'A', origin: 'https://a.example.com', position: 1, path: 'ci' },
          { app: 'b', label: 'B', origin: 'https://b.example.com', position: 2, path: '/ci/' },
          { app: 'c', label: 'C', origin: 'https://c.example.com', position: 3 },
        ],
      },
    });
    expect(tree.entries.map((entry) => entry.path)).toEqual(['/ci', '/ci', '']);
  });

  it('ignores a slot it does not know and an entry it could not draw', () => {
    const tree = toNavTree({
      slots: {
        system: [
          {
            app: 'qits-ci',
            label: '',
            host: 'ci',
            path: '/ci',
            origin: 'https://ci.dev.example.com',
            position: 1,
          },
          { app: 'qits-docs', label: 'Docs', host: 'docs', path: '/docs', origin: '', position: 1 },
        ],
        // A slot this release does not know: dropped, not drawn somewhere arbitrary.
        nowhere: [
          {
            app: 'qits-x',
            label: 'X',
            host: 'x',
            origin: 'https://x.dev.example.com',
            position: 1,
          },
        ],
      },
    } as QitsNavigation);
    expect(tree.entries).toEqual([]);
  });

  it('reads the flat shape as legacy, which is what an old edge answers', () => {
    const tree = toNavTree({ links: [{ label: 'CI', href: '/ci/' }] });
    expect(tree.entries).toEqual([]);
    expect(tree.legacy).toEqual([{ label: 'CI', href: '/ci/' }]);
  });

  it('reads no answer at all as the stranded legacy shape', () => {
    expect(toNavTree(undefined)).toEqual({
      entries: [],
      environmentOrigin: undefined,
      projectOrigin: undefined,
      apiDocs: {},
      legacy: [],
    });
  });

  it('normalises the subpath to no slash at either end, and its absence to the empty string', () => {
    const tree = toNavTree({
      slots: {
        'services.details': [
          {
            app: 'a',
            label: 'A',
            origin: 'https://a.example.com',
            position: 1,
            subpath: 'api-docs',
          },
          {
            app: 'b',
            label: 'B',
            origin: 'https://b.example.com',
            position: 2,
            subpath: '/api-docs/',
          },
          { app: 'c', label: 'C', origin: 'https://c.example.com', position: 3, subpath: null },
          { app: 'd', label: 'D', origin: 'https://d.example.com', position: 4 },
        ],
      },
    });
    expect(tree.entries.map((entry) => entry.subpath)).toEqual(['api-docs', 'api-docs', '', '']);
  });

  it('reads the applications object into api-docs paths, dropping what a page could not act on', () => {
    const tree = toNavTree({
      origin: 'https://dev.example.com',
      slots: {},
      applications: {
        'qits-ci': { apiDocs: '/ci/q/swagger-ui' },
        'qits-stt': { apiDocs: 'stt/q/swagger-ui' },
        'qits-docs': { apiDocs: null },
        'qits-githost': {},
        'qits-mirror': null,
      },
    });
    expect(tree.apiDocs).toEqual({
      'qits-ci': '/ci/q/swagger-ui',
      'qits-stt': '/stt/q/swagger-ui',
    });
    // Absence is a real answer — a service that documents no HTTP surface — not an empty string.
    expect('qits-docs' in tree.apiDocs).toBe(false);
  });

  it('serves the api-docs paths beside the legacy shape too, from an edge mid-upgrade', () => {
    const tree = toNavTree({
      links: [{ label: 'CI', href: '/ci/' }],
      applications: { 'qits-ci': { apiDocs: '/ci/q/swagger-ui' } },
    });
    expect(tree.legacy).toEqual([{ label: 'CI', href: '/ci/' }]);
    expect(tree.apiDocs).toEqual({ 'qits-ci': '/ci/q/swagger-ui' });
  });
});

describe('provideQitsNavigation', () => {
  function source(...providers: unknown[]): QitsNavigationSource {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...(providers as never[])],
    });
    return TestBed.inject(QITS_NAVIGATION);
  }

  function http(): HttpTestingController {
    return TestBed.inject(HttpTestingController);
  }

  it('asks the edge at an absolute path, not one relative to the SPA', () => {
    source(provideQitsNavigation());
    expect(QITS_NAVIGATION_URL).toBe('/main-navigation');
    http().expectOne(QITS_NAVIGATION_URL);
  });

  it('has no tree until the answer arrives, and then the normalised one', () => {
    const navigation = source(provideQitsNavigation());
    expect(navigation.tree()).toBeUndefined();
    expect(navigation.failed()).toBe(false);

    http()
      .expectOne(QITS_NAVIGATION_URL)
      .flush({
        origin: 'https://dev.example.com',
        slots: {
          system: [
            {
              app: 'qits-projects',
              label: 'Overview',
              host: 'projects',
              path: '/projects',
              origin: 'https://projects.dev.example.com',
              position: 1,
            },
          ],
        },
        // The flat list rides along for one release; slots being present is what retires it.
        links: [{ label: 'Home', href: '/' }],
      });

    expect(navigation.tree()?.entries.map((entry) => entry.label)).toEqual(['Overview']);
    expect(navigation.tree()?.legacy).toBeUndefined();
    expect(navigation.failed()).toBe(false);
  });

  it('asks once, not once per read', () => {
    const navigation = source(provideQitsNavigation());
    navigation.tree();
    navigation.tree();
    // One request for the life of the application: the chrome does not change under a reader.
    http().expectOne(QITS_NAVIGATION_URL);
    http().verify();
  });

  it('takes a url, for a fixture or a platform behind a proxy', () => {
    source(provideQitsNavigation({ url: '/elsewhere/main-navigation' }));
    http().expectOne('/elsewhere/main-navigation');
  });

  it('gives up empty rather than throwing: a failed navigation is not a failed app', () => {
    const navigation = source(provideQitsNavigation());
    http()
      .expectOne(QITS_NAVIGATION_URL)
      .error(new ProgressEvent('error'), { status: 502, statusText: 'Bad Gateway' });

    expect(navigation.tree()?.entries).toEqual([]);
    expect(navigation.tree()?.legacy).toEqual([]);
    expect(navigation.failed()).toBe(true);
  });

  it('unsubscribes when the injector that made it goes away', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const child = createEnvironmentInjector(
      [provideQitsNavigation()],
      TestBed.inject(EnvironmentInjector),
    );
    runInInjectionContext(child, () => inject(QITS_NAVIGATION));

    const request = http().expectOne(QITS_NAVIGATION_URL);
    expect(request.cancelled).toBe(false);
    child.destroy();
    expect(request.cancelled).toBe(true);
  });
});

describe('the literal sources', () => {
  it('answer a whole payload from the moment they exist, with nothing to flush', () => {
    // No HttpClient at all: the literal source is the reason a spec about the layout need not know
    // the navigation is fetched anywhere.
    TestBed.configureTestingModule({
      providers: [
        provideQitsNavigationTree({
          origin: 'https://dev.example.com',
          slots: {
            platform: [
              {
                app: 'qits-platform-events',
                label: 'Events',
                host: 'events',
                path: '/events',
                origin: 'https://events.dev.example.com',
                position: 1,
              },
            ],
          },
        }),
      ],
    });
    const navigation = TestBed.inject(QITS_NAVIGATION);

    expect(navigation.tree()?.entries.map((entry) => entry.slot)).toEqual(['platform']);
    expect(navigation.failed()).toBe(false);
  });

  it('answer the flat shape too, which is what a story of the old chrome needs', () => {
    TestBed.configureTestingModule({
      providers: [provideQitsNavigationLinks([{ label: 'Home', href: '/' }])],
    });
    expect(TestBed.inject(QITS_NAVIGATION).tree()?.legacy).toEqual([{ label: 'Home', href: '/' }]);
  });

  it('pass an empty list straight through, which is the stranded state', () => {
    TestBed.configureTestingModule({ providers: [provideQitsNavigationLinks([])] });
    expect(TestBed.inject(QITS_NAVIGATION).tree()?.legacy).toEqual([]);
  });
});
