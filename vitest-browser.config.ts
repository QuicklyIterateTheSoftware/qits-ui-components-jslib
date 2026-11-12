import { playwright } from '@vitest/browser-playwright';
import type { Plugin } from 'vite';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';
import { screenshotReferences } from '@qits/angular/screenshots';

/**
 * The browser screenshot tests (`*.browser.spec.ts`, `pnpm test:browser`), modelled on
 * qits-landing-app's. Every component is shot in the light and the dark theme
 * (`freezeScreenshots({ colorSchemes })` in `setup.ts`), from synthetic inputs: this library has no
 * backend of its own, so there is no golden-master guard.
 */

/** Where the freezes go, relative to this file (the root the plugin and the check both use). */
const FREEZES = 'projects/qits-spa-ui-components/src/testing/browser/freezes';

/**
 * `parkPointer`: moves the mouse off the page, just past its top-left corner, so no element is
 * hovered: the pointer otherwise stays where the previous test clicked, and over a button it draws
 * the hover background into the next screenshot.
 */
const parkPointer: BrowserCommand<[]> = async (context) => {
  if (context.provider.name !== 'playwright') return;
  await (
    context as unknown as { page: { mouse: { move(x: number, y: number): Promise<void> } } }
  ).page.mouse.move(-1, -1);
};

/**
 * Chromium's flags for the screenshot tests: `--disable-partial-raster`, as in qits-landing-app. By
 * default Chromium re-rasters only the invalidated part of a tile, and the antialiased edge of a
 * rounded corner drawn that way can come out one colour step off the whole-tile result, depending
 * on what was invalidated first.
 *
 * And a browser window larger than the test page: the page is an iframe of Vitest's own page, sized
 * by `browserViewport` (`angular.json`, 800x3000, tall so a long report is shot whole), and Vitest
 * scales the iframe down to fit a smaller window, which would shoot every component at a third of
 * its size.
 *
 * Set from a plugin because the Angular builder makes the provider itself; `configureVitest` runs
 * before any browser starts.
 */
const chromiumFlags: Plugin = {
  name: 'qits:chromium-flags',
  configureVitest({ project }) {
    const browser = project.config.browser;
    if (browser.provider?.name !== 'playwright') return;
    browser.provider = playwright({
      ...(browser.provider.options as Parameters<typeof playwright>[0]),
      launchOptions: { args: ['--disable-partial-raster'] },
      contextOptions: { viewport: { width: 1000, height: 3200 } },
    });
  },
};

export default defineConfig({
  // screenshotReferences: records the references each spec asks for, so `qits-angular screenshots
  // --check` (after the run, in `test:browser`) finds the ones no test uses; `freezes` writes every
  // passing shot as HTML and registers the colour-scheme command the setup's `colorSchemes` needs.
  plugins: [chromiumFlags, screenshotReferences({ freezes: { dir: FREEZES } })],
  test: {
    browser: {
      commands: { parkPointer },
      // No screenshot of every failed test: __screenshots__/ holds only the committed references. A
      // reference that does not match writes its actual and diff images to .vitest-attachments/.
      screenshotFailures: false,
      expect: {
        toMatchScreenshot: {
          // Any changed pixel is a failure: the renderer is pinned, so there is no noise to forgive,
          // and a tolerance would let a small colour change pass unnoticed.
          comparatorName: 'pixelmatch',
          comparatorOptions: { threshold: 0, allowedMismatchedPixelRatio: 0 },
        },
      },
    },
  },
});
