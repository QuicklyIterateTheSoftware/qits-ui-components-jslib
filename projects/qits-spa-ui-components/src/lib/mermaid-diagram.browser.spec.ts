import { TestBed } from '@angular/core/testing';
import { diagramsDrawn, SEEDED_MERMAID_LOADER } from '../testing/browser/mermaid';
import { clearScheme, forceScheme, mount } from '../testing/browser/mount';
import { CI_AFTER } from './fixtures/entity-changes/entity-changes-states';
import { QitsMermaidDiagram } from './mermaid-diagram';

/**
 * Screenshots of a mermaid diagram, drawn by the real mermaid, and of an undrawable definition.
 *
 * The diagram redraws asynchronously when the page's scheme changes, which the screenshot harness
 * does not wait for. So each scheme is its own test: the page is put in the scheme first, the spec
 * waits for the drawing, and the harness then takes that one scheme without switching.
 */
// Wide enough that the SVG is drawn at its own size: scaled down (`max-width: 100%`) to a fractional
// size, its table borders antialiased differently from run to run.
const STYLE = 'display: block; padding: 8px; width: 760px';

const INVALID = 'erDiagram\n  ci_run {\n    uuid id PK "not null"\n  ci_run }o--|| : \n';

const REASON = 'mermaid redraws asynchronously on a scheme change; each scheme is its own test';

describe('QitsMermaidDiagram (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [SEEDED_MERMAID_LOADER] });
  });

  afterEach(() => {
    clearScheme();
  });

  for (const scheme of ['LIGHT', 'DARK'] as const) {
    it(`draws an entity diagram in the mermaid theme of the page (${scheme})`, async () => {
      forceScheme(scheme);
      const { view } = await mount(
        QitsMermaidDiagram,
        { definition: CI_AFTER, label: 'ci entities' },
        STYLE,
      );
      await diagramsDrawn();
      await expect
        .element(view())
        .toMatchScreenshot('valid', { kind: 'DATA', colorSchemes: [scheme], reason: REASON });
    });
  }

  it('shows an undrawable definition as text', async () => {
    const { view } = await mount(
      QitsMermaidDiagram,
      { definition: INVALID, label: 'ci entities' },
      STYLE,
    );
    await diagramsDrawn();
    await expect.element(view()).toMatchScreenshot('invalid', { kind: 'ERROR' });
  });
});
