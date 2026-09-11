import type { Meta, StoryObj } from '@storybook/angular-vite';

import { QitsDiffViewer } from './diff-viewer';

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
  '+  readonly patch = input<string>(\'\');',
  '+',
  '+  readonly path = input<string>(\'\');',
  ' ',
  '   protected readonly lines = computed(() => {',
].join('\n');

const meta: Meta<QitsDiffViewer> = {
  title: 'Components/DiffViewer',
  component: QitsDiffViewer,
  tags: ['autodocs'],
  args: { path: 'src/app/code/diff-viewer.ts', patch: TWO_HUNKS },
};

export default meta;
type Story = StoryObj<QitsDiffViewer>;

/**
 * A patch with adds, deletes and two hunks. The `diff/index/---/+++` preamble dims, `@@` marks a
 * hunk, and `+`/`-` carry the change.
 */
export const AddsDeletesAndTwoHunks: Story = { name: 'Adds, deletes and two hunks' };

/**
 * An empty patch is an answer, not a failure: git emits none for a binary change or a pure rename,
 * and the service declines to send one that is too large to be worth rendering. All three land
 * here, so the pane says so rather than going blank.
 */
export const EmptyPatch: Story = {
  name: 'Empty patch',
  args: { path: 'docs/architecture.png', patch: '' },
};

/** No file chosen at all — a different sentence, because nothing has been asked for yet. */
export const NothingSelected: Story = {
  name: 'Nothing selected',
  args: { path: '', patch: '' },
};
