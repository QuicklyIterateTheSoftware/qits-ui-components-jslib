/// <reference types="node" />
/**
 * One building block per feature of `@qits/ui-components` that makes a REST call (ticket
 * qits-1284). A block adds its interactions to the provider's `PactV4` from that provider's golden
 * masters, binding only the fields the library reads, and runs each one through the library's
 * **real** client against the pact mock server: the consumer's own providers, with the navigation
 * pointing the application's origin at the mock server. Nothing here composes a request.
 *
 * Every interaction names the library (`qits-via`) and the consumer as the app whose UI caused it
 * (`qits-trigger`), so a provider's verification and the contracts report both read
 * `consumer → qits-ui-components-jslib → provider`.
 */
import { provideHttpClient, withFetch } from '@angular/common/http';
import { signal, type EnvironmentProviders, type Provider, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PactV4 } from '@pact-foundation/pact';
import { firstValueFrom } from 'rxjs';
import { addGoldenInteraction, type Via } from '@qits/angular/testing';
import {
  provideQitsBuilds,
  provideQitsNavigation,
  provideQitsNavigationTree,
  provideQitsProjects,
  provideQitsStandardReportKinds,
  QITS_BUILDS,
  QITS_EVENT_SOURCE,
  QITS_NAVIGATION,
  QITS_NAVIGATION_URL,
  QITS_PROJECTS,
  QITS_REPOSITORIES,
  QITS_SCOPE,
  QitsProjectRepositoryLookup,
  QitsReportsClient,
  QitsRepositoryRawClient,
  QitsSourceFiles,
  type QitsScopeSource,
} from '@qits/ui-components';

import { payloadPresentOnly, providerMasters, type UiComponentsProvider } from './masters';

/** What an application's config provides: `ApplicationConfig.providers`. */
export type UiComponentsAppProviders = readonly (Provider | EnvironmentProviders)[];

/** A feature of the library that makes a REST call, and so one block of a consumer's pacts. */
export type UiComponentsFeature =
  | 'NAVIGATION'
  | 'PROJECTS'
  | 'REPOSITORIES'
  | 'ACTIVE_RUNS'
  | 'RUN_REPORTS'
  | 'SOURCE_FILE'
  | 'RAW_FILE';

/** Who is pacting, through which library version, with which providers. */
export interface UiComponentsPactContext {
  /** The consuming frontend's REPOSITORY name (`qits-ci-frontend`): `qits-trigger.app`. */
  readonly consumer: string;
  /** `qits-via`: see `uiComponentsVia()`. */
  readonly via: Via;
  /**
   * The application's own providers (`appConfig.providers`), which the real clients are built
   * from; the block overrides only the navigation (to point at the mock server), the scope where
   * it needs a project, and the builds' event stream (off). Default:
   * {@link uiComponentsDefaultProviders}.
   */
  readonly providers?: UiComponentsAppProviders;
  /** Where the golden-master packages are looked up from; default: the cwd. */
  readonly from?: string;
}

/** One feature's interactions with one provider. */
export interface UiComponentsBlock {
  readonly feature: UiComponentsFeature;
  /** The provider's repository name, which is also its pact's `provider.name`. */
  readonly provider: UiComponentsProvider;
  /** The provider operations the feature calls, as `qits-call.operationId` names them. */
  readonly operations: readonly string[];
  /** Adds the feature's interactions to `pact` (whose provider is {@link provider}) and runs each. */
  pact(pact: PactV4, context: UiComponentsPactContext): Promise<void>;
}

/**
 * The library's own calling providers, as an application would list them: what a block runs
 * against when the context names none (the library's own spec, a hand-written consumer spec).
 */
export function uiComponentsDefaultProviders(): UiComponentsAppProviders {
  return [
    provideHttpClient(withFetch()),
    provideQitsNavigation(),
    provideQitsProjects(),
    provideQitsBuilds(),
    provideQitsStandardReportKinds(),
  ];
}

/** The UI interaction behind each call, as `qits-trigger.interaction` names it. Stable: a rename is a pact change. */
export const UI_COMPONENTS_TRIGGERS = {
  NAVIGATION: 'show-main-navigation',
  PROJECTS: 'show-project-picker',
  REPOSITORIES: 'show-project-repositories',
  ACTIVE_RUNS: 'show-active-builds',
  RUN_REPORTS: 'show-run-reports',
  RUN_REPORT: 'open-run-report',
  SOURCE_FILE: 'preview-failure-source',
  RAW_FILE: 'show-screenshot',
} as const;

