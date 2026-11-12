import { TestBed } from '@angular/core/testing';
import { diagramsDrawn } from '../testing/browser/mermaid';
import { clearScheme, forceScheme, mount } from '../testing/browser/mount';
import { QitsEntityChangesReport } from './entity-changes-report';
import { CHANGED, EVERY_STATUS } from './fixtures/entity-changes/entity-changes-states';
import { MERMAID_STORY_LOADER } from './fixtures/mermaid-story-loader';

/**
 * Screenshots of the entity changes report: a changed unit with its before and after diagrams, and
 * every status. Its diagrams are mermaid's, which redraw asynchronously on a scheme change, so each
 * scheme is its own test (see `mermaid-diagram.browser.spec.ts`).
 */
const STYLE = 'display: block; padding: 8px; width: 760px';

const REASON = 'mermaid redraws asynchronously on a scheme change; each scheme is its own test';

describe('QitsEntityChangesReport (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MERMAID_STORY_LOADER] });
  });

  afterEach(() => {
    clearScheme();
  });

  for (const scheme of ['LIGHT', 'DARK'] as const) {
    it(`shows a changed unit and its diagrams (${scheme})`, async () => {
      forceScheme(scheme);
      const { view } = await mount(QitsEntityChangesReport, { ...CHANGED }, STYLE);
      await diagramsDrawn();
      await expect
        .element(view())
        .toMatchScreenshot('changed', { kind: 'DATA', colorSchemes: [scheme], reason: REASON });
    });

    it(`shows every status (${scheme})`, async () => {
      forceScheme(scheme);
      const { view } = await mount(QitsEntityChangesReport, { ...EVERY_STATUS }, STYLE);
      await diagramsDrawn();
      await expect.element(view()).toMatchScreenshot('every-status', {
        kind: 'DATA',
        colorSchemes: [scheme],
        reason: REASON,
      });
    });
  }
});
