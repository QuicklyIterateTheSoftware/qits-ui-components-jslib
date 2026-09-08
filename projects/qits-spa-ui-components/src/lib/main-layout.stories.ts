import { Component, signal, type Provider } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  applicationConfig,
  argsToTemplate,
  moduleMetadata,
  type Meta,
  type StoryObj,
} from '@storybook/angular-vite';

import { QITS_BROWSER_ORIGIN } from './app-links';
import { QitsBadge } from './badge';
import { provideQitsBuildList, QITS_BUILDS, type QitsBuild } from './builds';
import { QitsCard } from './card';
import { QitsMainLayout } from './main-layout';
import { QitsNavSubmenu } from './nav-submenu';
import {
  provideQitsNavigationLinks,
  provideQitsNavigationTree,
  QITS_NAVIGATION,
  type QitsNavigation,
  type QitsNavLink,
} from './navigation';
import { provideQitsProjectList, QITS_PROJECTS, type QitsProject } from './projects';
import { provideQitsRepositoryList, type QitsRepository } from './repositories';
import { QITS_SCOPE, type QitsScope } from './scope';

/** Stand-in for whatever an app routes into the layout. */
@Component({
  selector: 'qits-story-child',
  imports: [QitsBadge, QitsCard],
  template: `
    @for (run of runs; track run) {
      <qits-card heading="Latest run" [subheading]="run" elevated style="margin-bottom: 12px">
        <qits-badge label="SUCCESS" tone="success" />
      </qits-card>
    }
  `,
})
class Child {
  protected readonly runs = Array.from({ length: 12 }, (_, i) => `main @ commit ${12 - i}`);
}

const PROJECTS_ORIGIN = 'https://projects.dev.example.com';
const CI_ORIGIN = 'https://ci.dev.example.com';

/** What a running platform answers with: one entry per application, filed under a slot. */
const DEMO_NAVIGATION: QitsNavigation = {
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
      {
        app: 'qits-platform-mirror',
        label: 'Mirror',
        host: 'mirror',
        path: '/mirror',
        origin: 'https://mirror.dev.example.com',
        position: 2,
      },
      {
        app: 'qits-platform-system',
        label: 'System',
        host: 'system',
        path: '/system',
        origin: 'https://system.dev.example.com',
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
      {
        app: 'qits-platform-deployments',
        label: 'Deployments',
        host: 'deployments',
        path: '/platform-deployments',
        origin: 'https://deployments.dev.example.com',
        position: 4,
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
      {
        app: 'qits-docs',
        label: 'Docs',
        host: 'docs',
        path: '/docs',
        origin: 'https://docs.dev.example.com',
        position: 1,
      },
      { app: 'qits-ci', label: 'CI', host: 'ci', path: '/ci', origin: CI_ORIGIN, position: 2 },
      // Not flipped yet: no host of its own, so the environment origin and its own segment. Its
      // row is drawn all the same, and leads to its front page rather than to this repository.
      {
        app: 'qits-artifacts',
        label: 'Artifacts',
        host: null,
        path: '/artifacts',
        origin: 'https://dev.example.com',
        position: 3,
      },
      {
        app: 'qits-workspaces',
        label: 'Workspaces',
        host: 'workspaces',
        path: '/workspaces',
        origin: 'https://workspaces.dev.example.com',
        position: 5,
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
      { app: 'qits-ci', label: 'CI', host: 'ci', path: '/ci', origin: CI_ORIGIN, position: 2 },
    ],
  },
};

/** The flat shape an edge without slots answers — one release of overlap, and this is what it looks like. */
const DEMO_LINKS: readonly QitsNavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'CI', href: '/ci/' },
  { label: 'Deployments', href: '/platform-deployments/' },
  { label: 'Artifacts', href: '/artifacts/' },
  { label: 'Projects', href: '/projects/' },
];

const DEMO_PROJECTS: readonly QitsProject[] = [
  { id: 'p1', slug: 'qits', name: 'qits' },
  { id: 'p2', slug: 'payments', name: 'Payments' },
  { id: 'p3', slug: 'platform-infra', name: 'Platform infrastructure' },
];

/** A half-migrated platform: three repositories filed under a component, two only archetyped. */
const DEMO_REPOSITORIES: readonly QitsRepository[] = [
  { id: 'r1', name: 'qits-ci-service', component: 'qits-ci', category: 'services' },
  { id: 'r2', name: 'qits-ci-frontend', component: 'qits-ci', category: 'frontends' },
  { id: 'r3', name: 'qits-projects-service', component: 'qits-projects', category: 'services' },
  { id: 'r4', name: 'qits-workspaces', category: 'services' },
  { id: 'r5', name: 'qits-eventstream', category: 'libs' },
];