/** `/main-navigation`, as `toNavTree` and `QitsAppLinks` read it. */
const NAVIGATION_STATE = 'a published navigation';
/**
 * The navigation's slot keys are spelled with a dot (`services.details`), which a `consumes` path
 * cannot step into, so `slots` is bound whole: every entry's `app`, `label`, `host`, `origin`,
 * `path`, `position` and `subpath`, which is every field `toNavTree` reads of it. The same holds for
 * `applications`, whose entries carry exactly the `origin` and `apiDocs` the library reads.
 */
const NAVIGATION_CONSUMES = ['origin', 'projectOrigin', 'slots', 'applications'];

const PROJECTS_STATE = 'a project exists';
const PROJECTS_CONSUMES = [
  'entries[].project.id',
  'entries[].project.slug',
  'entries[].project.name',
];

const REPOSITORIES_STATE = 'a project with repositories in components';
const REPOSITORIES_CONSUMES = [
  'entries[].repository.id',
  'entries[].repository.name',
  'entries[].repository.archetype',
  'entries[].repository.component',
  'wrapper.repositoryId',
];

const ACTIVE_RUNS_STATE = 'a commit with a run in flight';
/**
 * `toBuild` also reads `expectedStepDurationsMillis`, `steps` and `live`, all optional. The state
 * records them as `null`, `[]` and `null`, and binding those would pin "no prediction, no steps"
 * on every provider answer, so they stay unbound until qits-ci records a run that has them.
 */
const ACTIVE_RUNS_CONSUMES = [
  'runs[].id',
  'runs[].repoName',
  'runs[].branch',
  'runs[].status',
  'runs[].configPath',
  'runs[].commitSha',
  'runs[].createdAt',
  'runs[].startedAt',
];

const RUN_REPORTS_STATE = 'a run with reports: failing tests and coverage';
/** `QitsReportSummary`: what the area, its highlights strip and each section read of a report. */
const SUMMARY = [
  'id',
  'kind',
  'kindVersion',
  'stepIndex',
  'highlights',
  'baselineRunId',
  'baselineVersion',
  'payloadBytes',
  'submittedAt',
];
const RUN_REPORTS_CONSUMES = [
  'runId',
  'commitSha',
  'releaseRequestId',
  'baseline.version',
  'baseline.runId',
  'baseline.releaseRequestId',
  'baseline.tagSha',
  ...SUMMARY.map((field) => `reports[].${field}`),
];
const RUN_REPORT_CONSUMES = [...SUMMARY, 'payload'];
/**
 * A baseline run's report is drawn beside the run's own by kind and step; the state records it
 * with no baseline of its own (`baselineRunId`/`baselineVersion` null), which is no shape to pin.
 */
const BASELINE_REPORTS_CONSUMES = SUMMARY.filter((field) => !field.startsWith('baseline'))
  .concat('payload')
  .map((field) => `[].${field}`);

const SOURCE_FILE_STATES = {
  'a repository with files on main': 'file',
  'no repository with the given id': 'no-such-repository',
  'a repository missing the requested commit': 'no-such-rev',
  'a repository missing the requested path': 'no-such-path',
} as const;
const SOURCE_FILE_CONSUMES = ['path', 'binary', 'size', 'content'];

const RAW_FILE_STATE = 'a repository with an image on main';
const RAW_FILE_TYPE = 'image/png';

/** The navigation an application's origin is read from: the mock server, for `app`. */
function originAt(app: string, url: string): EnvironmentProviders {
  return provideQitsNavigationTree({ applications: { [app]: { origin: url } } });
}

/**
 * Runs `body` in a fresh TestBed of the consumer's providers plus `overrides`, and tears it down
 * after: every source stops polling and every cache starts empty, so each interaction is one read.
 */
async function inBed<T>(
  context: UiComponentsPactContext,
  overrides: UiComponentsAppProviders,
  body: () => Promise<T>,
): Promise<T> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ...(context.providers ?? uiComponentsDefaultProviders()),
      // The builds' event stream is not REST and is no part of these pacts.
      { provide: QITS_EVENT_SOURCE, useValue: null },
      ...overrides,
    ],
  });
  try {
    return await body();
  } finally {
    TestBed.resetTestingModule();
  }
}

