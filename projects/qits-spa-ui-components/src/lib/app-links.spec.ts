import { provideLocationMocks } from '@angular/common/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { QitsAppLinks, QITS_BROWSER_ORIGIN } from './app-links';
import {
  provideQitsNavigationTree,
  QITS_NAVIGATION,
  toNavTree,
  type QitsNavEntry,
  type QitsNavigation,
  type QitsNavTree,
} from './navigation';

describe('QitsAppLinks', () => {
  @Component({ template: '' })
  class Blank {}

  const NAVIGATION = {
    environment: 'dev',
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
          position: 1,
        },
        // Not flipped yet: no host of its own, and the environment origin instead.
        {
          app: 'qits-artifacts',
          label: 'Artifacts',
          host: null,
          path: '/artifacts',
          origin: 'https://dev.example.com',
          position: 3,
        },
        // A subpathed entry: it opens a view of the projects app, not its root.
        {
          app: 'qits-projects',
          label: 'Api Docs',
          host: 'projects',
          path: '/projects',
          origin: 'https://projects.dev.example.com',
          position: 6,
          subpath: 'api-docs',
        },
      ],
    },
    applications: {
      'qits-ci': { apiDocs: '/ci/q/swagger-ui' },
      'qits-artifacts': { apiDocs: '/artifacts/q/swagger-ui' },
    },
  };

  function links(browserOrigin = 'https://ci.dev.example.com'): QitsAppLinks {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        provideLocationMocks(),
        provideQitsNavigationTree(NAVIGATION),
        { provide: QITS_BROWSER_ORIGIN, useValue: browserOrigin },
      ],
    });
    return TestBed.inject(QitsAppLinks);
  }

  /** An entry as the platform served it — read back from the same source the sidebar reads. */
  function entry(appLinks: QitsAppLinks, app: string): QitsNavEntry {
    const found = appLinks.entries('services.details').find((row) => row.app === app);
    if (!found) throw new Error(`no entry for ${app}`);
    return found;
  }

  it('gives an application its own origin, and nothing for one without a host', () => {
    const appLinks = links();
    expect(appLinks.origin('qits-ci')).toBe('https://ci.dev.example.com');
    expect(appLinks.origin('qits-artifacts')).toBeUndefined();
    expect(appLinks.origin('qits-nothing')).toBeUndefined();
    expect(appLinks.environmentOrigin()).toBe('https://dev.example.com');
  });

  it('reads a slot in the order the platform sorted it', () => {
    const appLinks = links();
    expect(appLinks.entries('services.details').map((row) => row.label)).toEqual([
      'Docs',
      'CI',
      'Artifacts',
      'Api Docs',
    ]);
    expect(appLinks.entries('platform')).toEqual([]);
  });

  it('builds a link out of the origin, the scope and the path', () => {
    const appLinks = links();
    expect(
      appLinks.href('qits-ci', '', {
        project: 'qits',
        category: 'services',
        repository: 'qits-ci',
      }),
    ).toBe('https://ci.dev.example.com/qits/services/qits-ci/');
    expect(appLinks.href('qits-ci', 'runs/7', { project: 'qits' })).toBe(
      'https://ci.dev.example.com/qits/runs/7',
    );
    expect(appLinks.href('qits-ci', '')).toBe('https://ci.dev.example.com/');
  });

  /**
   * An application the platform does not serve on a host of its own is still at its old segment
   * under the environment origin — and has no scoped address, so the scope is dropped rather than
   * spelled into a URL that would 404.
   */
  it('reaches an application with no host at its own segment, unscoped', () => {
    const appLinks = links();
    // The scope is dropped rather than spelled: an unflipped application has no scoped address.
    expect(appLinks.href('qits-artifacts', 'images', { project: 'qits' })).toBe(
      'https://dev.example.com/artifacts/images',
    );
    expect(appLinks.href('qits-artifacts', '')).toBe('https://dev.example.com/artifacts/');
  });

  it('prefers the platform’s own segment to a caller’s, and needs one of the two', () => {
    const appLinks = links();
    // A caller's fallback is frozen at release time; the entry is what the platform says today.
    expect(appLinks.href('qits-artifacts', '', {}, '/old-artifacts/')).toBe(
      'https://dev.example.com/artifacts/',
    );
    // An application the platform names nowhere: the caller's segment is all there is.
    expect(appLinks.href('qits-nothing', 'x', {}, '/nothing/')).toBe(
      'https://dev.example.com/nothing/x',
    );
    expect(appLinks.href('qits-nothing', '')).toBeUndefined();
  });

  it('is current on its own host, inside the scope on screen', async () => {
    const appLinks = links('https://ci.dev.example.com');
    await TestBed.inject(Router).navigateByUrl('/qits/services/qits-ci/runs/7');

    expect(
      appLinks.isCurrent(entry(appLinks, 'qits-ci'), {
        project: 'qits',
        category: 'services',
        repository: 'qits-ci',
      }),
    ).toBe(true);
    // Same host, another repository: the path says the reader is not there.
    expect(
      appLinks.isCurrent(entry(appLinks, 'qits-ci'), {
        project: 'qits',
        category: 'libs',
        repository: 'qits-eventstream',
      }),
    ).toBe(false);
  });

  /**
   * The scope ROOT is the page the application's own sidebar row opens, and the router serializes
   * it without a trailing slash — `/qits/services/qits-ci`, one character short of the scope path.
   * Current all the same: this was the defect that left the docs sub-menu detached at the bottom
   * of the sidebar exactly on the page its own row navigates to.
   */
  it('is current on its own scope root, with and without the trailing slash', async () => {
    const appLinks = links('https://ci.dev.example.com');
    await TestBed.inject(Router).navigateByUrl('/qits/services/qits-ci');

    expect(
      appLinks.isCurrent(entry(appLinks, 'qits-ci'), {
        project: 'qits',
        category: 'services',
        repository: 'qits-ci',
      }),
    ).toBe(true);
    // A sibling repository whose name extends this one is still another place.
    expect(
      appLinks.isCurrent(entry(appLinks, 'qits-ci'), {
        project: 'qits',
        category: 'services',
        repository: 'qits',
      }),
    ).toBe(false);
  });

  it('is not current on somebody else’s host, whatever the path says', async () => {
    const appLinks = links('https://docs.dev.example.com');
    await TestBed.inject(Router).navigateByUrl('/qits/services/qits-ci/');

    expect(
      appLinks.isCurrent(entry(appLinks, 'qits-ci'), {
        project: 'qits',
        category: 'services',
        repository: 'qits-ci',
      }),
    ).toBe(false);
    expect(
      appLinks.isCurrent(entry(appLinks, 'qits-docs'), {
        project: 'qits',
        category: 'services',
        repository: 'qits-ci',
      }),
    ).toBe(true);
  });

  /** An application with no host is asked the same question in its own terms: origin, then segment. */
  it('marks an application without a host current under its segment on the environment origin', async () => {
    const appLinks = links('https://dev.example.com');
    await TestBed.inject(Router).navigateByUrl('/artifacts/images');

    expect(appLinks.isCurrent(entry(appLinks, 'qits-artifacts'), {})).toBe(true);
    // The scope plays no part: such an application has no scoped address to be inside.
    expect(
      appLinks.isCurrent(entry(appLinks, 'qits-artifacts'), {
        project: 'qits',
        category: 'services',
        repository: 'qits-ci',
      }),
    ).toBe(true);
  });

  it('is not current elsewhere on the environment origin', async () => {
    const appLinks = links('https://dev.example.com');
    await TestBed.inject(Router).navigateByUrl('/ci/runs/7');
    expect(appLinks.isCurrent(entry(appLinks, 'qits-artifacts'), {})).toBe(false);
  });

  it('is not current on another host, whatever the path is', async () => {
    const appLinks = links('https://ci.dev.example.com');
    await TestBed.inject(Router).navigateByUrl('/artifacts/images');
    expect(appLinks.isCurrent(entry(appLinks, 'qits-artifacts'), {})).toBe(false);
  });

  it('spells an api-docs url on the application host, and nothing where none was published', () => {
    const appLinks = links();
    // The path is one of the application's own routes, so its own host serves it.
    expect(appLinks.apiDocsUrl('qits-ci')).toBe('https://ci.dev.example.com/ci/q/swagger-ui');
    expect(appLinks.apiDocsUrl('qits-docs')).toBeUndefined();
    expect(appLinks.apiDocsUrl('qits-nothing')).toBeUndefined();
  });

  it('falls back to the environment origin for an application with no host', () => {
    // No host of its own: an older platform serves it under the door, at its own segment.
    expect(links().apiDocsUrl('qits-artifacts')).toBe(
      'https://dev.example.com/artifacts/q/swagger-ui',
    );
  });

  it('marks a subpathed entry current only inside its view', async () => {
    const appLinks = links('https://projects.dev.example.com');
    const scope = { project: 'qits', category: 'services', repository: 'qits-ci' } as const;
    const apiDocs = entry(appLinks, 'qits-projects');
    expect(apiDocs.subpath).toBe('api-docs');

    await TestBed.inject(Router).navigateByUrl('/qits/services/qits-ci/api-docs');
    expect(appLinks.isCurrent(apiDocs, scope)).toBe(true);

    await TestBed.inject(Router).navigateByUrl('/qits/services/qits-ci/');
    expect(appLinks.isCurrent(apiDocs, scope)).toBe(false);
  });

  it('prefers the platform-declared origin, so an application with no entry has one', () => {
    TestBed.configureTestingModule({
      providers: [
        provideQitsNavigationTree({
          ...NAVIGATION,
          applications: {
            ...NAVIGATION.applications,
            'qits-stt': { apiDocs: '/stt/q/swagger-ui', origin: 'https://stt.dev.example.com/' },
          },
        }),
      ],
    });
    const appLinks = TestBed.inject(QitsAppLinks);
    expect(appLinks.origin('qits-stt')).toBe('https://stt.dev.example.com');
    // No longer the environment origin: the declared one wins.
    expect(appLinks.apiDocsUrl('qits-stt')).toBe('https://stt.dev.example.com/stt/q/swagger-ui');
  });
});

