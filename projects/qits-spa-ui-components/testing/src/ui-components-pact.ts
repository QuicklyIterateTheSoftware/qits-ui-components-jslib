/// <reference types="node" />
/**
 * A consuming frontend's pacts for the calls `@qits/ui-components` makes on its behalf (ticket
 * qits-1284), as one line in the frontend's own specs:
 *
 * ```ts
 * // src/app/ui-components.pact.spec.ts
 * import { uiComponentsPact } from '@qits/ui-components/testing';
 * import { appConfig } from './app.config';
 *
 * describe('@qits/ui-components pacts', () =>
 *   uiComponentsPact({ consumer: 'qits-ci-frontend', appConfig, sources: 'src/app' }));
 * ```
 *
 * The library cannot pact these calls itself: each SPA turns on a different set of features and
 * pins its own version, and a pact naming the library as its consumer would claim every call for
 * every SPA. So the CONSUMER records them, and this helper decides which from what the consumer
 * really does, never from a declaration:
 *
 * - it boots the consumer's own `appConfig` providers and counts a feature when its token resolves
 *   (`QITS_NAVIGATION`, `QITS_PROJECTS`, `QITS_BUILDS`, the code-preview failure insight and the
 *   screenshots report kind);
 * - a client the library provides in root counts when the consumer's sources use it
 *   (`<qits-run-reports`, `QitsReportsClient`, `QitsSourceFiles`, …);
 * - it runs each feature's block (see `blocks.ts`) against its provider's mock server, and writes
 *   one pact per provider, `pacts/<consumer>_qits-ui-components-jslib_<provider>.json`, whose
 *   `consumer.name` is the consumer's repository;
 * - THE GUARD: it fails when a source under `sources` uses a calling library symbol whose calls the
 *   pacts it wrote do not hold. A provider moved into a route's `providers`, say, is out of
 *   `appConfig`'s reach and would otherwise ship unpacted.
 *
 * Each file is compared with the committed one by `assertPactFile`: a difference fails unless
 * `QITS_GOLDEN_UPDATE=true`, and one confined to `qits-via.version` (a library bump) is written
 * back in place. A committed file for a provider the consumer no longer calls fails the same way.
 */
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { assertPactFile, type Via } from '@qits/angular/testing';
import {
  QITS_BUILDS,
  QITS_EVENT_SOURCE,
  QITS_FAILURE_INSIGHTS,
  QITS_NAVIGATION,
  QITS_PROJECTS,
  QITS_REPORT_KINDS,
  QITS_REPOSITORIES,
  QITS_SCREENSHOTS_KIND,
  QitsCodePreview,
  QitsCodePreviewInsight,
} from '@qits/ui-components';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  UI_COMPONENTS_BLOCKS,
  type UiComponentsAppProviders,
  type UiComponentsFeature,
} from './blocks';
import { UI_COMPONENTS_PROVIDERS, type UiComponentsProvider } from './masters';
import {
  UI_COMPONENTS_CALLING_SYMBOLS,
  uiComponentsSymbolUses,
  type UiComponentsSymbolUse,
} from './sources';
import { UI_COMPONENTS_REPOSITORY, uiComponentsVia } from './via';

export interface UiComponentsPactOptions {
  /** The frontend's REPOSITORY name (`qits-ci-frontend`), never its package name. */
  readonly consumer: string;
  /** The application's config, as `bootstrapApplication` gets it; only `providers` is read. */
  readonly appConfig: { readonly providers: UiComponentsAppProviders };
  /** The application's sources (`src/app`), relative to the cwd: what the guard reads. */
  readonly sources: string;
  /** Where the committed pacts live, relative to the cwd. Default `pacts`. */
  readonly pacts?: string;
  /** The environment variable that rewrites the committed pacts. Default `QITS_GOLDEN_UPDATE`. */
  readonly updateSwitch?: string;
  /** `qits-via`. Default: `uiComponentsVia()`, the version the consumer resolves. */
  readonly via?: Via;
  /** Where the golden-master packages and the library are looked up from. Default: the cwd. */
  readonly from?: string;
  /** The test's timeout, in milliseconds. Default 60 s. */
  readonly timeout?: number;
}

