import { provideHttpClient, withFetch } from '@angular/common/http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  provideQitsBuilds,
  provideQitsNavigation,
  provideQitsProjects,
  provideQitsStandardReportKinds,
} from '@qits/ui-components';

import type { UiComponentsAppProviders } from './blocks';
import {
  runUiComponentsPact,
  uiComponentsFeatures,
  uiComponentsPactFile,
} from './ui-components-pact';
import { uiComponentsSymbolUses } from './sources';
import { UI_COMPONENTS_ARTIFACT, UI_COMPONENTS_REPOSITORY, uiComponentsVia } from './via';

/**
 * `uiComponentsPact` end to end, on a made-up consumer in a scratch directory: which features its
 * config and sources turn on, the files it writes and compares, and the guard. The committed pacts
 * go to the scratch directory too, under a switch of this spec's own, so nothing here writes into
 * the repository.
 */
const SWITCH = 'QITS_UI_COMPONENTS_PACT_SPEC_UPDATE';
const via = {
  repository: UI_COMPONENTS_REPOSITORY,
  artifact: UI_COMPONENTS_ARTIFACT,
  version: '1.0.0',
};

let root: string;
const at = (path: string) => relative(process.cwd(), join(root, path));
const source = (path: string, text: string) => {
  mkdirSync(join(root, 'src/app', path, '..'), { recursive: true });
  writeFileSync(join(root, 'src/app', path), text);
};
const run = (consumer: string, providers: UiComponentsAppProviders) =>
  runUiComponentsPact({
    consumer,
    appConfig: { providers },
    sources: at('src/app'),
    pacts: at('pacts'),
    updateSwitch: SWITCH,
    via,
  });
const committed = (consumer: string, provider: string) =>
  JSON.parse(
    readFileSync(
      join(root, 'pacts', `${consumer}_qits-ui-components-jslib_${provider}.json`),
      'utf8',
    ),
  );

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'qits-ui-components-pact-spec-'));
});
afterEach(() => {
  delete process.env[SWITCH];
  rmSync(root, { recursive: true, force: true });
});

describe('uiComponentsFeatures', () => {
  it('counts what a config resolves', () => {
    expect(uiComponentsFeatures([provideHttpClient(withFetch()), provideQitsNavigation()])).toEqual(
      ['NAVIGATION'],
    );
    expect(
      uiComponentsFeatures([
        provideHttpClient(withFetch()),
        provideQitsNavigation(),
        provideQitsProjects(),
        provideQitsBuilds(),
        provideQitsStandardReportKinds(),
      ]),
    ).toEqual(['NAVIGATION', 'PROJECTS', 'REPOSITORIES', 'ACTIVE_RUNS', 'SOURCE_FILE', 'RAW_FILE']);
  });

  it('counts a root-provided client where the sources use it, and a registration only where it resolves', () => {
    source('run/run-page.html', '<qits-run-reports [runId]="id()" />');
    source('app.config.ts', 'export const c = [provideQitsBuilds()];');
    const uses = uiComponentsSymbolUses(join(root, 'src/app'));
    expect(uiComponentsFeatures([provideHttpClient()], uses)).toEqual(['RUN_REPORTS']);
  });
});

describe('runUiComponentsPact', () => {
  it('writes one pact per provider the consumer calls, and passes once committed', async () => {
    source('app.config.ts', 'export const c = [provideQitsNavigation(), provideQitsProjects()];');
    const providers = [
      provideHttpClient(withFetch()),
      provideQitsNavigation(),
      provideQitsProjects(),
    ];

    await expect(run('qits-demo-frontend', providers)).rejects.toThrow(/does not exist/);

    process.env[SWITCH] = 'true';
    const result = await run('qits-demo-frontend', providers);
    expect(result.features).toEqual(['NAVIGATION', 'PROJECTS', 'REPOSITORIES']);
    expect(Object.keys(result.files).sort()).toEqual([
      'qits-edge-service',
      'qits-projects-service',
    ]);

    const edge = committed('qits-demo-frontend', 'qits-edge-service');
    expect(edge.consumer.name).toBe('qits-demo-frontend');
    expect(edge.provider.name).toBe('qits-edge-service');
    expect(edge.interactions.map((i: { description: string }) => i.description)).toEqual([
      'show-main-navigation: getMainNavigation',
    ]);
    expect(edge.interactions[0].comments.references['qits-via']).toEqual(via);
    expect(edge.interactions[0].comments.references['qits-trigger']).toEqual({
      kind: 'ui',
      app: 'qits-demo-frontend',
      interaction: 'show-main-navigation',
    });
    expect(committed('qits-demo-frontend', 'qits-projects-service').interactions).toHaveLength(2);

    delete process.env[SWITCH];
    await run('qits-demo-frontend', providers);
  });

  it('refuses a committed pact for a provider the consumer no longer calls', async () => {
    source('app.config.ts', 'export const c = [provideQitsNavigation()];');
    const providers = [provideHttpClient(withFetch()), provideQitsNavigation()];
    process.env[SWITCH] = 'true';
    await run('qits-demo-frontend', providers);
    const stale = join(
      root,
      'pacts',
      uiComponentsPactFile('qits-demo-frontend', 'qits-ci-service'),
    );
    writeFileSync(stale, '{}');
    delete process.env[SWITCH];

    await expect(run('qits-demo-frontend', providers)).rejects.toThrow(
      /no @qits\/ui-components call to qits-ci-service/,
    );
    process.env[SWITCH] = 'true';
    await run('qits-demo-frontend', providers);
    expect(existsSync(stale)).toBe(false);
  });

  it('fails when a source uses a calling symbol its pacts do not cover', async () => {
    // Provided in a route, out of the config the helper boots: the bolt would ship unpacted.
    source(
      'app.routes.ts',
      'export const routes = [{ path: "", providers: [provideQitsBuilds()] }];',
    );
    process.env[SWITCH] = 'true';
    await expect(
      run('qits-demo-frontend', [provideHttpClient(withFetch()), provideQitsNavigation()]),
    ).rejects.toThrow(
      /app\.routes\.ts uses provideQitsBuilds, but no pact holds ACTIVE_RUNS \(qits-ci-service listActiveRuns\)/,
    );
    expect(existsSync(join(root, 'pacts'))).toBe(false);
  });

  it('refuses a package name for the consumer', async () => {
    await expect(run('@qits/spa-ci', [])).rejects.toThrow(/no repository name/);
  });
});

describe('uiComponentsVia', () => {
  it('names the version the consumer resolves', () => {
    mkdirSync(join(root, 'node_modules/@qits/ui-components'), { recursive: true });
    writeFileSync(
      join(root, 'node_modules/@qits/ui-components/package.json'),
      JSON.stringify({ name: '@qits/ui-components', version: '2026.1018.141324' }),
    );
    mkdirSync(join(root, 'app'));
    expect(uiComponentsVia(join(root, 'app'))).toEqual({
      repository: 'qits-ui-components-jslib',
      artifact: '@qits/ui-components',
      version: '2026.1018.141324',
    });
  });

  it('says so when the consumer has no @qits/ui-components installed', () => {
    expect(() => uiComponentsVia(root)).toThrow(/no @qits\/ui-components in any node_modules/);
  });
});
