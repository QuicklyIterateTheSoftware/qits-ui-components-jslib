import { mount } from '../testing/browser/mount';
import { QitsChangeTree } from './change-tree';
import type { QitsChangeEntry } from './change-tree-model';

/** Screenshots of the change tree: every change type with a row selected, and a collapsed chain. */
const EVERY_TYPE: readonly QitsChangeEntry[] = [
  { path: 'src/lib/change-tree.ts', changeType: 'ADDED' },
  { path: 'src/lib/diff-viewer.ts', changeType: 'MODIFIED' },
  { path: 'src/lib/file-tree.ts', changeType: 'DELETED' },
  {
    path: 'src/lib/change-tree-model.ts',
    previousPath: 'src/lib/tree-model.ts',
    changeType: 'RENAMED',
  },
  { path: 'README.md', changeType: 'MODIFIED' },
];

const SUBMODULE_FOLD: readonly QitsChangeEntry[] = [
  { path: '.gitmodules', changeType: 'MODIFIED' },
  { path: 'components/qits-ci/qits-ci-service', changeType: 'MODIFIED' },
  { path: 'components/qits-ci/qits-ci-service/pom.xml', changeType: 'MODIFIED' },
  {
    path: 'components/qits-ci/qits-ci-service/src/main/java/ClaimWorker.java',
    changeType: 'MODIFIED',
  },
  { path: 'components/qits-projects/qits-projects-service', changeType: 'MODIFIED' },
  {
    path: 'components/qits-projects/qits-projects-service/src/main/java/Fold.java',
    changeType: 'ADDED',
  },
];

const STYLE = 'display: block; padding: 8px; width: 360px';

describe('QitsChangeTree (screenshots)', () => {
  it('marks every change type, one row selected', async () => {
    const { view } = await mount(
      QitsChangeTree,
      { entries: EVERY_TYPE, selected: 'src/lib/diff-viewer.ts' },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('every-change-type', { kind: 'DATA' });
  });

  it('collapses a chain of single folders, a submodule selected', async () => {
    const { view } = await mount(
      QitsChangeTree,
      { entries: SUBMODULE_FOLD, selected: 'components/qits-ci/qits-ci-service' },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('submodule-bump', { kind: 'DATA' });
  });

  it('says so when nothing changed', async () => {
    const { view } = await mount(QitsChangeTree, { entries: [] }, STYLE);
    await expect.element(view()).toMatchScreenshot('no-changes', { kind: 'NO_DATA' });
  });
});