/** What one run produced: the features it found, and the committed file per provider. */
export interface UiComponentsPactResult {
  readonly features: readonly UiComponentsFeature[];
  readonly files: Readonly<Partial<Record<UiComponentsProvider, string>>>;
}

/** The pact file a consumer commits for one provider. */
export function uiComponentsPactFile(consumer: string, provider: UiComponentsProvider): string {
  return `${consumer}_${UI_COMPONENTS_REPOSITORY}_${provider}.json`;
}

/**
 * Registers the consumer's ui-components pact as one test (`it`) of the enclosing `describe`. The
 * runner's globals are used (vitest with `globals`, as `@angular/build:unit-test` runs it), so this
 * entry point depends on no test framework. See the file comment.
 */
export function uiComponentsPact(options: UiComponentsPactOptions): void {
  const { it } = globalThis as {
    it?: (name: string, test: () => Promise<unknown>, timeout?: number) => void;
  };
  if (typeof it !== 'function') {
    throw new Error(
      'uiComponentsPact registers a test: call it in a describe, with test globals on',
    );
  }
  it(
    `${options.consumer} pacts the @qits/ui-components calls it makes`,
    () => runUiComponentsPact(options),
    options.timeout ?? 60_000,
  );
}

/** {@link uiComponentsPact}'s test itself, for a caller that registers its own. */
export async function runUiComponentsPact(
  options: UiComponentsPactOptions,
): Promise<UiComponentsPactResult> {
  const { consumer, appConfig, sources } = options;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(consumer)) {
    throw new Error(
      `consumer '${consumer}' is no repository name (qits-ci-frontend, not a package)`,
    );
  }
  const via = options.via ?? uiComponentsVia(options.from);
  const pacts = resolve(process.cwd(), options.pacts ?? 'pacts');
  const updateSwitch = options.updateSwitch ?? 'QITS_GOLDEN_UPDATE';
  const sourceDir = resolve(process.cwd(), sources);
  if (!existsSync(sourceDir)) throw new Error(`no sources at ${sourceDir}: pass the app's src/app`);
  const uses = uiComponentsSymbolUses(sourceDir);
  const features = uiComponentsFeatures(appConfig.providers, uses);

  const byProvider = new Map<UiComponentsProvider, UiComponentsFeature[]>();
  for (const feature of features) {
    const { provider } = UI_COMPONENTS_BLOCKS[feature];
    byProvider.set(provider, [...(byProvider.get(provider) ?? []), feature]);
  }

  const dir = mkdtempSync(join(tmpdir(), 'qits-ui-components-pact-'));
  try {
    const generated = new Map<UiComponentsProvider, string>();
    for (const [provider, owned] of byProvider) {
      const pact = new PactV4({ consumer, provider, dir, logLevel: 'warn' });
      for (const feature of owned) {
        await UI_COMPONENTS_BLOCKS[feature].pact(pact, {
          consumer,
          via,
          providers: appConfig.providers,
          from: options.from,
        });
      }
      generated.set(provider, join(dir, `${consumer}-${provider}.json`));
    }

    guard(uses, generated);

    const files: Partial<Record<UiComponentsProvider, string>> = {};
    for (const [provider, file] of generated) {
      const committed = join(pacts, uiComponentsPactFile(consumer, provider));
      assertPactFile(file, committed, updateSwitch);
      files[provider] = committed;
    }
    for (const provider of Object.keys(UI_COMPONENTS_PROVIDERS) as UiComponentsProvider[]) {
      const stale = join(pacts, uiComponentsPactFile(consumer, provider));
      if (generated.has(provider) || !existsSync(stale)) continue;
      if (process.env[updateSwitch] !== 'true') {
        throw new Error(
          `${stale} is committed, but ${consumer} makes no @qits/ui-components call to ${provider} ` +
            `any more. Remove it in this change: ${updateSwitch}=true npm test`,
        );
      }
      rmSync(stale);
    }
    return { features, files };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The features an application turns on: the tokens its `providers` resolve, plus the clients its
 * sources use (`uses`, from `uiComponentsSymbolUses`). Resolving builds the sources, so every
 * request they make goes to `HttpTestingController` and is never answered.
 */
export function uiComponentsFeatures(
  providers: UiComponentsAppProviders,
  uses: readonly UiComponentsSymbolUse[] = [],
): UiComponentsFeature[] {
  const found = new Set<UiComponentsFeature>();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      ...providers,
      provideHttpClientTesting(),
      { provide: QITS_EVENT_SOURCE, useValue: null },
    ],
  });
  try {
    if (TestBed.inject(QITS_NAVIGATION, null)) found.add('NAVIGATION');
    if (TestBed.inject(QITS_PROJECTS, null)) found.add('PROJECTS').add('REPOSITORIES');
    if (TestBed.inject(QITS_REPOSITORIES, null)) found.add('REPOSITORIES');
    if (TestBed.inject(QITS_BUILDS, null)) found.add('ACTIVE_RUNS');
    const insights = TestBed.inject(QITS_FAILURE_INSIGHTS, null) ?? [];
    if (insights.some((i) => i === QitsCodePreviewInsight || i.component === QitsCodePreview)) {
      found.add('SOURCE_FILE');
    }
    const kinds = TestBed.inject(QITS_REPORT_KINDS, null) ?? [];
    if (kinds.some((kind) => kind.kind === QITS_SCREENSHOTS_KIND)) found.add('RAW_FILE');
  } finally {
    TestBed.resetTestingModule();
  }
  // A registration resolves or it does not; a root-provided client is "used" only where it is used.
  for (const { symbol } of uses) {
    if (registration(symbol)) continue;
    for (const feature of UI_COMPONENTS_CALLING_SYMBOLS[symbol]) found.add(feature);
  }
  return (Object.keys(UI_COMPONENTS_BLOCKS) as UiComponentsFeature[]).filter((f) => found.has(f));
}

