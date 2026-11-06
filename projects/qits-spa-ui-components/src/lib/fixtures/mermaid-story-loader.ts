import type { Provider } from '@angular/core';

import { QITS_MERMAID_LOADER, type QitsMermaid } from '../mermaid-diagram';

/**
 * The real mermaid loader, for the stories that draw diagrams (ticket qits-1910). What
 * `provideQitsMermaid()` from `@qits/ui-components/mermaid` installs, but against this source's
 * own `QITS_MERMAID_LOADER`: Storybook compiles the library's sources, so neither the published
 * entry point nor its token (a different instance) are reachable from here.
 */
export const MERMAID_STORY_LOADER: Provider = {
  provide: QITS_MERMAID_LOADER,
  useValue: async () => (await import('mermaid')).default as unknown as QitsMermaid,
};
