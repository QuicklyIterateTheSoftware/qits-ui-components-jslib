import type { Provider } from '@angular/core';
import { expect } from 'vitest';
import { WAIT_MS } from './mount';
import { QITS_MERMAID_LOADER, type QitsMermaid } from '../../lib/mermaid-diagram';

/**
 * The real mermaid, with its shapes' randomness seeded (`handDrawnSeed`): mermaid draws even the
 * classic look through rough.js, whose curves take random control points unless seeded. Unseeded,
 * the pixels happened to agree, but every run rewrote the freezes' SVG paths.
 */
export const SEEDED_MERMAID_LOADER: Provider = {
  provide: QITS_MERMAID_LOADER,
  useValue: async (): Promise<QitsMermaid> => {
    const mermaid = (await import('mermaid')).default;
    return {
      initialize: (config) => mermaid.initialize({ ...config, handDrawnSeed: 1 }),
      render: (id, definition) => mermaid.render(id, definition),
    };
  },
};

/**
 * Waits until every `<qits-mermaid-diagram>` on the page has drawn its diagram (or fallen back to
 * its definition): mermaid renders asynchronously, outside anything the application waits for.
 */
export async function diagramsDrawn(): Promise<void> {
  await expect
    .poll(
      () => {
        const diagrams = [...document.querySelectorAll('qits-mermaid-diagram')];
        return diagrams.every(
          (diagram) =>
            !diagram.querySelector('.drawing') &&
            !!(diagram.querySelector('.diagram svg') || diagram.querySelector('.definition')),
        );
      },
      { timeout: WAIT_MS },
    )
    .toBe(true);
}