/** An instant `seconds` ago — so the workbench's runs are as old as the page is, not as old as it. */
function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

/**
 * What qits-ci has in hand: one build under way, two waiting for a worker.
 *
 * The first two carry `expectedStepDurationsMillis`, so the panel draws their expected shape — one
 * filling against it, one waiting with the shape still empty. The third carries none, which is what
 * a pipeline nobody has measured yet looks like, and it is drawn exactly as every row was before.
 */
const DEMO_BUILDS: readonly QitsBuild[] = [
  {
    id: 'run-1',
    repoName: 'qits-ci-service',
    branch: 'main',
    status: 'RUNNING',
    configPath: '.config/qits/ci-post-receive.yml',
    commitSha: '18f7422',
    createdAt: ago(96),
    startedAt: ago(88),
    // Checkout, build, test, publish: four steps of a Java service, as qits-ci has seen them.
    expectedStepDurationsMillis: [12_000, 95_000, 60_000, 25_000],
  },
  {
    id: 'run-2',
    repoName: 'qits-eventstream-javalib',
    branch: 'feature/bus-split',
    status: 'QUEUED',
    configPath: '.config/qits/ci-post-receive.yml',
    createdAt: ago(42),
    expectedStepDurationsMillis: [10_000, 90_000],
  },
  {
    id: 'run-3',
    repoName: 'qits-spa-ui-components',
    branch: 'main',
    status: 'QUEUED',
    configPath: '.config/qits/ci-event-release.yml',
    createdAt: ago(9),
  },
];

/**
 * The workbench is served from `/iframe.html`, so the address says nothing about a project. A
 * literal scope stands in for the one an application reads out of its own URL.
 */
function scopeAt(scope: QitsScope): Provider {
  return {
    provide: QITS_SCOPE,
    useValue: {
      scope: signal(scope),
      projectId: signal(scope.project ? 'p1' : undefined),
      repositoryId: signal(scope.repository ? 'r1' : undefined),
      routing: 'repository' as const,
      select: () => undefined,
    },
  };
}

// The layout hosts a `<router-outlet />`, which needs a router in scope, and it asks the platform
// what it contains. `applicationConfig` is where the angular-vite framework takes providers, and
// the literal sources stand in for the platform without a request being made.
//
// The breakpoint is CSS, so the way to see both shapes is the viewport toolbar, or simply a
// narrower browser window — there is no `mobile` input to flip.
const meta: Meta<QitsMainLayout> = {
  title: 'Layout/MainLayout',
  component: QitsMainLayout,
  tags: ['autodocs'],
  args: { brand: 'qits' },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        provideQitsNavigationTree(DEMO_NAVIGATION),
        provideQitsProjectList(DEMO_PROJECTS),
        provideQitsRepositoryList(DEMO_REPOSITORIES, 'r9'),
        scopeAt({}),
        { provide: QITS_BROWSER_ORIGIN, useValue: PROJECTS_ORIGIN },
      ],
    }),
  ],
  render: (args) => ({
    props: args,
    template: `<qits-main-layout ${argsToTemplate(args)} />`,
  }),
};

export default meta;
type Story = StoryObj<QitsMainLayout>;

/**
 * The builds popover is closed until someone opens it — that is the point of it — so the one story
 * about what is *inside* it opens it itself. Every other builds story is about the shut bolt, which
 * is what a reader actually spends their day looking at, and opening the panel there would hide the
 * state the story is documenting behind the answer to it. `canvasElement` is the story's own root,
 * which is what keeps this from finding the bolt of a neighbouring story in the docs page.
 */
