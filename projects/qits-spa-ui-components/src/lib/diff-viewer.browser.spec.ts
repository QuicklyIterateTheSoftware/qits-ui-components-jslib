import { mount } from '../testing/browser/mount';
import { QitsDiffViewer } from './diff-viewer';

/** Screenshots of the diff viewer: adds, deletes and two hunks; an empty patch; nothing selected. */
const TWO_HUNKS = [
  'diff --git a/src/app/code/diff-viewer.ts b/src/app/code/diff-viewer.ts',
  'index 5b6fbe2..f9224de 100644',
  '--- a/src/app/code/diff-viewer.ts',
  '+++ b/src/app/code/diff-viewer.ts',
  '@@ -1,7 +1,5 @@',
  " import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';",
  "-import { ProjectsApi } from '../api/projects-api';",
  "-import { Async } from '../ui/async';",
  ' ',
  ' /** One drawn diff line, classed by its first character. */',
  ' interface DiffLine {',
  '@@ -40,8 +38,9 @@ export class DiffViewer {',
  '-  private readonly api = inject(ProjectsApi);',
  '-  readonly repoId = input.required<string>();',
  '-  readonly sha = input.required<string>();',
  '+  /** git’s own unified-diff text. Empty is an answer. */',
  "+  readonly patch = input<string>('');",
  '+',
  "+  readonly path = input<string>('');",
  ' ',
  '   protected readonly lines = computed(() => {',
].join('\n');

const STYLE = 'display: block; padding: 8px; width: 720px';

describe('QitsDiffViewer (screenshots)', () => {
  it('draws adds, deletes and two hunks', async () => {
    const { view } = await mount(
      QitsDiffViewer,
      { path: 'src/app/code/diff-viewer.ts', patch: TWO_HUNKS },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('two-hunks', { kind: 'DATA' });
  });

  it('says so for an empty patch', async () => {
    const { view } = await mount(
      QitsDiffViewer,
      { path: 'docs/architecture.png', patch: '' },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('empty-patch', { kind: 'NO_DATA' });
  });

  it('says so when nothing is selected', async () => {
    const { view } = await mount(QitsDiffViewer, { path: '', patch: '' }, STYLE);
    await expect.element(view()).toMatchScreenshot('nothing-selected', { kind: 'NO_DATA' });
  });
});
