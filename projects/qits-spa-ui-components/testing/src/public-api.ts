/*
 * Public API of @qits/ui-components/testing: a consuming frontend's pacts for the calls this
 * library makes on its behalf (ticket qits-1284). Node-side only (it reads node_modules and writes
 * pact files), for specs, never for app code. Needs `@pact-foundation/pact` and `@qits/angular`,
 * optional peers of this package, and the providers' golden-master packages, all devDependencies.
 */
export * from './blocks';
export { UI_COMPONENTS_PROVIDERS, payloadPresentOnly, providerMasters } from './masters';
export type { UiComponentsProvider } from './masters';
export * from './sources';
export * from './ui-components-pact';
export * from './via';
