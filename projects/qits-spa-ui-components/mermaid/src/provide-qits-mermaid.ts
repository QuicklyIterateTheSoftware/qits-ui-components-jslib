import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { QITS_MERMAID_LOADER, type QitsMermaid } from '@qits/ui-components';

/**
 * Installs the real `import('mermaid')` loader behind `QITS_MERMAID_LOADER` (ticket qits-1910).
 *
 * The main entry point's own default factory refuses instead of loading mermaid: esbuild emits a
 * dynamic import's whole chunk — mermaid is roughly 3.4 MB — for every module it reaches, even one
 * tree-shaken out of the running app, so a bare `import('mermaid')` in the main FESM put that chunk
 * in **every** consumer, whether or not it ever draws a diagram. Behind this secondary entry point,
 * only an app that imports `@qits/ui-components/mermaid` and calls this function pays for it.
 *
 * Add it once, in the app's providers:
 *
 * ```ts
 * providers: [provideQitsMermaid()];
 * ```
 *
 * Without it, `QitsMermaidDiagram` (and the diagrams inside `QitsEntityChangesReport`) still work:
 * every definition they are given stays legible as text, in its `<pre>`.
 */
export function provideQitsMermaid(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: QITS_MERMAID_LOADER,
      useValue: async () => (await import('mermaid')).default as unknown as QitsMermaid,
    },
  ]);
}