async function openTheBolt({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> {
  canvasElement.querySelector<HTMLButtonElement>('.qits-layout-builds-toggle')?.click();
}

/** A queue nobody is working through yet, long enough for the badge to stop counting exactly. */
const QUEUED_BUILDS: readonly QitsBuild[] = Array.from({ length: 12 }, (_, index) => ({
  id: `queued-${index}`,
  repoName: 'qits-ci-service',
  branch: `ticket/waiting-${index}`,
  status: 'QUEUED',
  configPath: '.config/qits/ci-post-receive.yml',
  createdAt: ago(30 + index),
}));

/** No project in scope: the groups that are about one have nothing to say, so only SYSTEM shows. */
export const Default: Story = {};

export const Branded: Story = { args: { brand: 'qits ci' } };

/**
 * A project in scope. The Project node and what belongs to the project come first, then one group
 * per **component** that has repositories, and the archetype categories below for the repositories
 * the platform has not given one — the sidebar the platform's own URL grammar makes possible.
 */
export const Grouped: Story = {
  decorators: [applicationConfig({ providers: [scopeAt({ project: 'qits' })] })],
};

/**
 * A repository in scope, read from a browser sitting on the ci host. The repository's own row is
 * open and lists what the platform has to say about it, and the entry that *is* this host is the
 * current page — host and path together, because either alone would mark the wrong row.
 *
 * Artifacts is an application the platform has not flipped yet: it has no host of its own, so its
 * row points at its old segment under the environment origin, unscoped, and is never the page.
 */
export const RepositoryInScope: Story = {
  name: 'Repository in scope',
  decorators: [
    applicationConfig({
      providers: [
        scopeAt({ project: 'qits', group: 'qits-ci', repository: 'qits-ci-service' }),
        { provide: QITS_BROWSER_ORIGIN, useValue: CI_ORIGIN },
      ],
    }),
  ],
};

/**
 * What an edge that predates slots answers: a flat list of front doors, drawn exactly as it always
 * was. One release of overlap, and then the shape goes away.
 */
export const LegacyFlat: Story = {
  name: 'Legacy flat',
  decorators: [
    applicationConfig({ providers: [provideRouter([]), provideQitsNavigationLinks(DEMO_LINKS)] }),
  ],
};

/**
 * `links` is an explicit override, and a non-empty one suppresses the navigation source entirely.
 * That is how an app renders its own list — a preview, a section it owns — without unwiring the
 * provider it will use in production.
 */
export const OwnLinks: Story = {
  name: 'Own links',
  args: {
    brand: 'qits docs',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Guides', href: '/docs/guides/' },
      { label: 'Reference', href: '/docs/reference/' },
    ],
  },
};

/**
 * Nothing has answered yet. The navigation renders no entries and carries `aria-busy`, rather than
 * showing a compiled-in guess that might disagree with what the platform actually routes.
 */
export const Waiting: Story = {
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        // A source that is simply never answered — what the first paint of every SPA looks like.
        { provide: QITS_NAVIGATION, useValue: { tree: signal(undefined), failed: signal(false) } },
      ],
    }),
  ],
};

/**
 * The navigation could not be fetched, or came back empty. One way out — the platform's own root,
 * which is not a registry entry and so cannot go stale — under a line saying what happened.
 */
export const Stranded: Story = {
  decorators: [
    applicationConfig({ providers: [provideRouter([]), provideQitsNavigationLinks([])] }),
  ],
};

/**
 * An application's own sub-menu, under the row that is that application. The layout gives it a
 * bare block and styles nothing inside it — everything visible here belongs to the story.
 *
 * Declare the `<ng-template qitsNavSubmenu>` in the app shell beside the `<router-outlet />`, never
 * inside a page: a page's declaration is rebuilt on every navigation, and the panel would lose its
 * scroll position and its open groups on each hop.
 */
export const WithSubmenu: Story = {
  name: 'With a sub-menu',
  decorators: [
    moduleMetadata({ imports: [QitsNavSubmenu] }),
    applicationConfig({
      providers: [
        scopeAt({ project: 'qits', group: 'qits-ci', repository: 'qits-ci-service' }),
        { provide: QITS_BROWSER_ORIGIN, useValue: CI_ORIGIN },
      ],
    }),
  ],
  render: (args) => ({
    props: args,
    template: `
      <qits-main-layout ${argsToTemplate(args)} />
      <ng-template qitsNavSubmenu>
        <ul style="list-style:none;margin:0;padding:0 8px 8px 22px;font-size:13px">
          <li><a href="/getting-started/" style="color:#374151">Getting started</a></li>
          <li><a href="/architecture/" style="color:#374151">Architecture</a></li>
          <li><a href="/reference/" style="color:#374151">Reference</a></li>
        </ul>
      </ng-template>
    `,
  }),
};

/**
 * The top-left slot as the platform ships it: the project picker where a wordmark would be. Every
 * resource on this platform belongs to a project, so which one is open is the outermost fact about
 * a page — above the links, because it scopes them.
 *
 * With nothing picked the picker *is* its own list, so the bar is as tall as the projects there
 * are; picking one collapses the list into the pill and the bar shrinks back to a row.
 */
export const WithProjectPicker: Story = {
  name: 'With the project picker',
  decorators: [
    applicationConfig({ providers: [provideRouter([{ path: '**', component: Child }])] }),
  ],
};

/**
 * The list has not arrived. The slot says so rather than showing an empty picker, which would read
 * as a platform holding no projects — a different fact, and a discouraging one to show by accident.
 */
export const ProjectsLoading: Story = {
  name: 'Projects loading',
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: QITS_PROJECTS,
          useValue: { projects: signal(undefined), failed: signal(false) },
        },
      ],
    }),
  ],
};

/**
 * The read failed. Again distinct from an empty platform, and again said in words: the reader is
 * looking at a chrome that cannot currently tell them what exists.
 */