describe('QitsAppLinks api origins', () => {
  const ANSWER: QitsNavigation = {
    slots: {},
    applications: {
      'qits-projects': { origin: 'https://projects.qits.example' },
      'qits-ci': { apiDocs: '/ci/q/swagger-ui' },
    },
  };

  /** A navigation that has not answered yet, and the hand that answers it. */
  function pending(): { appLinks: QitsAppLinks; answer: (tree: QitsNavTree) => void } {
    const tree = signal<QitsNavTree | undefined>(undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: QITS_NAVIGATION, useValue: { tree, failed: signal(false) } }],
    });
    return { appLinks: TestBed.inject(QitsAppLinks), answer: (value) => tree.set(value) };
  }

  it('reads an application origin the navigation declared, absolute', () => {
    TestBed.configureTestingModule({ providers: [provideQitsNavigationTree(ANSWER)] });
    const appLinks = TestBed.inject(QitsAppLinks);
    expect(appLinks.apiOrigin('qits-projects')).toBe('https://projects.qits.example');
    expect(appLinks.apiUrl('qits-projects', '/projects/api/projects')).toBe(
      'https://projects.qits.example/projects/api/projects',
    );
  });

  it('answers the same-origin empty string where the navigation named no origin', () => {
    TestBed.configureTestingModule({ providers: [provideQitsNavigationTree(ANSWER)] });
    const appLinks = TestBed.inject(QitsAppLinks);
    expect(appLinks.apiOrigin('qits-ci')).toBe('');
    expect(appLinks.apiOrigin('qits-nothing')).toBe('');
    expect(appLinks.apiUrl('qits-ci', '/ci/api/runs/active')).toBe('/ci/api/runs/active');
  });

  it('answers the empty string where no navigation is provided at all', () => {
    const appLinks = TestBed.inject(QitsAppLinks);
    expect(appLinks.apiOrigin('qits-projects')).toBe('');
  });

  it('says undefined until the navigation answers, and the origin after', () => {
    const { appLinks, answer } = pending();
    expect(appLinks.apiOrigin('qits-projects')).toBeUndefined();
    expect(appLinks.apiUrl('qits-projects', '/projects/api/projects')).toBeUndefined();

    answer(toNavTree(ANSWER));
    expect(appLinks.apiOrigin('qits-projects')).toBe('https://projects.qits.example');
  });

  it('waits for the navigation before resolving, rather than resolving at the empty string', async () => {
    const { appLinks, answer } = pending();
    let resolved: string | undefined;
    void appLinks.whenApiUrl('qits-projects', '/projects/api/projects').then((url) => {
      resolved = url;
    });
    TestBed.tick();
    await Promise.resolve();
    expect(resolved).toBeUndefined();

    answer(toNavTree(ANSWER));
    TestBed.tick();
    await Promise.resolve();
    expect(resolved).toBe('https://projects.qits.example/projects/api/projects');
  });

  it('resolves at once when the navigation has already answered', async () => {
    TestBed.configureTestingModule({ providers: [provideQitsNavigationTree(ANSWER)] });
    await expect(TestBed.inject(QitsAppLinks).whenApiOrigin('qits-projects')).resolves.toBe(
      'https://projects.qits.example',
    );
  });

  it('resolves with the empty string once a navigation that names nothing answers', async () => {
    const { appLinks, answer } = pending();
    const origin = appLinks.whenApiOrigin('qits-ci');
    answer(toNavTree(undefined));
    TestBed.tick();
    await expect(origin).resolves.toBe('');
  });
});
