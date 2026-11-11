/// <reference types="node" />
import { goldenMasters, type GoldenMasters } from '@qits/angular/testing';

/**
 * The four providers this library calls, each as its pact names it (the repository) and as its
 * golden-master package names it (the application, in `index.json`'s `provider`). The packages are
 * devDependencies of the CONSUMER, so qits-maintenance bumps them there and each SPA pacts against
 * the answers its own pinned providers recorded.
 */
export const UI_COMPONENTS_PROVIDERS = {
  'qits-edge-service': { app: 'qits-edge', package: '@qits/edge-golden-masters' },
  'qits-projects-service': { app: 'qits-projects', package: '@qits/projects-golden-masters' },
  'qits-ci-service': { app: 'qits-ci', package: '@qits/ci-golden-masters' },
  'qits-githost-service': { app: 'qits-githost', package: '@qits/githost-golden-masters' },
} as const;

/** A provider of a call this library makes, by repository name. */
export type UiComponentsProvider = keyof typeof UI_COMPONENTS_PROVIDERS;

/**
 * The providers whose pact verification resolves a `ProviderState` generator on a query value
 * against the params its `@State` returned. Their masters keep each `{param}` query template, so
 * `addGoldenInteraction` turns it into such a generator: the mock server still gets the example
 * value, and the provider sends the ids its state really created. qits-projects-service creates
 * random slugs per state (`a project with work to brief`), so a pinned example query would ask it
 * for ids that do not exist (qits-1897).
 */
const QUERY_GENERATOR_PROVIDERS: ReadonlySet<UiComponentsProvider> = new Set([
  'qits-projects-service',
]);

/**
 * The provider's golden masters, looked up from `from` (default: the cwd). A provider in
 * {@link QUERY_GENERATOR_PROVIDERS} keeps its `{param}` query templates; every other one has them
 * filled from the state's params — see {@link queryFromParams}.
 */
export function providerMasters(provider: UiComponentsProvider, from?: string): GoldenMasters {
  const { app, package: name } = UI_COMPONENTS_PROVIDERS[provider];
  const masters = goldenMasters(name, app, from);
  return QUERY_GENERATOR_PROVIDERS.has(provider) ? masters : queryFromParams(masters);
}

/**
 * `masters` with each query value the index records as a template (`rev: '{rev}'`) replaced by the
 * state's param of that name. qits-githost records `/file` and `/raw` that way, because which
 * revision and path a state is about is the state's own fact; the pact has to send the values, as
 * the library does, or the mock server would wait for a literal `{rev}`. (`addGoldenInteraction`
 * now sends a template's example value itself, as a `ProviderState` generator; filling it here
 * instead keeps githost's pacts literal, the form its verification was proven against.)
 */
function queryFromParams(masters: GoldenMasters): GoldenMasters {
  return {
    operation(state, operationId) {
      const op = masters.operation(state, operationId);
      const query = Object.fromEntries(
        Object.entries(op.query).map(([key, value]) => [
          key,
          value.replace(/\{(\w+)}/g, (_, name: string) => {
            const param = op.params[name];
            if (param === undefined) {
              throw new Error(`state '${state}' has no param '${name}' for ${operationId}'s query`);
            }
            return param;
          }),
        ]),
      );
      return { ...op, query };
    },
    body: (state, operationId) => masters.body(state, operationId),
    text: (state, operationId) => masters.text(state, operationId),
  };
}

/**
 * `masters` with every report's `payload` emptied to `{}` in the bodies of `operations`, so a
 * consumed `payload` binds that it is there and an object, and nothing of what is in it.
 *
 * Each kind's view parses its payload defensively and the library never reads one itself, so its
 * content is the reporting step's business, not this contract's. A Pact body without matchers
 * accepts keys it did not expect in an answer, which is what makes `{}` mean "present".
 */
export function payloadPresentOnly(
  masters: GoldenMasters,
  operations: readonly string[],
): GoldenMasters {
  const empty = (report: unknown) =>
    report && typeof report === 'object' && 'payload' in report
      ? { ...report, payload: {} }
      : report;
  return {
    operation: (state, operationId) => masters.operation(state, operationId),
    body(state, operationId) {
      const body = masters.body(state, operationId);
      if (!operations.includes(operationId)) return body;
      return Array.isArray(body) ? body.map(empty) : empty(body);
    },
    // The payload emptying only applies to parsed JSON bodies; text passes through unchanged.
    text: (state, operationId) => masters.text(state, operationId),
  };
}