export const ProjectsUnavailable: Story = {
  name: 'Projects unavailable',
  decorators: [applicationConfig({ providers: [provideQitsProjectList([], { failed: true })] })],
};

/**
 * The pending-builds bolt, beside the picker, **shut** — which is how a reader meets it: something
 * is building, so the bolt is amber, and the red dot at its corner counts what has not started yet.
 * Neither reaches a screen reader, so the button's own `aria-label` says it in words: *Pending
 * builds: 1 running, 2 queued*.
 *
 * The count is kept current behind a shut panel, off the platform's own event stream, with a slow
 * interval where that stream cannot be held — `provideQitsBuilds()` is what puts all of it in the
 * bar at all.
 */
export const WithPendingBuilds: Story = {
  name: 'With pending builds',
  decorators: [
    applicationConfig({
      providers: [provideQitsBuildList(DEMO_BUILDS), scopeAt({ project: 'qits' })],
    }),
  ],
};

/**
 * The queue is empty and the platform is idle. Grey-filled is an **answer** — we asked, and nothing
 * is building — and no badge at all, rather than a red dot reading zero on every page of a quiet
 * afternoon.
 */
export const NoPendingBuilds: Story = {
  name: 'No pending builds',
  decorators: [applicationConfig({ providers: [provideQitsBuildList([])] })],
};

/**
 * A queue long enough that the number stops being one: past nine the badge reads `9+`, because a
 * wider dot would move the bolt and everything beside it in the bar, and "a lot" is all a badge
 * that size can honestly carry. The exact figure is in the label and in the panel.
 */
export const QueuedBuilds: Story = {
  name: 'A queue that outgrew its badge',
  decorators: [
    applicationConfig({
      providers: [provideQitsBuildList(QUEUED_BUILDS), scopeAt({ project: 'qits' })],
    }),
  ],
};

/**
 * `/ci` could not be reached — the ordinary case on a host the platform does not route it on. The
 * bolt is **hollowed out**: a grey-filled one would be a confident "nothing is building", which is
 * the one thing this chrome is in no position to say, and the label reads *Pending builds:
 * unavailable*. Nothing else on the page changes, which is the whole failure mode of a header
 * affordance that reads another application; opening it says the same thing in one quiet line.
 */
export const BuildsUnavailable: Story = {
  name: 'Builds unavailable',
  decorators: [applicationConfig({ providers: [provideQitsBuildList([], { failed: true })] })],
};

/**
 * Nothing has answered yet — the first paint of every chrome. Deliberately quiet: the resting grey
 * is right, because there is nothing to report and an alarm would be a claim. It is *not* reported
 * as idle to a screen reader, though; the label reads *Pending builds: checking*.
 */
export const BuildsLoading: Story = {
  name: 'Builds loading',
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: QITS_BUILDS,
          useValue: { runs: signal(undefined), failed: signal(false), watch: () => undefined },
        },
      ],
    }),
  ],
};

/**
 * The popover behind the bolt. A run under way carries the info tone and a rail down its left; one
 * waiting for a worker is neutral, so the two are told apart by more than a colour.
 *
 * Under the facts, where qits-ci predicted the run's steps, its **expected shape**: the track is
 * divided per step in proportion to how long each is expected to take, with a seam at every
 * boundary, and it fills left to right against a local clock. Beside it, what the run has actually
 * taken so far — ticking, once a second, while the panel is open and never otherwise. A run of a
 * pipeline nobody has measured yet gets no bar at all, which is the third row here.
 *
 * Every row is the way into that run in qits-ci — a full-document link, because that is another
 * application on a host of its own. This story names a ci host, so the rows are links; on a
 * platform that names none they are the same four facts as text.
 *
 * The panel is opened here by the story, because a closed popover documents nothing. In an
 * application it opens on the bolt, closes on Escape or a click outside, and asks qits-ci at the
 * panel's own five-second rate only while it is open.
 */
export const BuildsPanel: Story = {
  name: 'The builds panel',
  decorators: [
    applicationConfig({
      providers: [provideQitsBuildList(DEMO_BUILDS), scopeAt({ project: 'qits' })],
    }),
  ],
  play: openTheBolt,
};

/**
 * The layout is a *route* component: nothing sits inside its tags, the child routes render into its
 * `<router-outlet />`. This story wires one up so the content area has something in it, and so the
 * scrolling — content only, navigation fixed — is visible.
 */
export const WithRoutedChild: Story = {
  name: 'With a routed child',
  decorators: [
    applicationConfig({
      providers: [provideRouter([{ path: '**', component: Child }]), scopeAt({ project: 'qits' })],
    }),
  ],
};
