/**
 * Setup for the browser screenshot tests (`*.browser.spec.ts`): the same pixels on every machine.
 *
 * - The page loads `styles.css` (the test build's global stylesheet): Tailwind and the library's
 *   `theme.css`, as an app loads them, and Inter from this repository, never a system font.
 * - Every shot is taken twice, LIGHT then DARK (`freezeScreenshots({ colorSchemes })`, ticket
 *   qits-2083): the harness emulates `prefers-color-scheme` and sets `data-theme` on `<html>`, and
 *   names the references `<name>-light` / `<name>-dark`. Every `toMatchScreenshot` names its kind.
 * - Animations and transitions are off and the caret does not blink (`styles.css`), and the pointer
 *   is parked off the page before every test.
 * - The components take synthetic inputs (this library has no backend of its own), so there is no
 *   golden-master guard.
 */
import { freezeScreenshots } from '@qits/angular/testing/browser';
import { afterEach, beforeAll, beforeEach } from 'vitest';
import { commands } from 'vitest/browser';

freezeScreenshots({ colorSchemes: ['LIGHT', 'DARK'], requireKind: true });

beforeAll(async () => {
  await Promise.all([
    document.fonts.load("400 16px 'Inter Test'"),
    document.fonts.load("600 16px 'Inter Test'"),
  ]);
  if (!document.fonts.check("600 16px 'Inter Test'")) {
    throw new Error('the test font did not load (styles.css, fonts/)');
  }
});

beforeEach(async () => {
  await commands.parkPointer();
});

// The spec files share one page, and TestBed's root element sits directly in <body>: a style a spec
// puts on it would reach every file after it. Clear it after every test.
afterEach(() => {
  document.body.removeAttribute('style');
});
