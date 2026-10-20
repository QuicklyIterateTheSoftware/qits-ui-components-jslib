import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { UI_COMPONENTS_BLOCKS, type UiComponentsFeature } from './blocks';
import type { UiComponentsProvider } from './masters';
import { UI_COMPONENTS_ARTIFACT, UI_COMPONENTS_REPOSITORY } from './via';

/**
 * Every block, run against its provider's mock server through the library's real clients, so each
 * row a consumer will commit stays checked here: the recorded golden masters still hold every path
 * a block binds, and the library still reads what the mock server answers from them.
 *
 * The pacts are written to a scratch directory and thrown away. The library has no pact of its own
 * (a pact naming it as the consumer would claim every call for every SPA); its consumers commit
 * theirs, through `uiComponentsPact`.
 */
const CONSUMER = 'qits-ui-components-spec';
const { version } = JSON.parse(
  readFileSync('projects/qits-spa-ui-components/package.json', 'utf8'),
) as { version: string };
const via = { repository: UI_COMPONENTS_REPOSITORY, artifact: UI_COMPONENTS_ARTIFACT, version };

const dir = mkdtempSync(join(tmpdir(), 'qits-ui-components-blocks-'));
const pacts = new Map<UiComponentsProvider, PactV4>();
const pactFor = (provider: UiComponentsProvider) => {
  const existing = pacts.get(provider);
  if (existing) return existing;
  const pact = new PactV4({ consumer: CONSUMER, provider, dir, logLevel: 'warn' });
  pacts.set(provider, pact);
  return pact;
};

interface Written {
  consumer: { name: string };
  interactions: {
    description: string;
    comments: { references: Record<string, Record<string, string>> };
  }[];
}
const written = (provider: UiComponentsProvider): Written =>
  JSON.parse(readFileSync(join(dir, `${CONSUMER}-${provider}.json`), 'utf8'));

describe('@qits/ui-components/testing blocks', () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  for (const [feature, block] of Object.entries(UI_COMPONENTS_BLOCKS)) {
    it(`${feature}: ${block.provider} ${block.operations.join(', ')}`, async () => {
      await block.pact(pactFor(block.provider), { consumer: CONSUMER, via });
      const ours = written(block.provider).interactions.filter((i) =>
        block.operations.includes(i.comments.references['qits-call']['operationId']),
      );
      expect(new Set(ours.map((i) => i.comments.references['qits-call']['operationId']))).toEqual(
        new Set(block.operations),
      );
      for (const interaction of ours) {
        expect(interaction.comments.references['qits-via']).toEqual(via);
        expect(interaction.comments.references['qits-trigger']['app']).toBe(CONSUMER);
        expect(interaction.comments.references['qits-call']['app']).toBe(block.provider);
      }
    });
  }

  it('makes each feature its own interactions, named by the UI interaction behind them', () => {
    const descriptions = (provider: UiComponentsProvider) =>
      written(provider)
        .interactions.map((i) => i.description)
        .sort();
    expect(descriptions('qits-edge-service')).toEqual(['show-main-navigation: getMainNavigation']);
    expect(descriptions('qits-projects-service')).toEqual([
      'show-project-picker: listProjects',
      'show-project-repositories: listProjectRepositories',
    ]);
    expect(descriptions('qits-ci-service')).toEqual([
      'open-run-report: getRunReport',
      'open-run-report: listRunBaselineReports',
      'show-active-builds: listActiveRuns',
      'show-run-reports: listRunReports',
    ]);
    // The file and its three misses: one description, four provider states.
    expect(descriptions('qits-githost-service')).toEqual([
      'preview-failure-source: getRepositoryFile',
      'preview-failure-source: getRepositoryFile',
      'preview-failure-source: getRepositoryFile',
      'preview-failure-source: getRepositoryFile',
      'show-screenshot: getRaw',
    ]);
  });

  it('covers every feature', () => {
    const features: UiComponentsFeature[] = [
      'NAVIGATION',
      'PROJECTS',
      'REPOSITORIES',
      'ACTIVE_RUNS',
      'RUN_REPORTS',
      'SOURCE_FILE',
      'RAW_FILE',
    ];
    expect(Object.keys(UI_COMPONENTS_BLOCKS)).toEqual(features);
  });
});