/** A symbol that registers something in a config, which the config's tokens answer for. */
function registration(symbol: string): boolean {
  return (
    symbol.startsWith('provideQits') ||
    symbol === 'QitsCodePreviewInsight' ||
    symbol === 'QITS_SCREENSHOTS_REPORT_KIND'
  );
}

/**
 * Fails when a source uses a calling symbol and the pacts written lack an operation of one of its
 * features: the feature is used somewhere the helper cannot see from `appConfig`.
 */
function guard(
  uses: readonly UiComponentsSymbolUse[],
  generated: ReadonlyMap<UiComponentsProvider, string>,
): void {
  const pacted = new Set<string>();
  for (const [provider, file] of generated) {
    if (!existsSync(file)) continue;
    const pact = JSON.parse(readFileSync(file, 'utf8')) as {
      interactions?: { comments?: { references?: { 'qits-call'?: { operationId?: string } } } }[];
    };
    for (const interaction of pact.interactions ?? []) {
      const operationId = interaction.comments?.references?.['qits-call']?.operationId;
      if (operationId) pacted.add(`${provider} ${operationId}`);
    }
  }
  const missing: string[] = [];
  for (const { symbol, file } of uses) {
    for (const feature of UI_COMPONENTS_CALLING_SYMBOLS[symbol]) {
      const block = UI_COMPONENTS_BLOCKS[feature];
      const absent = block.operations.filter((op) => !pacted.has(`${block.provider} ${op}`));
      if (absent.length) {
        missing.push(
          `${file} uses ${symbol}, but no pact holds ${feature} (${block.provider} ${absent.join(', ')})`,
        );
      }
    }
  }
  if (missing.length) {
    throw new Error(
      `@qits/ui-components calls the pacts do not cover:\n- ${missing.join('\n- ')}\n` +
        'Provide the feature in the appConfig passed to uiComponentsPact (a provider in a route or ' +
        "component is out of this helper's sight), so the call is pacted before it ships.",
    );
  }
}
