import { provideLocationMocks } from '@angular/common/testing';
import {
  Component,
  signal,
  viewChild,
  type EnvironmentProviders,
  type Provider,
  type TemplateRef,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { QITS_BROWSER_ORIGIN } from './app-links';
import { QITS_BUILDS, type QitsBuild, type QitsBuildsSource } from './builds';
import { QitsMainLayout } from './main-layout';
import { QitsNavSubmenuSlot } from './nav-submenu';
import {
  provideQitsNavigationLinks,
  provideQitsNavigationTree,
  QITS_NAVIGATION,
  type QitsNavigation,
  type QitsNavLink,
} from './navigation';
import { provideQitsProjectList, QITS_PROJECTS, type QitsProject } from './projects';
import { provideQitsRepositoryList, QITS_REPOSITORIES, type QitsRepository } from './repositories';
import { provideQitsScope, QITS_SCOPE, type QitsRouting, type QitsScope } from './scope';

describe('QitsMainLayout', () => {
  const PLATFORM: readonly QitsNavLink[] = [
    { label: 'Home', href: '/' },
    { label: 'CI', href: '/ci/' },
    { label: 'Docs', href: '/platform-docs/' },
  ];

  /**
   * The layout hosts a `<router-outlet />`, so it needs a router even with nothing to route to.
   * The literal source stands in for the edge: nothing is fetched, so there is no request to
   * flush before an assertion and no pending task to wait on.
   */
  function render(links: readonly QitsNavLink[] = PLATFORM): ComponentFixture<QitsMainLayout> {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideQitsNavigationLinks(links)],
    });
    const fixture = TestBed.createComponent(QitsMainLayout);
    fixture.detectChanges();
    return fixture;
  }

  function burger(fixture: ComponentFixture<unknown>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.qits-layout-burger') as HTMLButtonElement;
  }

  /**
   * The navigation entries, and only those — anchored at the list so an anchor a sub-menu fixture
   * puts inside the same `<li>` can never be counted as a platform link.
   */
  function links(fixture: ComponentFixture<unknown>): HTMLAnchorElement[] {
    return [
      ...fixture.nativeElement.querySelectorAll('.qits-layout-links > li > .qits-layout-link'),
    ] as HTMLAnchorElement[];
  }

  function labels(fixture: ComponentFixture<unknown>): (string | undefined)[] {
    return links(fixture).map((a) => a.textContent?.trim());
  }

  function headings(fixture: ComponentFixture<unknown>): (string | undefined)[] {
    return [...fixture.nativeElement.querySelectorAll('.qits-layout-heading')].map((p) =>
      (p as HTMLElement).textContent?.trim(),
    );
  }

  function current(fixture: ComponentFixture<unknown>): (string | undefined)[] {
    return links(fixture)
      .filter((a) => a.getAttribute('aria-current') === 'page')
      .map((a) => a.textContent?.trim());
  }

  describe('the flat shape an edge without slots answers', () => {
    it('renders what the navigation source gives it, as plain hrefs', () => {
      const anchors = links(render());
      expect(anchors.map((a) => a.textContent?.trim())).toEqual(['Home', 'CI', 'Docs']);
      expect(anchors.map((a) => a.getAttribute('href'))).toEqual(PLATFORM.map((link) => link.href));
      // routerLink would compile and go nowhere: these destinations are other applications.
      expect(anchors.some((a) => a.hasAttribute('ng-reflect-router-link'))).toBe(false);
    });

    it('marks the link matching the document base as the current page, and only that one', () => {
      const fixture = render();
      // jsdom serves the specs from the site root, so Home is the app we are in.
      expect(current(fixture)).toEqual(['Home']);
      expect(links(fixture)[0].classList).toContain('qits-layout-link-current');
      expect(links(fixture)[1].getAttribute('aria-current')).toBeNull();
    });

    it('lets a non-empty [links] beat the source outright', () => {
      const fixture = render();
      fixture.componentRef.setInput('links', [{ label: 'Docs', href: '/docs/' }]);
      fixture.detectChanges();
      expect(labels(fixture)).toEqual(['Docs']);

      // Empty is the default, not an override: the source comes back rather than the nav emptying.
      fixture.componentRef.setInput('links', []);
      fixture.detectChanges();
      expect(labels(fixture)).toEqual(['Home', 'CI', 'Docs']);
    });
  });

  it('brands the bar, defaulting to qits, and names the nav after it', () => {
    const fixture = render();
    const brand = fixture.nativeElement.querySelector('.qits-layout-brand') as HTMLElement;
    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(brand.textContent).toBe('qits');
    expect(nav.getAttribute('aria-label')).toBe('qits navigation');

    fixture.componentRef.setInput('brand', 'qits ci');
    fixture.detectChanges();
    expect(brand.textContent).toBe('qits ci');
    expect(nav.getAttribute('aria-label')).toBe('qits ci navigation');
  });

  it('renders nothing and says it is busy until the source answers', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: QITS_NAVIGATION, useValue: { tree: signal(undefined), failed: signal(false) } },
      ],
    });
    const fixture = TestBed.createComponent(QitsMainLayout);
    fixture.detectChanges();

    expect(links(fixture)).toEqual([]);
    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-busy')).toBe('true');
    // Waiting is not stranded: no escape link, because one may still be on its way.
    expect(fixture.nativeElement.querySelector('.qits-layout-escape')).toBeNull();
  });

  it('offers one way out when the answer is empty, and no compiled-in list', () => {
    const fixture = render([]);
    const escape = fixture.nativeElement.querySelector('.qits-layout-escape') as HTMLAnchorElement;

    expect(links(fixture)).toEqual([]);
    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-busy')).toBeNull();
    expect(fixture.nativeElement.querySelector('.qits-layout-stranded')?.textContent).toBe(
      'Navigation unavailable',
    );
    // `/` is the platform's own root, not a registry entry, so this fallback cannot go stale.
    expect(escape.getAttribute('href')).toBe('/');
  });

  it('strands an app that never provided a source, rather than failing to bootstrap', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(QitsMainLayout);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.qits-layout-escape')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-busy')).toBeNull();
  });

  it('starts closed, and the burger says so', () => {
    const fixture = render();
    expect(burger(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(burger(fixture).getAttribute('aria-label')).toBe('Toggle navigation');
    expect(burger(fixture).getAttribute('aria-controls')).toBe('qits-layout-nav');
    expect(fixture.nativeElement.querySelector('nav').id).toBe('qits-layout-nav');
    expect(fixture.nativeElement.querySelector('.qits-layout-nav-open')).toBeNull();
  });

  it('the burger toggles the nav both ways', () => {
    const fixture = render();
    burger(fixture).click();
    fixture.detectChanges();
    expect(burger(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.qits-layout-nav-open')).not.toBeNull();

    burger(fixture).click();
    fixture.detectChanges();
    expect(burger(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.qits-layout-nav-open')).toBeNull();
  });

  it('closes the nav when a link is followed', () => {
    const fixture = render();
    burger(fixture).click();
    fixture.detectChanges();

    // The component must *not* cancel the navigation — that is the whole point of these links — so
    // the spec cancels it one level up, after the handler has run and before jsdom complains.
    fixture.nativeElement.addEventListener('click', (event: Event) => event.preventDefault());
    links(fixture)[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(burger(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.qits-layout-nav-open')).toBeNull();
  });

  it('mounts the outlet the child routes render into', () => {
    const fixture = render();
    const content = fixture.nativeElement.querySelector('main.qits-layout-content') as HTMLElement;
    expect(content.querySelector('router-outlet')).not.toBeNull();
  });

  /**
   * The nested sidebar: what the platform serves, filed under what the address says is on screen.
   * Not "does the navigation work" — that is `toNavTree`'s and `QitsAppLinks`' own specs — but the
   * shape this layout builds out of the three reads.
   */
  describe('the scoped sidebar', () => {
    @Component({ template: '' })
    class Blank {}

    const PROJECTS_ORIGIN = 'https://projects.dev.example.com';
    const CI_ORIGIN = 'https://ci.dev.example.com';
    const ENVIRONMENT_ORIGIN = 'https://dev.example.com';

    const TREE: QitsNavigation = {
      environment: 'dev',
      origin: 'https://dev.example.com',
      slots: {
        system: [
          {
            app: 'qits-projects',
            label: 'Overview',
            host: 'projects',
            path: '/projects',
            origin: PROJECTS_ORIGIN,
            position: 1,
          },
          // Not flipped yet: no host of its own, so the environment origin and its own segment.
          {
            app: 'qits-platform-system',
            label: 'System',
            host: null,
            path: '/system',
            origin: ENVIRONMENT_ORIGIN,
            position: 4,
          },
        ],
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
        'project.detail': [
          {
            app: 'qits-workspaces',
            label: 'Workspaces',
            host: 'workspaces',
            path: '/workspaces',
            origin: 'https://workspaces.dev.example.com',
            position: 1,
          },
        ],
        'services.details': [
          { app: 'qits-ci', label: 'CI', host: 'ci', path: '/ci', origin: CI_ORIGIN, position: 2 },
          {
            app: 'qits-artifacts',
            label: 'Artifacts',
            host: null,
            path: '/artifacts',
            origin: ENVIRONMENT_ORIGIN,
            position: 3,
          },
          {
            app: 'qits-docs',
            label: 'Docs',
            host: 'docs',
            path: '/docs',
            origin: 'https://docs.dev.example.com',
            position: 1,
          },
          // A subpathed entry: it opens a view of the projects app under the scope, not its root.
          {
            app: 'qits-projects',
            label: 'Api Docs',
            host: 'projects',
            path: '/projects',
            origin: PROJECTS_ORIGIN,
            position: 6,
            subpath: 'api-docs',
          },
        ],
        'libs.details': [
          {
            app: 'qits-docs',
            label: 'Docs',
            host: 'docs',
            path: '/docs',
            origin: 'https://docs.dev.example.com',
            position: 1,
          },
        ],
      },
    };

    const PROJECTS: readonly QitsProject[] = [
      { id: 'p1', slug: 'qits', name: 'qits' },
      { id: 'p2', slug: 'payments', name: 'Payments' },
    ];

    /** Deliberately not in name order, and not in one case: the sidebar sorts, the API does not. */
    const REPOSITORIES: readonly QitsRepository[] = [
      { id: 'r2', name: 'qits-projects', category: 'services' },
      { id: 'r5', name: 'Qits-web', category: 'services' },
      { id: 'r1', name: 'qits-ci', category: 'services' },
      { id: 'r3', name: 'qits-eventstream', category: 'libs' },
      { id: 'r4', name: 'qits-qits', category: undefined },
    ];

    async function renderTree(options?: {
      readonly url?: string;
      readonly browserOrigin?: string;
      readonly routing?: QitsRouting;
      readonly repositories?: readonly QitsRepository[];
      readonly repositoriesFailed?: boolean;
      readonly pendingRepositories?: boolean;
    }): Promise<ComponentFixture<QitsMainLayout>> {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: '**', component: Blank }]),
          provideLocationMocks(),
          provideQitsNavigationTree(TREE),
          provideQitsProjectList(PROJECTS),
          options?.pendingRepositories
            ? {
                provide: QITS_REPOSITORIES,
                useValue: {
                  repositories: signal<readonly QitsRepository[] | undefined>(undefined),
                  wrapperRepositoryId: signal(undefined),
                  failed: signal(false),
                },
              }
            : provideQitsRepositoryList(options?.repositories ?? REPOSITORIES, 'r9', {
                failed: options?.repositoriesFailed,
              }),
          provideQitsScope(options?.routing ?? 'repository'),
          { provide: QITS_BROWSER_ORIGIN, useValue: options?.browserOrigin ?? PROJECTS_ORIGIN },
        ],
      });
      await TestBed.inject(Router).navigateByUrl(options?.url ?? '/');
      const fixture = TestBed.createComponent(QitsMainLayout);
      fixture.detectChanges();
      return fixture;
    }

    it('shows only the platform-wide group while no project is in scope', async () => {
      const fixture = await renderTree();
      // No project: no Project node, no repository groups, and PLATFORM is about a project.
      expect(headings(fixture)).toEqual(['SYSTEM']);
      expect(labels(fixture)).toEqual(['Overview', 'System']);
    });

    it('draws the project, its repositories by group, then the platform-wide groups', async () => {
      const fixture = await renderTree({ url: '/qits/' });

      expect(headings(fixture)).toEqual(['SERVICES', 'LIBS', 'PLATFORM', 'SYSTEM']);
      expect(labels(fixture)).toEqual([
        'Project',
        'Project setup',
        'Workspaces',
        'qits-ci',
        'qits-projects',
        'Qits-web',
        'qits-eventstream',
        'Events',
        'Overview',
        'System',
      ]);
      // A repository of an archetype this library does not group is left out rather than guessed at.
      expect(labels(fixture)).not.toContain('qits-qits');
    });

    /** A reader scans this list; the order an API answered in is not one they can predict. */
    it('lists the repositories of a group by name, whatever case they are in', async () => {
      const fixture = await renderTree({ url: '/qits/' });
      const names = labels(fixture).filter((label) => label?.toLowerCase().startsWith('qits-'));

      expect(names).toEqual(['qits-ci', 'qits-projects', 'Qits-web', 'qits-eventstream']);
    });

    it('addresses every row on the host that serves it', async () => {
      const fixture = await renderTree({ url: '/qits/' });
      const href = (label: string) =>
        links(fixture)
          .find((a) => a.textContent?.trim() === label)
          ?.getAttribute('href');

      expect(href('Project')).toBe(`${PROJECTS_ORIGIN}/qits/`);
      expect(href('Project setup')).toBe(`${PROJECTS_ORIGIN}/qits/project-setup`);
      expect(href('Workspaces')).toBe('https://workspaces.dev.example.com/qits/');
      expect(href('qits-ci')).toBe(`${PROJECTS_ORIGIN}/qits/services/qits-ci/`);
      expect(href('Events')).toBe('https://events.dev.example.com/qits/');
      // No host of its own: the environment origin, at the segment the platform says it answers on.
      expect(href('System')).toBe(`${ENVIRONMENT_ORIGIN}/system/`);
    });

    it('is the Project itself on the projects host, with no category in scope', async () => {
      const fixture = await renderTree({ url: '/qits/' });
      expect(current(fixture)).toEqual(['Project']);
    });

    it('opens the repository in scope, and only that one', async () => {
      const fixture = await renderTree({ url: '/qits/services/qits-ci/' });

      expect(labels(fixture)).toEqual([
        'Project',
        'Project setup',
        'Workspaces',
        'qits-ci',
        'Docs',
        'CI',
        'Artifacts',
        'Api Docs',
        'qits-projects',
        'Qits-web',
        'qits-eventstream',
        'Events',
        'Overview',
        'System',
      ]);
      // The open row's children are the entries of *its* category, in the platform's order.
      const children = links(fixture).filter((a) => a.classList.contains('qits-layout-link-child'));
      expect(children.map((a) => a.textContent?.trim())).toEqual([
        'Project setup',
        'Workspaces',
        'Docs',
        'CI',
        'Artifacts',
        'Api Docs',
      ]);
      expect(current(fixture)).toEqual(['qits-ci']);
    });

    it('addresses a subpathed entry at its view under the scope, and marks it the page there', async () => {
      const fixture = await renderTree({
        url: '/qits/services/qits-ci/api-docs',
        browserOrigin: PROJECTS_ORIGIN,
      });

      // The subpath rides after the scope: the entry opens a view of its app for this repository.
      expect(
        links(fixture)
          .find((a) => a.textContent?.trim() === 'Api Docs')
          ?.getAttribute('href'),
      ).toBe(`${PROJECTS_ORIGIN}/qits/services/qits-ci/api-docs`);
      expect(current(fixture)).toEqual(['Api Docs']);
    });

    it('marks the entry whose host the reader is on, inside the repository in scope', async () => {
      const fixture = await renderTree({
        url: '/qits/services/qits-ci/runs/7',
        browserOrigin: CI_ORIGIN,
      });

      // On the ci host the repository row is a link away, and the CI entry is the page.
      expect(current(fixture)).toEqual(['CI']);
      expect(
        links(fixture)
          .find((a) => a.textContent?.trim() === 'CI')
          ?.getAttribute('href'),
      ).toBe(`${CI_ORIGIN}/qits/services/qits-ci/`);
    });

    /** An application the platform has not flipped yet is drawn all the same, at its own segment. */
    it('marks an unflipped application current on the environment origin, under its segment', async () => {
      const fixture = await renderTree({ url: '/system/nodes', browserOrigin: ENVIRONMENT_ORIGIN });

      expect(
        links(fixture)
          .find((a) => a.textContent?.trim() === 'System')
          ?.getAttribute('href'),
      ).toBe(`${ENVIRONMENT_ORIGIN}/system/`);
      expect(current(fixture)).toEqual(['System']);
    });

    /**
     * Under a repository the same application has nothing scoped to point at, so the row goes to
     * its front page — and says nothing about the repository on screen, which it cannot show.
     */
    it('links an unflipped application unscoped under a repository, and never as the page', async () => {
      const fixture = await renderTree({
        url: '/qits/services/qits-ci/',
        browserOrigin: ENVIRONMENT_ORIGIN,
      });
      const artifacts = links(fixture).find((a) => a.textContent?.trim() === 'Artifacts');

      expect(artifacts?.getAttribute('href')).toBe(`${ENVIRONMENT_ORIGIN}/artifacts/`);
      expect(artifacts?.getAttribute('aria-current')).toBeNull();
    });

    /**
     * The heart of the reorganisation: a repository draws under its component, and the archetype
     * categories are what is left for the rows the platform has not given one.
     */
    describe('grouped by component', () => {
      /** A half-migrated platform: two components, and two repositories still only archetyped. */
      const MIXED: readonly QitsRepository[] = [
        { id: 'r1', name: 'qits-ci-service', component: 'qits-ci', category: 'services' },
        { id: 'r2', name: 'qits-ci-daemon', component: 'qits-ci', category: 'daemons' },
        {
          id: 'r3',
          name: 'qits-artifacts-service',
          component: 'qits-artifacts',
          category: 'services',
        },
        { id: 'r4', name: 'qits-eventstream', category: 'libs' },
        { id: 'r5', name: 'qits-spa-home', category: 'frontends' },
      ];

      it('draws the components first, in name order, then what is left of the categories', async () => {
        const fixture = await renderTree({ url: '/qits/', repositories: MIXED });

        expect(headings(fixture)).toEqual([
          'qits-artifacts',
          'qits-ci',
          'LIBS',
          'FRONTENDS',
          'PLATFORM',
          'SYSTEM',
        ]);
        expect(labels(fixture)).toEqual([
          'Project',
          'Project setup',
          'Workspaces',
          'qits-artifacts-service',
          // Both repositories of the component sit together, whatever their archetypes are.
          'qits-ci-daemon',
          'qits-ci-service',
          'qits-eventstream',
          'qits-spa-home',
          'Events',
          'Overview',
          'System',
        ]);
      });

      it('draws no category group at all once every repository has a component', async () => {
        const fixture = await renderTree({
          url: '/qits/',
          repositories: MIXED.filter((repository) => repository.component),
        });
        expect(headings(fixture)).toEqual(['qits-artifacts', 'qits-ci', 'PLATFORM', 'SYSTEM']);
      });

      it('addresses a repository by its component, and one without by its category', async () => {
        const fixture = await renderTree({ url: '/qits/', repositories: MIXED });
        const href = (label: string) =>
          links(fixture)
            .find((a) => a.textContent?.trim() === label)
            ?.getAttribute('href');

        expect(href('qits-ci-service')).toBe(`${PROJECTS_ORIGIN}/qits/qits-ci/qits-ci-service/`);
        expect(href('qits-eventstream')).toBe(`${PROJECTS_ORIGIN}/qits/libs/qits-eventstream/`);
      });

      it('opens a component address, with the children of the repository’s own archetype', async () => {
        const fixture = await renderTree({
          url: '/qits/qits-ci/qits-ci-service/',
          repositories: MIXED,
        });

        expect(current(fixture)).toEqual(['qits-ci-service']);
        // `services.details`, because that is what the repository IS — the slot vocabulary is about
        // kinds of repository, and the component it belongs to says nothing about that.
        const children = links(fixture).filter((a) =>
          a.classList.contains('qits-layout-link-child'),
        );
        expect(children.map((a) => a.textContent?.trim())).toEqual([
          'Project setup',
          'Workspaces',
          'Docs',
          'CI',
          'Artifacts',
          'Api Docs',
        ]);
      });

      /** A link made before the wrapper moved still resolves, and opens the row where it now sits. */
      it('opens the same repository from its archetype address', async () => {
        const fixture = await renderTree({
          url: '/qits/services/qits-ci-service/',
          repositories: MIXED,
        });

        expect(current(fixture)).toEqual(['qits-ci-service']);
        // Under the `qits-ci` heading all the same: where a row is drawn is the platform's answer,
        // not the address's.
        expect(headings(fixture)).toContain('qits-ci');
      });

      /** A component is enough to place a row; only a row with neither fact is left out. */
      it('draws a repository whose archetype it does not know, once it has a component', async () => {
        const fixture = await renderTree({
          url: '/qits/qits-ci/qits-ci-oci/',
          repositories: [
            { id: 'r1', name: 'qits-ci-oci', component: 'qits-ci', category: undefined },
            { id: 'r2', name: 'qits-qits', category: undefined },
          ],
        });

        expect(labels(fixture)).toContain('qits-ci-oci');
        expect(labels(fixture)).not.toContain('qits-qits');
        // No archetype, so no slot to hang children off — the row is the whole of it.
        expect(current(fixture)).toEqual(['qits-ci-oci']);
        expect(
          links(fixture).filter((a) => a.classList.contains('qits-layout-link-child')),
        ).toEqual(
          links(fixture).filter((a) =>
            ['Project setup', 'Workspaces'].includes(a.textContent?.trim() ?? ''),
          ),
        );
      });
    });

    it('says the repositories are still coming, rather than drawing no groups', async () => {
      const fixture = await renderTree({ url: '/qits/', pendingRepositories: true });
      expect(fixture.nativeElement.querySelector('.qits-layout-note')?.textContent).toContain(
        'Loading repositories',
      );
      expect(headings(fixture)).toEqual(['PLATFORM', 'SYSTEM']);
    });

    it('says the repository read failed, out loud', async () => {
      const fixture = await renderTree({
        url: '/qits/',
        repositories: [],
        repositoriesFailed: true,
      });
      const alert = fixture.nativeElement.querySelector('.qits-layout-alert') as HTMLElement;
      expect(alert.getAttribute('role')).toBe('alert');
      expect(alert.textContent).toContain('Could not load repositories');
    });

    /** PLATFORM is a group *about a project*, so it has nothing to say while none is open. */
    it('hides the project-scoped group where no project is in scope', async () => {
      expect(headings(await renderTree({ url: '/' }))).not.toContain('PLATFORM');
    });

    it('shows the project-scoped group once a project is', async () => {
      expect(headings(await renderTree({ url: '/qits/' }))).toContain('PLATFORM');
    });

    it('hangs the sub-menu under the row that is the page', async () => {
      const fixture = await renderTree({
        url: '/qits/services/qits-ci/runs/7',
        browserOrigin: CI_ORIGIN,
      });
      const templates = TestBed.createComponent(Templates);
      templates.detectChanges();
      TestBed.inject(QitsNavSubmenuSlot).register(templates.componentInstance.first());
      fixture.detectChanges();

      const items = [...fixture.nativeElement.querySelectorAll('.qits-layout-links > li')];
      const owner = items.find((li) => (li as HTMLElement).querySelector('.qits-layout-submenu'));
      expect((owner as HTMLElement).querySelector('.qits-layout-link')?.textContent?.trim()).toBe(
        'CI',
      );
      expect(fixture.nativeElement.querySelector('.qits-layout-submenu-detached')).toBeNull();
    });

    it('detaches the sub-menu where no row is the page', async () => {
      // A host that serves none of these applications: a bare `ng serve`, or one not flipped yet.
      const fixture = await renderTree({
        url: '/qits/services/qits-ci/',
        browserOrigin: 'https://nowhere.example.com',
      });
      const templates = TestBed.createComponent(Templates);
      templates.detectChanges();
      TestBed.inject(QitsNavSubmenuSlot).register(templates.componentInstance.first());
      fixture.detectChanges();

      expect(current(fixture)).toEqual([]);
      expect(fixture.nativeElement.querySelector('.qits-layout-submenu-detached')).not.toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.qits-layout-submenu')).toHaveLength(1);
    });

    /**
     * One application, two rows, one slot: qits-workspaces hangs both `Workspaces` and `Editor`
     * under the Project node, and the two differ only by the subpath the second one opens. The
     * platform keys an entry by slot and label, so this is a shape the edge now serves — and the
     * application alone can no longer name a row, nor a prefix match alone name the page.
     */
    describe('two entries of one application in one slot', () => {
      const WORKSPACES_ORIGIN = 'https://workspaces.dev.example.com';

      const TWO_ROWS: QitsNavigation = {
        ...TREE,
        slots: {
          ...TREE.slots,
          'project.detail': [
            {
              app: 'qits-workspaces',
              label: 'Workspaces',
              host: 'workspaces',
              path: '/workspaces',
              origin: WORKSPACES_ORIGIN,
              position: 1,
            },
            {
              app: 'qits-workspaces',
              label: 'Editor',
              host: 'workspaces',
              path: '/workspaces',
              origin: WORKSPACES_ORIGIN,
              position: 2,
              subpath: 'editor',
            },
          ],
        },
      };

      /** The reader is on the workspaces host, which is the one that serves both rows. */
      async function renderBoth(
        url: string,
        browserOrigin = WORKSPACES_ORIGIN,
      ): Promise<ComponentFixture<QitsMainLayout>> {
        TestBed.configureTestingModule({
          providers: [
            provideRouter([{ path: '**', component: Blank }]),
            provideLocationMocks(),
            provideQitsNavigationTree(TWO_ROWS),
            provideQitsProjectList(PROJECTS),
            provideQitsRepositoryList(REPOSITORIES, 'r9'),
            provideQitsScope('repository'),
            { provide: QITS_BROWSER_ORIGIN, useValue: browserOrigin },
          ],
        });
        await TestBed.inject(Router).navigateByUrl(url);
        const fixture = TestBed.createComponent(QitsMainLayout);
        fixture.detectChanges();
        return fixture;
      }

      function rows(fixture: ComponentFixture<unknown>): HTMLAnchorElement[] {
        return links(fixture).filter((a) =>
          ['Workspaces', 'Editor'].includes(a.textContent?.trim() ?? ''),
        );
      }

      it('draws both rows, in position order, each at its own address', async () => {
        const both = rows(await renderBoth('/qits/'));

        expect(both.map((a) => a.textContent?.trim())).toEqual(['Workspaces', 'Editor']);
        // The subpath is what the two hrefs differ by; without it they would be one destination.
        expect(both.map((a) => a.getAttribute('href'))).toEqual([
          `${WORKSPACES_ORIGIN}/qits/`,
          `${WORKSPACES_ORIGIN}/qits/editor`,
        ]);
      });

      /**
       * Two rows keyed by the application alone are one key to `@for … track`, and Angular says so
       * with NG0955 — on the *reconcile*, which is why this navigates rather than only rendering.
       * A duplicated key is not a cosmetic warning: it is what lets the list attribute one row's
       * DOM to the other across a re-render.
       */
      it('gives each row a key of its own, so neither is tracked as the other', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
          const fixture = await renderBoth('/qits/');
          await TestBed.inject(Router).navigateByUrl('/qits/editor');
          fixture.detectChanges();

          expect(rows(fixture).map((a) => a.textContent?.trim())).toEqual(['Workspaces', 'Editor']);
          expect(rows(fixture).map((a) => a.getAttribute('href'))).toEqual([
            `${WORKSPACES_ORIGIN}/qits/`,
            `${WORKSPACES_ORIGIN}/qits/editor`,
          ]);
          expect(warn.mock.calls.flat().join(' ')).not.toContain('NG0955');
        } finally {
          warn.mockRestore();
        }
      });

      it('gives the page to the subpathed row, not to its subpath-less sibling', async () => {
        // `isCurrent` is a prefix test, so `Workspaces` matches here too — the deeper view wins.
        expect(current(await renderBoth('/qits/editor'))).toEqual(['Editor']);
      });

      it('leaves the subpath-less row the page on its own view', async () => {
        expect(current(await renderBoth('/qits/'))).toEqual(['Workspaces']);
      });

      it('hangs the sub-menu exactly once, under the row that is the page', async () => {
        const fixture = await renderBoth('/qits/editor');
        const templates = TestBed.createComponent(Templates);
        templates.detectChanges();
        TestBed.inject(QitsNavSubmenuSlot).register(templates.componentInstance.first());
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelectorAll('.qits-layout-submenu')).toHaveLength(1);
        const items = [...fixture.nativeElement.querySelectorAll('.qits-layout-links > li')];
        const owner = items.find((li) => (li as HTMLElement).querySelector('.qits-layout-submenu'));
        expect((owner as HTMLElement).querySelector('.qits-layout-link')?.textContent?.trim()).toBe(
          'Editor',
        );
        expect(fixture.nativeElement.querySelector('.qits-layout-submenu-detached')).toBeNull();
      });
    });
  });

  /** Two templates, so the stack can be exercised without a second component. */
  @Component({
    template: `
      <ng-template #first><a class="spec-submenu-link" href="/ci/guide/">First</a></ng-template>
      <ng-template #second><span class="spec-second">Second</span></ng-template>
    `,
  })
  class Templates {
    readonly first = viewChild.required<TemplateRef<unknown>>('first');
    readonly second = viewChild.required<TemplateRef<unknown>>('second');
  }

  describe('the sub-menu slot', () => {
    function templates(): Templates {
      const fixture = TestBed.createComponent(Templates);
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    function submenu(fixture: ComponentFixture<unknown>, selector = '.qits-layout-submenu') {
      return fixture.nativeElement.querySelector(selector) as HTMLElement | null;
    }

    it('renders under the entry that is this application', () => {
      const fixture = render();
      TestBed.inject(QitsNavSubmenuSlot).register(templates().first());
      fixture.detectChanges();

      const items = [...fixture.nativeElement.querySelectorAll('.qits-layout-links > li')];
      expect(items[0].querySelector('.qits-layout-submenu')).not.toBeNull();
      expect(items[1].querySelector('.qits-layout-submenu')).toBeNull();
      expect(submenu(fixture, '.qits-layout-submenu-detached')).toBeNull();
      // The helper must not mistake a sub-menu anchor for a platform link.
      expect(links(fixture)).toHaveLength(3);
    });

    it('falls to the foot of the nav when no entry is this application', () => {
      // Nothing here matches jsdom's `/` base, which is also a bare `ng serve` or an app the
      // platform does not serve yet.
      const fixture = render([{ label: 'CI', href: '/ci/' }]);
      TestBed.inject(QitsNavSubmenuSlot).register(templates().first());
      fixture.detectChanges();

      expect(submenu(fixture, '.qits-layout-submenu-detached')).not.toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.qits-layout-submenu')).toHaveLength(1);
    });

    it('closes the mobile panel for a sub-menu link, but not for a click beside one', () => {
      const fixture = render();
      TestBed.inject(QitsNavSubmenuSlot).register(templates().first());
      fixture.detectChanges();

      burger(fixture).click();
      fixture.detectChanges();
      submenu(fixture)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      // A tree expands on clicks that are not links; collapsing the panel there would be hostile.
      expect(burger(fixture).getAttribute('aria-expanded')).toBe('true');

      fixture.nativeElement.addEventListener('click', (event: Event) => event.preventDefault());
      fixture.nativeElement
        .querySelector('.spec-submenu-link')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(burger(fixture).getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps the newest template when an older one is released', () => {
      const fixture = render();
      const slot = TestBed.inject(QitsNavSubmenuSlot);
      const both = templates();

      slot.register(both.first());
      slot.register(both.second());
      fixture.detectChanges();
      expect(submenu(fixture)?.textContent?.trim()).toBe('Second');

      // The order a router tears pages down in: the outgoing page goes *after* the incoming one
      // arrived. Releasing by identity is what stops it taking the live template with it.
      slot.release(both.first());
      fixture.detectChanges();
      expect(submenu(fixture)?.textContent?.trim()).toBe('Second');
    });
  });

  /**
   * The top-left slot. Not "does the picker work" — that is `QitsPicker`'s own spec — but the three
   * things this layout decides: *whether* the slot is a picker at all, that what it shows comes from
   * the scope rather than from anything held here, and that a pick is handed straight back to it.
   */
  describe('the project slot', () => {
    /** Somewhere for the router to land, so a URL can be asserted without a real page. */
    @Component({ template: '' })
    class Blank {}

    const PROJECTS: readonly QitsProject[] = [
      { id: 'p1', slug: 'one', name: 'One' },
      { id: 'p2', slug: 'two', name: 'Two' },
    ];

    function renderProjects(
      projects: readonly QitsProject[] = PROJECTS,
      options?: { readonly failed?: boolean },
    ): ComponentFixture<QitsMainLayout> {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: '**', component: Blank }]),
          provideLocationMocks(),
          provideQitsNavigationLinks(PLATFORM),
          provideQitsProjectList(projects, options),
          provideQitsScope('project'),
        ],
      });
      const fixture = TestBed.createComponent(QitsMainLayout);
      fixture.detectChanges();
      return fixture;
    }

    /** `select` navigates without handing the promise back, so the navigation is drained here. */
    async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
      for (let round = 0; round < 4; round += 1) {
        await Promise.resolve();
        await fixture.whenStable();
      }
      fixture.detectChanges();
    }

    function optionRows(fixture: ComponentFixture<unknown>): HTMLElement[] {
      return [...fixture.nativeElement.querySelectorAll('.qits-picker-option')] as HTMLElement[];
    }

    function pill(fixture: ComponentFixture<unknown>): string | null {
      return fixture.nativeElement.querySelector('.qits-picker-value')?.textContent?.trim() ?? null;
    }

    it('keeps the wordmark for an application that provides no projects', () => {
      const fixture = render();
      expect(fixture.nativeElement.querySelector('.qits-layout-brand')?.textContent).toBe('qits');
      expect(fixture.nativeElement.querySelector('qits-picker')).toBeNull();
    });

    it('replaces the wordmark with the picker once projects are provided', () => {
      const fixture = renderProjects();

      expect(fixture.nativeElement.querySelector('.qits-layout-brand')).toBeNull();
      expect(optionRows(fixture).map((row) => row.textContent?.trim())).toEqual(['One', 'Two']);
      // The nav is still named after the brand: the wordmark left the screen, not the app's name.
      expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe(
        'qits navigation',
      );
    });

    /**
     * A list with no scope is a control that can neither say what is open nor act on a pick. The
     * wordmark is a better thing to put in the most prominent place in the chrome than a dead one.
     */
    it('keeps the wordmark when there is a list but nothing to say which is current', () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideQitsNavigationLinks(PLATFORM),
          {
            provide: QITS_PROJECTS,
            useValue: { projects: signal(PROJECTS), failed: signal(false) },
          },
        ],
      });
      const fixture = TestBed.createComponent(QitsMainLayout);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.qits-layout-brand')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('qits-picker')).toBeNull();
    });

    it('says it is loading until the source answers, rather than showing an empty picker', () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideQitsNavigationLinks(PLATFORM),
          {
            provide: QITS_PROJECTS,
            useValue: {
              projects: signal<readonly QitsProject[] | undefined>(undefined),
              failed: signal(false),
            },
          },
          provideQitsScope('project'),
        ],
      });
      const fixture = TestBed.createComponent(QitsMainLayout);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.qits-layout-project-note')?.textContent,
      ).toContain('Loading projects');
      expect(fixture.nativeElement.querySelector('qits-picker')).toBeNull();
    });

    /** An empty list and a failed read are different facts, and a reader is told which one it is. */
    it('says the read failed, rather than drawing it as a platform with no projects', () => {
      const fixture = renderProjects([], { failed: true });

      const note = fixture.nativeElement.querySelector('.qits-layout-project-error') as HTMLElement;
      expect(note.textContent).toContain('Could not load projects');
      expect(note.getAttribute('role')).toBe('alert');
    });

    it('shows the project the address names, with nothing chosen by default', async () => {
      const fixture = renderProjects();
      expect(pill(fixture)).toBeNull();

      await TestBed.inject(Router).navigateByUrl('/two/');
      fixture.detectChanges();

      expect(pill(fixture)).toBe('Two');
    });

    /** A pick is a navigation: the project is the first segment, so picking one goes there. */
    it('hands a pick to the scope, which takes the reader to the project', async () => {
      const fixture = renderProjects();
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/runs/7');
      fixture.detectChanges();

      optionRows(fixture)[0].click();
      await settle(fixture);

      // No trailing slash: `/one/` would parse as a second, empty segment and match no `:project`.
      expect(router.url).toBe('/one');
      expect(pill(fixture)).toBe('One');
    });

    it('goes back to the root of this host when the pick is cleared', async () => {
      const fixture = renderProjects();
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/two/');
      fixture.detectChanges();

      fixture.nativeElement.querySelector('.qits-picker-clear').click();
      await settle(fixture);

      expect(router.url).toBe('/');
      expect(pill(fixture)).toBeNull();
    });

    /** No option, no label — so the choices come back rather than a pill the picker cannot draw. */
    it('shows the options again for an address naming a project the list does not contain', async () => {
      const fixture = renderProjects();

      await TestBed.inject(Router).navigateByUrl('/gone/services/qits-ci/');
      fixture.detectChanges();

      expect(pill(fixture)).toBeNull();
      expect(optionRows(fixture)).toHaveLength(2);
    });

    it('closes the mobile panel behind a pick, which is a navigation', async () => {
      const fixture = renderProjects();
      burger(fixture).click();
      fixture.detectChanges();

      optionRows(fixture)[1].click();
      await settle(fixture);

      expect(burger(fixture).getAttribute('aria-expanded')).toBe('false');
    });
  });

  /**
   * The pending-builds bolt. Not "does the source poll" — that is `provideQitsBuilds`' own spec —
   * but what the bar decides: whether the affordance is there at all, that opening it is what starts
   * the asking, that the two statuses are told apart by more than a colour, and that each of the
   * three answers a reader can get is drawn as itself.
   */
  describe('the pending builds bolt', () => {
    const RUNS: readonly QitsBuild[] = [
      {
        id: 'run-1',
        repoName: 'qits-ci-service',
        branch: 'main',
        status: 'RUNNING',
        configPath: '.config/qits/ci-post-receive.yml',
        commitSha: '18f7422',
      },
      {
        id: 'run-2',
        repoName: 'qits-eventstream-javalib',
        branch: 'feature/split',
        status: 'QUEUED',
        configPath: '.config/qits/ci-event-release.yml',
      },
    ];

    /** What the panel said it was watching, in the order it said it — the source's whole contract. */
    let watched: boolean[];

    /**
     * `runs` is passed through as given — `undefined` is the source's "nothing has answered yet"
     * and a meaningful argument here, so it deliberately has no default to fall back to.
     */
    function renderBuilds(
      runs: readonly QitsBuild[] | undefined,
      options?: {
        readonly failed?: boolean;
        /** Overrides, last word wins — how a test says the platform *does* serve a ci host. */
        readonly providers?: readonly (Provider | EnvironmentProviders)[];
      },
    ): ComponentFixture<QitsMainLayout> {
      watched = [];
      const source: QitsBuildsSource = {
        runs: signal<readonly QitsBuild[] | undefined>(runs),
        failed: signal(options?.failed ?? false),
        watch: (watching: boolean) => watched.push(watching),
      };
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          // The flat shape names no ci host and carries no environment origin, so this is also the
          // platform on which a run has no address at all — the degraded case, by default.
          provideQitsNavigationLinks(PLATFORM),
          { provide: QITS_BUILDS, useValue: source },
          ...(options?.providers ?? []),
        ],
      });
      const fixture = TestBed.createComponent(QitsMainLayout);
      fixture.detectChanges();
      return fixture;
    }

    function bolt(fixture: ComponentFixture<unknown>): HTMLButtonElement {
      return fixture.nativeElement.querySelector('.qits-layout-builds-toggle') as HTMLButtonElement;
    }

    function panel(fixture: ComponentFixture<unknown>): HTMLElement | null {
      return fixture.nativeElement.querySelector('.qits-layout-builds-panel') as HTMLElement | null;
    }

    function rows(fixture: ComponentFixture<unknown>): HTMLElement[] {
      return [...fixture.nativeElement.querySelectorAll('.qits-layout-build')] as HTMLElement[];
    }

    function open(fixture: ComponentFixture<unknown>): void {
      bolt(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
    }

    /** The glyph itself, which is what carries the colour — the button around it does not. */
    function glyph(fixture: ComponentFixture<unknown>): SVGElement {
      return fixture.nativeElement.querySelector('.qits-layout-bolt') as SVGElement;
    }

    /** The queue count at the bolt's corner, or `null` where there is nothing to count. */
    function badge(fixture: ComponentFixture<unknown>): HTMLElement | null {
      return fixture.nativeElement.querySelector('.qits-layout-builds-count') as HTMLElement | null;
    }

    /** A run, named only by what a test is about: its status. */
    function run(id: string, status: string): QitsBuild {
      return {
        id,
        repoName: 'qits-ci-service',
        branch: 'main',
        status,
        configPath: '.config/qits/ci-post-receive.yml',
      };
    }

    function label(fixture: ComponentFixture<unknown>): string | null {
      return bolt(fixture).getAttribute('aria-label');
    }

    /**
     * A second render inside one case. A `TestBed` may be configured once, and several of the cases
     * below are about telling two renders apart — so the module is torn down between them, which
     * leaves the elements already read from the first one perfectly readable.
     */
    function again(
      runs: readonly QitsBuild[] | undefined,
      options?: { readonly failed?: boolean },
    ): ComponentFixture<QitsMainLayout> {
      TestBed.resetTestingModule();
      return renderBuilds(runs, options);
    }

    it('is absent from an application that provides no builds source', () => {
      const fixture = render();
      expect(fixture.nativeElement.querySelector('.qits-layout-builds')).toBeNull();
    });

    it('starts closed, says so, and names itself for a reader who cannot see a bolt', () => {
      const fixture = renderBuilds(RUNS);
      expect(bolt(fixture).getAttribute('aria-label')).toBe('Pending builds: 1 running, 1 queued');
      expect(bolt(fixture).getAttribute('aria-expanded')).toBe('false');
      expect(bolt(fixture).getAttribute('aria-controls')).toBe('qits-layout-builds-panel');
      expect(panel(fixture)).toBeNull();
      // Closed is not merely empty: the panel's own cadence has not been asked for either.
      expect(watched).toEqual([]);
    });

    /**
     * The bolt is an affordance before it is a handle: shut, it is the only thing on the page that
     * says whether the platform is doing anything, so it has to say it in colour, in a number and
     * in words — and it has to say "I do not know" as distinctly as it says "nothing".
     */
    describe('what the shut bolt says', () => {
      it('goes yellow while anything is building, and stays grey while nothing is', () => {
        expect(glyph(again([run('a', 'RUNNING')])).classList).toContain('qits-layout-bolt-busy');
        expect(glyph(again([run('a', 'QUEUED')])).classList).toContain('qits-layout-bolt-busy');
        expect(glyph(again([])).classList).not.toContain('qits-layout-bolt-busy');
      });

      /** A dot reading zero is a fact nobody needs stated, in the loudest colour in the chrome. */
      it('draws no badge at all when nothing is waiting for a worker', () => {
        expect(badge(again([run('a', 'RUNNING')]))).toBeNull();
        expect(badge(again([]))).toBeNull();
      });

      /**
       * The queue is everything that has not started, counted as "not RUNNING" — the status is
       * carried through as qits-ci said it and never narrowed, so a word this library has not heard
       * of is still a build nobody is building yet.
       */
      it('counts every run that has not started, whatever qits-ci calls it', () => {
        const fixture = renderBuilds([
          run('a', 'RUNNING'),
          run('b', 'QUEUED'),
          run('c', 'PROVISIONING'),
        ]);
        expect(badge(fixture)?.textContent?.trim()).toBe('2');
        expect(label(fixture)).toBe('Pending builds: 1 running, 2 queued');
      });

      /** A wide badge would move the bolt and everything beside it in the bar. */
      it('caps a big queue rather than letting it resize the bolt', () => {
        const many = Array.from({ length: 12 }, (_, index) => run(`q${index}`, 'QUEUED'));
        expect(badge(again(many))?.textContent?.trim()).toBe('9+');
        expect(badge(again(many.slice(0, 9)))?.textContent?.trim()).toBe('9');
        // The exact figure is one click away; the label is where a reader who cannot see it gets it.
        expect(label(again(many))).toBe('Pending builds: 12 queued');
      });

      /**
       * A read that failed must not paint a confident grey bolt any more than a yellow one: a
       * grey-filled bolt means "we asked, and nothing is building", which is exactly what this
       * chrome is in no position to say.
       */
      it('hollows the bolt out when the read failed, and says so in words', () => {
        const fixture = renderBuilds([], { failed: true });
        expect(glyph(fixture).classList).toContain('qits-layout-bolt-unknown');
        expect(glyph(fixture).classList).not.toContain('qits-layout-bolt-busy');
        expect(badge(fixture)).toBeNull();
        expect(label(fixture)).toBe('Pending builds: unavailable');
      });

      /**
       * Neither the fill nor the badge is announced, so the label is the only channel there is —
       * and "checking" is not "idle", however alike the two look at rest.
       */
      it('states the state to a screen reader, in each of the four the bolt has', () => {
        expect(label(again(undefined))).toBe('Pending builds: checking');
        expect(label(again([]))).toBe('Pending builds: none');
        expect(label(again([run('a', 'RUNNING')]))).toBe('Pending builds: 1 running');
        expect(label(again([run('a', 'QUEUED')]))).toBe('Pending builds: 1 queued');
        expect(label(again([run('a', 'RUNNING'), run('b', 'RUNNING')]))).toBe(
          'Pending builds: 2 running',
        );
        // A zero side is left out rather than said as "0 queued": what is happening, not a table.
        expect(label(again([run('a', 'RUNNING'), run('b', 'QUEUED')]))).toBe(
          'Pending builds: 1 running, 1 queued',
        );
      });

      /** The first paint of every chrome, and the one state that is allowed to look like rest. */
      it('is quiet while nothing has answered yet', () => {
        const fixture = renderBuilds(undefined);
        expect(glyph(fixture).classList).not.toContain('qits-layout-bolt-busy');
        expect(glyph(fixture).classList).not.toContain('qits-layout-bolt-unknown');
        expect(badge(fixture)).toBeNull();
      });
    });

    it('toggles the panel both ways, and starts and stops the asking with it', () => {
      const fixture = renderBuilds(RUNS);

      open(fixture);
      expect(bolt(fixture).getAttribute('aria-expanded')).toBe('true');
      expect(panel(fixture)?.id).toBe('qits-layout-builds-panel');
      expect(watched).toEqual([true]);

      open(fixture);
      expect(bolt(fixture).getAttribute('aria-expanded')).toBe('false');
      expect(panel(fixture)).toBeNull();
      expect(watched).toEqual([true, false]);
    });

    it('lists a run by repository, branch, status and the pipeline file it runs', () => {
      const fixture = renderBuilds(RUNS);
      open(fixture);

      const first = rows(fixture)[0];
      expect(first.querySelector('.qits-layout-build-name')?.textContent?.trim()).toBe(
        'qits-ci-service',
      );
      expect(first.querySelector('.qits-layout-build-branch')?.textContent?.trim()).toBe('main');
      // The file, not the path: every run on this platform shares the directories in front of it.
      expect(first.querySelector('.qits-layout-build-config')?.textContent?.trim()).toBe(
        'ci-post-receive.yml',
      );
    });

    /** Colour alone would be the only thing telling the two apart, so the running row has a rail. */
    it('draws a run under way apart from one waiting for a worker', () => {
      const fixture = renderBuilds(RUNS);
      open(fixture);
      const [running, queued] = rows(fixture);

      expect(running.querySelector('.qits-badge')?.textContent?.trim()).toBe('RUNNING');
      expect(running.querySelector('.qits-badge-info')).not.toBeNull();
      expect(running.classList).toContain('qits-layout-build-running');

      expect(queued.querySelector('.qits-badge')?.textContent?.trim()).toBe('QUEUED');
      expect(queued.querySelector('.qits-badge-neutral')).not.toBeNull();
      expect(queued.classList).not.toContain('qits-layout-build-running');
    });

    it('says nothing is building rather than showing an empty box', () => {
      const fixture = renderBuilds([]);
      open(fixture);
      expect(rows(fixture)).toEqual([]);
      expect(panel(fixture)?.textContent?.trim()).toBe('Nothing building.');
    });

    it('says it is checking while nothing has answered yet', () => {
      const fixture = renderBuilds(undefined);
      open(fixture);
      expect(panel(fixture)?.textContent?.trim()).toBe('Checking…');
    });

    /**
     * A host where `/ci` is not routed at all is the ordinary case for this line, so it has to be
     * one quiet sentence inside the panel — the bar, the sidebar and the content are untouched.
     */
    it('says the read failed in one line, and breaks nothing around it', () => {
      const fixture = renderBuilds([], { failed: true });
      open(fixture);

      expect(panel(fixture)?.querySelector('.qits-layout-builds-error')?.textContent?.trim()).toBe(
        'Builds unavailable.',
      );
      expect(rows(fixture)).toEqual([]);
      expect(labels(fixture)).toEqual(['Home', 'CI', 'Docs']);
      expect(fixture.nativeElement.querySelector('main.qits-layout-content')).not.toBeNull();
    });

    it('closes on a click outside itself, and stays open for one inside', () => {
      const fixture = renderBuilds(RUNS);
      open(fixture);

      panel(fixture)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(panel(fixture)).not.toBeNull();

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(panel(fixture)).toBeNull();
      expect(bolt(fixture).getAttribute('aria-expanded')).toBe('false');
      expect(watched).toEqual([true, false]);
    });

    it('closes on Escape and hands the focus back to the bolt', () => {
      const fixture = renderBuilds(RUNS);
      open(fixture);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(panel(fixture)).toBeNull();
      expect(watched).toEqual([true, false]);
      expect(fixture.nativeElement.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).toBe(bolt(fixture));
    });

    /**
     * A glance that goes somewhere. The row is the way into the run, at the address the reader came
     * in through — and where the platform names no ci host it is the same four facts as text,
     * because a link to nowhere is worse than no link.
     */
    describe('the way into the run', () => {
      const CI_ORIGIN = 'https://ci.dev.example.com';

      /** The platform serving qits-ci on a host of its own, with a repository on screen. */
      function servingCi(scope: QitsScope): (Provider | EnvironmentProviders)[] {
        return [
          provideQitsNavigationTree({
            environment: 'dev',
            origin: 'https://dev.example.com',
            slots: {
              'services.details': [
                {
                  app: 'qits-ci',
                  label: 'CI',
                  host: 'ci',
                  path: '/ci',
                  origin: CI_ORIGIN,
                  position: 1,
                },
              ],
            },
          }),
          {
            provide: QITS_SCOPE,
            useValue: {
              scope: signal(scope),
              projectId: signal(undefined),
              repositoryId: signal(undefined),
              routing: 'repository' as const,
              select: () => undefined,
            },
          },
        ];
      }

      it('opens the run in qits-ci, at the address the reader came in through', () => {
        const fixture = renderBuilds(RUNS, {
          providers: servingCi({
            project: 'qits',
            group: 'qits-ci',
            repository: 'qits-ci-service',
          }),
        });
        open(fixture);

        const [first, second] = rows(fixture);
        expect(first.tagName).toBe('A');
        // A full-document href, never a routerLink: qits-ci is another application on its own host.
        expect(first.getAttribute('href')).toBe(
          `${CI_ORIGIN}/qits/qits-ci/qits-ci-service/runs/run-1`,
        );
        expect(second.getAttribute('href')).toBe(
          `${CI_ORIGIN}/qits/qits-ci/qits-ci-service/runs/run-2`,
        );
        expect(first.hasAttribute('ng-reflect-router-link')).toBe(false);
      });

      /** Out of a project's page there is no repository in the address, and the run still resolves. */
      it('spells the scope it has, however shallow the page is', () => {
        const fixture = renderBuilds(RUNS, { providers: servingCi({ project: 'qits' }) });
        open(fixture);
        expect(rows(fixture)[0].getAttribute('href')).toBe(`${CI_ORIGIN}/qits/runs/run-1`);
      });

      it('draws the row as the text it always was where the platform serves no ci', () => {
        const fixture = renderBuilds(RUNS);
        open(fixture);

        const first = rows(fixture)[0];
        expect(first.hasAttribute('href')).toBe(false);
        // Not a link, but not a row that lost anything either.
        expect(first.querySelector('.qits-layout-build-name')?.textContent?.trim()).toBe(
          'qits-ci-service',
        );
        expect(first.querySelector('.qits-badge')?.textContent?.trim()).toBe('RUNNING');
        expect(first.querySelector('.qits-layout-build-branch')?.textContent?.trim()).toBe('main');
        expect(first.querySelector('.qits-layout-build-config')?.textContent?.trim()).toBe(
          'ci-post-receive.yml',
        );
      });
    });

    /**
     * The expected shape of a run, and what it has actually taken. The clock is fixed here on
     * purpose: every number below is a subtraction the panel does locally, and a spec that let the
     * real clock move would be asserting the machine's speed rather than the arithmetic.
     */
    describe('the expected-duration bar', () => {
      /** Ten seconds then ninety — the example the bar is specified by. */
      const EXPECTED = [10_000, 90_000] as const;
      const NOW = Date.parse('2026-09-07T12:00:00.000Z');

      /** An ISO instant `seconds` before the fixed now. */
      function ago(seconds: number): string {
        return new Date(NOW - seconds * 1000).toISOString();
      }

      function predicted(run: Partial<QitsBuild> & { readonly status: string }): QitsBuild {
        return {
          id: 'run-1',
          repoName: 'qits-ci-service',
          branch: 'main',
          configPath: '.config/qits/ci-post-receive.yml',
          expectedStepDurationsMillis: [...EXPECTED],
          ...run,
        };
      }

      function bars(fixture: ComponentFixture<unknown>): HTMLElement[] {
        return [
          ...fixture.nativeElement.querySelectorAll('.qits-layout-build-duration'),
        ] as HTMLElement[];
      }

      function steps(fixture: ComponentFixture<unknown>): HTMLElement[] {
        return [
          ...fixture.nativeElement.querySelectorAll('.qits-layout-build-step'),
        ] as HTMLElement[];
      }

      /** A percentage off a style binding — absent reads as zero, which is what absent means here. */
      function percent(element: HTMLElement, property: 'width' | 'marginRight'): number {
        return parseFloat(element.style[property] || '0');
      }

      function fills(fixture: ComponentFixture<unknown>): number[] {
        return steps(fixture).map((step) =>
          percent(step.querySelector('.qits-layout-build-step-fill') as HTMLElement, 'width'),
        );
      }

      function elapsed(fixture: ComponentFixture<unknown>): (string | undefined)[] {
        return [...fixture.nativeElement.querySelectorAll('.qits-layout-build-elapsed')].map((n) =>
          (n as HTMLElement).textContent?.trim(),
        );
      }

      beforeEach(() => vi.useFakeTimers({ now: NOW }));
      afterEach(() => vi.useRealTimers());

      /** The old service, and every run of a pipeline nobody has measured yet. */
      it('draws no bar at all for a run qits-ci predicted nothing about', () => {
        const fixture = renderBuilds(RUNS);
        open(fixture);
        expect(bars(fixture)).toEqual([]);
        expect(elapsed(fixture)).toEqual([]);
      });

      /**
       * 10s and 90s of a 100s run are 9% + a 1% seam + 90%: the boundary is carved out of the step
       * BEFORE it, so the last step keeps its whole share and the track still adds to exactly 100.
       */
      it('divides the track per step, with a seam before each boundary', () => {
        const fixture = renderBuilds([predicted({ status: 'QUEUED', createdAt: ago(30) })]);
        open(fixture);

        const [short, long] = steps(fixture);
        expect(percent(short, 'width')).toBeCloseTo(9);
        expect(percent(short, 'marginRight')).toBeCloseTo(1);
        expect(percent(long, 'width')).toBeCloseTo(90);
        expect(percent(long, 'marginRight')).toBeCloseTo(0);
        expect(
          percent(short, 'width') +
            percent(short, 'marginRight') +
            percent(long, 'width') +
            percent(long, 'marginRight'),
        ).toBeCloseTo(100);
      });

      /** A step too short to give a whole seam away gives what it has, and never a negative width. */
      it('never draws a sliver of a step at a negative width', () => {
        const fixture = renderBuilds([
          predicted({
            status: 'QUEUED',
            createdAt: ago(1),
            expectedStepDurationsMillis: [200, 99_800],
          }),
        ]);
        open(fixture);

        const [sliver] = steps(fixture);
        expect(percent(sliver, 'width')).toBeGreaterThanOrEqual(0);
        expect(percent(sliver, 'width')).toBeCloseTo(0);
        expect(percent(sliver, 'marginRight')).toBeCloseTo(0.2);
      });

      it('shows a run waiting for a worker the shape of what it will do, empty', () => {
        const fixture = renderBuilds([predicted({ status: 'QUEUED', createdAt: ago(30) })]);
        open(fixture);
        expect(bars(fixture)).toHaveLength(1);
        expect(fills(fixture)).toEqual([0, 0]);
      });

      /** Fifty seconds into a hundred: the first step is done and the second is 40/90 through it. */
      it('fills left to right against the clock, step by step', () => {
        const fixture = renderBuilds([
          predicted({ status: 'RUNNING', createdAt: ago(60), startedAt: ago(50) }),
        ]);
        open(fixture);

        const [first, second] = fills(fixture);
        expect(first).toBeCloseTo(100);
        expect(second).toBeCloseTo((40 / 90) * 100);
      });

      /**
       * Past its prediction and still going. The bar stays full rather than overflowing — being
       * late is a fact about the run, not a reason to draw a wider track than there is.
       */
      it('keeps the bar full, in another tone, for a run that has outrun its prediction', () => {
        const fixture = renderBuilds([
          predicted({ status: 'RUNNING', createdAt: ago(160), startedAt: ago(150) }),
        ]);
        open(fixture);

        expect(fills(fixture)).toEqual([100, 100]);
        expect(steps(fixture).map((step) => percent(step, 'width'))).toEqual([9, 90]);
        expect(
          fixture.nativeElement.querySelectorAll('.qits-layout-build-step-overdue'),
        ).toHaveLength(2);
        expect(elapsed(fixture)).toEqual(['2m 30s']);
      });

      /**
       * A run under way is timed from when a worker took it; one still waiting from when it was
       * asked for — which is the only number that says anything about a queue.
       */
      it('times a run under way from its start and a queued one from its request', () => {
        const fixture = renderBuilds([
          predicted({ id: 'run-1', status: 'RUNNING', createdAt: ago(3600), startedAt: ago(41) }),
          predicted({ id: 'run-2', status: 'QUEUED', createdAt: ago(252) }),
          predicted({ id: 'run-3', status: 'QUEUED', createdAt: ago(3840) }),
        ]);
        open(fixture);
        // The same rendering qits-ci's own run page gives the same spans.
        expect(elapsed(fixture)).toEqual(['41s', '4m 12s', '1h 04m']);
      });

      /**
       * The number moves without anything being asked for. That is the whole reason it ticks
       * locally: `now - startedAt` is a subtraction, and polling qits-ci to learn it would turn a
       * panel somebody left open into traffic.
       */
      it('ticks the number every second while the panel is open, and stops when it closes', () => {
        const fixture = renderBuilds([
          predicted({ status: 'RUNNING', createdAt: ago(60), startedAt: ago(41) }),
        ]);
        const idle = vi.getTimerCount();

        open(fixture);
        expect(vi.getTimerCount()).toBe(idle + 1);
        expect(elapsed(fixture)).toEqual(['41s']);

        vi.advanceTimersByTime(1000);
        fixture.detectChanges();
        expect(elapsed(fixture)).toEqual(['42s']);
        // And the bar moved with it: one more second of the second step.
        expect(fills(fixture)[1]).toBeCloseTo((32 / 90) * 100);

        // Closed, nothing ticks — exactly as nothing is asked for.
        open(fixture);
        expect(vi.getTimerCount()).toBe(idle);
      });

      it('stops the clock when the chrome itself goes away', () => {
        const fixture = renderBuilds([
          predicted({ status: 'RUNNING', createdAt: ago(60), startedAt: ago(41) }),
        ]);
        const idle = vi.getTimerCount();
        open(fixture);
        expect(vi.getTimerCount()).toBe(idle + 1);

        fixture.destroy();
        expect(vi.getTimerCount()).toBe(idle);
      });
    });
  });
});
