// The Node-side commands `vitest-browser.config.ts` gives the browser screenshot tests.
import 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** Moves the mouse off the page, so nothing is hovered in the next screenshot. */
    parkPointer: () => Promise<void>;
  }
}
