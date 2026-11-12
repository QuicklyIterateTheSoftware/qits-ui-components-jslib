import { expect } from 'vitest';

/**
 * Waits until every `<qits-mermaid-diagram>` on the page has drawn its diagram (or fallen back to
 * its definition): mermaid renders asynchronously, outside anything the application waits for.
 */
export async function diagramsDrawn(): Promise<void> {
  await expect
    .poll(() => {
      const diagrams = [...document.querySelectorAll('qits-mermaid-diagram')];
      return diagrams.every(
        (diagram) =>
          !diagram.querySelector('.drawing') &&
          !!(diagram.querySelector('.diagram svg') || diagram.querySelector('.definition')),
      );
    })
    .toBe(true);
}
