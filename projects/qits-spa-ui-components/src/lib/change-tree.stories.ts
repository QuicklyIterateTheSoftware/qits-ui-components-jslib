import type { Meta, StoryObj } from '@storybook/angular-vite';

import { QitsChangeTree } from './change-tree';
import type { QitsChangeEntry } from './change-tree-model';

const EVERY_TYPE: readonly QitsChangeEntry[] = [
  { path: 'src/lib/change-tree.ts', changeType: 'ADDED' },
  { path: 'src/lib/diff-viewer.ts', changeType: 'MODIFIED' },
  { path: 'src/lib/file-tree.ts', changeType: 'DELETED' },
  { path: 'src/lib/change-tree-model.ts', previousPath: 'src/lib/tree-model.ts', changeType: 'RENAMED' },
  { path: 'README.md', changeType: 'MODIFIED' },
];

const WRAPPER_FOLD: readonly QitsChangeEntry[] = [
  { path: 'components/qits-projects/qits-projects-service/pom.xml', changeType: 'MODIFIED' },
  {
    path: 'components/qits-projects/qits-projects-service/src/main/java/Fold.java',
    changeType: 'ADDED',
  },
  { path: 'components/qits-ci/qits-ci-service/pom.xml', changeType: 'MODIFIED' },
  { path: '.gitmodules', changeType: 'MODIFIED' },
];

const meta: Meta<QitsChangeTree> = {
  title: 'Components/ChangeTree',
  component: QitsChangeTree,
  tags: ['autodocs'],
  args: { entries: EVERY_TYPE, selected: 'src/lib/diff-viewer.ts', label: 'Changed files' },
};

export default meta;
type Story = StoryObj<QitsChangeTree>;

/**
 * A change set mixing all four change types. The mark on the right is the type — A, M, D, R — and a
 * rename states the path it came from in its title.
 */
export const EveryChangeType: Story = { name: 'Every change type' };

/**
 * A deep single-child chain, folded. `components/qits-projects/qits-projects-service` is **one**
 * row rather than three, which is what makes a wrapper release request — where every path has that
 * shape — readable at a glance.
 */
export const CollapsedChain: Story = {
  name: 'Collapsed chain',
  args: { entries: WRAPPER_FOLD, selected: 'components/qits-ci/qits-ci-service/pom.xml' },
};

/** Nothing folded and nothing deep — the ordinary shallow case, for comparison. */
export const Flat: Story = {
  args: {
    entries: [
      { path: 'package.json', changeType: 'MODIFIED' },
      { path: 'pnpm-lock.yaml', changeType: 'MODIFIED' },
      { path: 'LICENSE', changeType: 'ADDED' },
    ],
    selected: 'package.json',
  },
};