/** The first non-undefined `read()`, ticking the application while it waits (effects, signals). */
async function settled<T>(read: () => T | undefined, what: string, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    TestBed.tick();
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`${what}: no answer within ${ms} ms`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** A failed source is a pact the library could not read: say which, rather than a bare timeout. */
function answered<T>(source: { failed: Signal<boolean> }, value: T | undefined): T | undefined {
  if (source.failed())
    throw new Error('the library gave up on the mock server: see its mismatches');
  return value;
}

const trigger = (context: UiComponentsPactContext, interaction: string) =>
  ({ kind: 'ui', app: context.consumer, interaction }) as const;

/** `GET /main-navigation`, by `provideQitsNavigation({ url })` against qits-edge's mock server. */
export const UI_COMPONENTS_NAVIGATION: UiComponentsBlock = {
  feature: 'NAVIGATION',
  provider: 'qits-edge-service',
  operations: ['getMainNavigation'],
  pact: (pact, context) =>
    addGoldenInteraction(pact, providerMasters('qits-edge-service', context.from), {
      provider: 'qits-edge-service',
      state: NAVIGATION_STATE,
      operationId: 'getMainNavigation',
      trigger: trigger(context, UI_COMPONENTS_TRIGGERS.NAVIGATION),
      consumes: NAVIGATION_CONSUMES,
      via: context.via,
    }).executeTest((server) =>
      inBed(
        context,
        [provideQitsNavigation({ url: `${server.url}${QITS_NAVIGATION_URL}` })],
        async () => {
          const navigation = TestBed.inject(QITS_NAVIGATION);
          const tree = await settled(
            () => answered(navigation, navigation.tree()),
            'the navigation',
          );
          check(tree.legacy === undefined, 'the navigation answered without slots');
          check(tree.entries.length > 0, 'the navigation has no entries');
          check(
            Object.keys(tree.origins ?? {}).length > 0,
            'the navigation names no application origin',
          );
        },
      ),
    ),
};

/** `GET /projects/api/projects`, by `QITS_PROJECTS` on qits-projects' origin. */
export const UI_COMPONENTS_PROJECTS: UiComponentsBlock = {
  feature: 'PROJECTS',
  provider: 'qits-projects-service',
  operations: ['listProjects'],
  pact: (pact, context) =>
    addGoldenInteraction(pact, providerMasters('qits-projects-service', context.from), {
      provider: 'qits-projects-service',
      state: PROJECTS_STATE,
      operationId: 'listProjects',
      trigger: trigger(context, UI_COMPONENTS_TRIGGERS.PROJECTS),
      consumes: PROJECTS_CONSUMES,
      via: context.via,
    }).executeTest((server) =>
      inBed(context, [originAt('qits-projects', server.url)], async () => {
        const source = TestBed.inject(QITS_PROJECTS);
        const projects = await settled(() => answered(source, source.projects()), 'the projects');
        check(projects.length > 0, 'no project listed');
        check(
          projects.every((project) => project.id && project.slug && project.name),
          'a project without id, slug or name',
        );
      }),
    ),
};

/**
 * `GET /projects/api/projects/{projectId}/repositories`, by both of the library's readers: the
 * scoped `QITS_REPOSITORIES` (with the state's project in scope) and `QitsProjectRepositoryLookup`.
 * One request, one interaction: the two send the same call.
 */
export const UI_COMPONENTS_REPOSITORIES: UiComponentsBlock = {
  feature: 'REPOSITORIES',
  provider: 'qits-projects-service',
  operations: ['listProjectRepositories'],
  pact: (pact, context) => {
    const masters = providerMasters('qits-projects-service', context.from);
    const projectId = masters.operation(REPOSITORIES_STATE, 'listProjectRepositories').params[
      'projectId'
    ];
    const scope: QitsScopeSource = {
      scope: signal({}),
      projectId: signal(projectId),
      repositoryId: signal(undefined),
      routing: 'repository',
      select: () => undefined,
    };
    return addGoldenInteraction(pact, masters, {
      provider: 'qits-projects-service',
      state: REPOSITORIES_STATE,
      operationId: 'listProjectRepositories',
      trigger: trigger(context, UI_COMPONENTS_TRIGGERS.REPOSITORIES),
      consumes: REPOSITORIES_CONSUMES,
      via: context.via,
    }).executeTest((server) =>
      inBed(
        context,
        [originAt('qits-projects', server.url), { provide: QITS_SCOPE, useValue: scope }],
        async () => {
          const source = TestBed.inject(QITS_REPOSITORIES);
          const scoped = await settled(
            () => answered(source, source.repositories()),
            'the scoped repositories',
          );
          check(scoped.length > 0, 'no repository listed');
          check(
            scoped.every((r) => r.id && r.name),
            'a repository without id or name',
          );
          check(
            scoped.some((r) => r.component),
            'no repository carries its component',
          );
          check(
            scoped.some((r) => r.category),
            'no repository maps to a category',
          );
          check(source.wrapperRepositoryId(), 'the listing names no wrapper repository');
          const looked = TestBed.inject(QitsProjectRepositoryLookup).repositories(projectId);
          const lookup = await settled(() => {
            const { repositories, failed } = looked();
            if (failed) throw new Error('the repository lookup failed against the mock server');
            return repositories;
          }, 'the looked-up repositories');
          check(lookup.length === scoped.length, 'the two readers disagree on the listing');
        },
      ),
    );
  },
};

/** `GET /ci/api/runs/active`, by `QITS_BUILDS` on qits-ci's origin, its event stream off. */
export const UI_COMPONENTS_ACTIVE_RUNS: UiComponentsBlock = {
  feature: 'ACTIVE_RUNS',
  provider: 'qits-ci-service',
  operations: ['listActiveRuns'],
  pact: (pact, context) =>
    addGoldenInteraction(pact, providerMasters('qits-ci-service', context.from), {
      provider: 'qits-ci-service',
      state: ACTIVE_RUNS_STATE,
      operationId: 'listActiveRuns',
      trigger: trigger(context, UI_COMPONENTS_TRIGGERS.ACTIVE_RUNS),
      consumes: ACTIVE_RUNS_CONSUMES,
      via: context.via,
    }).executeTest((server) =>
      inBed(context, [originAt('qits-ci', server.url)], async () => {
        const source = TestBed.inject(QITS_BUILDS);
        const runs = await settled(() => answered(source, source.runs()), 'the active runs');
        check(runs.length > 0, 'no active run listed');
        check(
          runs.every((run) => run.id && run.repoName && run.status && run.configPath),
          'an active run without id, repository, status or pipeline',
        );
      }),
    ),
};

/**
 * `<qits-run-reports>`' three reads through `QitsReportsClient` on qits-ci's origin: the run's
 * summaries when the area shows, and one report with its baseline's reports of that kind when a
 * section opens. A report's `payload` is bound as present only (see `payloadPresentOnly`).
 */
export const UI_COMPONENTS_RUN_REPORTS: UiComponentsBlock = {
  feature: 'RUN_REPORTS',
  provider: 'qits-ci-service',
  operations: ['listRunReports', 'getRunReport', 'listRunBaselineReports'],
  pact: async (pact, context) => {
    const masters = payloadPresentOnly(providerMasters('qits-ci-service', context.from), [
      'getRunReport',
      'listRunBaselineReports',
    ]);
    const params = masters.operation(RUN_REPORTS_STATE, 'listRunReports').params;
    const runId = params['runId'];
    const reportId = params['reportId'];
    const add = (operationId: string, interaction: string, consumes: readonly string[]) =>
      addGoldenInteraction(pact, masters, {
        provider: 'qits-ci-service',
        state: RUN_REPORTS_STATE,
        operationId,
        trigger: trigger(context, interaction),
        consumes,
        via: context.via,
      });
    const client = () => TestBed.inject(QitsReportsClient);

    await add(
      'listRunReports',
      UI_COMPONENTS_TRIGGERS.RUN_REPORTS,
      RUN_REPORTS_CONSUMES,
    ).executeTest((server) =>
      inBed(context, [originAt('qits-ci', server.url)], async () => {
        const run = await firstValueFrom(client().runReports(runId));
        check(run.runId === runId, 'the summaries are of another run');
        check(run.reports.length > 0, 'the run lists no report');
        // The mock server answers one summary per recorded shape, not every recorded summary.
        check(
          run.reports.every((r) => r.id && r.kind && Array.isArray(r.highlights)),
          'a summary without id, kind or highlights',
        );
      }),
    );
    await add('getRunReport', UI_COMPONENTS_TRIGGERS.RUN_REPORT, RUN_REPORT_CONSUMES).executeTest(
      (server) =>
        inBed(context, [originAt('qits-ci', server.url)], async () => {
          const report = await firstValueFrom(client().report(runId, reportId));
          check(report.id === reportId, 'the report is another one');
          check(report.payload && typeof report.payload === 'object', 'the report has no payload');
        }),
    );
    // The kind is the recorded path's last segment: the state recorded the baseline of one kind.
    const kind = masters
      .operation(RUN_REPORTS_STATE, 'listRunBaselineReports')
      .path.split('/')
      .pop() as string;
    await add(
      'listRunBaselineReports',
      UI_COMPONENTS_TRIGGERS.RUN_REPORT,
      BASELINE_REPORTS_CONSUMES,
    ).executeTest((server) =>
      inBed(context, [originAt('qits-ci', server.url)], async () => {
        const reports = await firstValueFrom(client().baselineReports(runId, kind));
        check(reports.length > 0, 'the baseline has no report of the kind');
        check(
          reports.every((r) => r.kind === kind),
          'a baseline report of another kind',
        );
      }),
    );
  },
};

/**
 * `GET /githost/api/repositories/{repositoryId}/file?rev=&path=`, by `QitsSourceFiles` on
 * qits-githost's origin: the file, and the three 404s the code preview tells apart.
 */
export const UI_COMPONENTS_SOURCE_FILE: UiComponentsBlock = {
  feature: 'SOURCE_FILE',
  provider: 'qits-githost-service',
  operations: ['getRepositoryFile'],
  pact: async (pact, context) => {
    const masters = providerMasters('qits-githost-service', context.from);
    for (const [state, kind] of Object.entries(SOURCE_FILE_STATES)) {
      const op = masters.operation(state, 'getRepositoryFile');
      const { rev, path } = op.query as { rev: string; path: string };
      await addGoldenInteraction(pact, masters, {
        provider: 'qits-githost-service',
        state,
        operationId: 'getRepositoryFile',
        trigger: trigger(context, UI_COMPONENTS_TRIGGERS.SOURCE_FILE),
        consumes: kind === 'file' ? SOURCE_FILE_CONSUMES : ['error'],
        via: context.via,
      }).executeTest((server) =>
        inBed(context, [originAt('qits-githost', server.url)], async () => {
          const file = await TestBed.inject(QitsSourceFiles).read(
            op.params['repositoryId'],
            rev,
            path,
          );
          check(file.kind === kind, `'${state}' read as ${file.kind}, not ${kind}`);
          if (file.kind === 'file') check(file.content.length > 0, 'the file has no content');
        }),
      );
    }
  },
};

/**
 * `GET /githost/api/repositories/{repositoryId}/raw?rev=&path=`, by `QitsRepositoryRawClient` on
 * qits-githost's origin: the status, an `image/png` `Content-Type` and a body of that type. The
 * state's `body` param holds the recorded image, base64; it is the bytes the mock server answers.
 */
export const UI_COMPONENTS_RAW_FILE: UiComponentsBlock = {
  feature: 'RAW_FILE',
  provider: 'qits-githost-service',
  operations: ['getRaw'],
  pact: (pact, context) => {
    const masters = providerMasters('qits-githost-service', context.from);
    const op = masters.operation(RAW_FILE_STATE, 'getRaw');
    const { rev, path } = op.query as { rev: string; path: string };
    const bytes = Uint8Array.from(Buffer.from(op.params['body'] ?? '', 'base64'));
    check(bytes.length > 0, `'${RAW_FILE_STATE}' records no image bytes in its 'body' param`);
    return addGoldenInteraction(pact, masters, {
      provider: 'qits-githost-service',
      state: RAW_FILE_STATE,
      operationId: 'getRaw',
      trigger: trigger(context, UI_COMPONENTS_TRIGGERS.RAW_FILE),
      consumes: [],
      response: { contentType: RAW_FILE_TYPE, body: bytes },
      via: context.via,
    }).executeTest((server) =>
      inBed(context, [originAt('qits-githost', server.url)], async () => {
        const blob = await TestBed.inject(QitsRepositoryRawClient).raw(
          op.params['repositoryId'],
          rev,
          path,
        );
        check(blob.size === bytes.length, `the image is ${blob.size} bytes, not ${bytes.length}`);
        check(blob.type.startsWith(RAW_FILE_TYPE), `the image came back as '${blob.type}'`);
      }),
    );
  },
};

/** Every block, by feature, in the order a consumer's pacts are made. */
export const UI_COMPONENTS_BLOCKS: Readonly<Record<UiComponentsFeature, UiComponentsBlock>> = {
  NAVIGATION: UI_COMPONENTS_NAVIGATION,
  PROJECTS: UI_COMPONENTS_PROJECTS,
  REPOSITORIES: UI_COMPONENTS_REPOSITORIES,
  ACTIVE_RUNS: UI_COMPONENTS_ACTIVE_RUNS,
  RUN_REPORTS: UI_COMPONENTS_RUN_REPORTS,
  SOURCE_FILE: UI_COMPONENTS_SOURCE_FILE,
  RAW_FILE: UI_COMPONENTS_RAW_FILE,
};
