import {
  buildChangeTree,
  flattenChanges,
  qitsChangeLetter,
  qitsChangeTitle,
  qitsChangeTone,
  type QitsChangeEntry,
} from './change-tree-model';

function rows(entries: readonly QitsChangeEntry[], closed: readonly string[] = []) {
  return flattenChanges(buildChangeTree(entries), new Set(closed)).map((row) => ({
    kind: row.kind,
    label: row.label,
    path: row.path,
    depth: row.depth,
  }));
}

describe('change-tree-model', () => {
  describe('the fold', () => {
    it('turns a single-child chain into one row — two rows, not four', () => {
      expect(
        rows([
          { path: 'components/qits-projects/qits-projects-service/pom.xml', changeType: 'MODIFIED' },
        ]),
      ).toEqual([
        {
          kind: 'dir',
          label: 'components/qits-projects/qits-projects-service',
          path: 'components/qits-projects/qits-projects-service',
          depth: 0,
        },
        {
          kind: 'file',
          label: 'pom.xml',
          path: 'components/qits-projects/qits-projects-service/pom.xml',
          depth: 1,
        },
      ]);
    });

    it('stops folding where a directory has two children, and resumes below it', () => {
      expect(
        rows([
          { path: 'components/qits-ci/qits-ci-service/pom.xml', changeType: 'MODIFIED' },
          { path: 'components/qits-projects/qits-projects-service/pom.xml', changeType: 'MODIFIED' },
        ]),
      ).toEqual([
        { kind: 'dir', label: 'components', path: 'components', depth: 0 },
        {
          kind: 'dir',
          label: 'qits-ci/qits-ci-service',
          path: 'components/qits-ci/qits-ci-service',
          depth: 1,
        },
        {
          kind: 'file',
          label: 'pom.xml',
          path: 'components/qits-ci/qits-ci-service/pom.xml',
          depth: 2,
        },
        {
          kind: 'dir',
          label: 'qits-projects/qits-projects-service',
          path: 'components/qits-projects/qits-projects-service',
          depth: 1,
        },
        {
          kind: 'file',
          label: 'pom.xml',
          path: 'components/qits-projects/qits-projects-service/pom.xml',
          depth: 2,
        },
      ]);
    });

    it('never folds a file into the directory above it', () => {
      // `src` has exactly one child, but that child is the file — so it stays its own row.
      expect(rows([{ path: 'src/only.ts', changeType: 'ADDED' }])).toEqual([
        { kind: 'dir', label: 'src', path: 'src', depth: 0 },
        { kind: 'file', label: 'only.ts', path: 'src/only.ts', depth: 1 },
      ]);
    });

    it('acts on the deepest directory of a folded chain', () => {
      const folded = flattenChanges(
        buildChangeTree([{ path: 'a/b/c/file.txt', changeType: 'ADDED' }]),
      );
      expect(folded[0].chain).toEqual(['a', 'a/b', 'a/b/c']);
      expect(folded[0].path).toBe('a/b/c');
    });
  });

  describe('what is shut', () => {
    it('opens everything: a change set is the whole point of the view', () => {
      expect(rows([{ path: 'a/b/file.txt', changeType: 'ADDED' }]).length).toBe(2);
    });

    it('does not descend into a directory the reader folded shut', () => {
      expect(rows([{ path: 'a/b/file.txt', changeType: 'ADDED' }], ['a/b'])).toEqual([
        { kind: 'dir', label: 'a/b', path: 'a/b', depth: 0 },
      ]);
    });
  });

  describe('ordering and shape', () => {
    it('puts directories before files, then sorts by name', () => {
      expect(
        rows([
          { path: 'zeta.txt', changeType: 'ADDED' },
          { path: 'alpha.txt', changeType: 'ADDED' },
          { path: 'dir/inner.txt', changeType: 'ADDED' },
        ]).map((row) => row.label),
      ).toEqual(['dir', 'inner.txt', 'alpha.txt', 'zeta.txt']);
    });

    it('carries the change onto the file row and nothing onto a directory row', () => {
      const flat = flattenChanges(
        buildChangeTree([{ path: 'a/file.txt', changeType: 'DELETED' }]),
      );
      expect(flat[0].change).toBeNull();
      expect(flat[1].change).toEqual({ path: 'a/file.txt', changeType: 'DELETED' });
    });

    it('builds nothing from nothing', () => {
      expect(rows([])).toEqual([]);
    });
  });

  describe('the change mark', () => {
    it('letters every change type', () => {
      expect(qitsChangeLetter('ADDED')).toBe('A');
      expect(qitsChangeLetter('MODIFIED')).toBe('M');
      expect(qitsChangeLetter('DELETED')).toBe('D');
      expect(qitsChangeLetter('RENAMED')).toBe('R');
      expect(qitsChangeLetter('COPIED')).toBe('C');
      expect(qitsChangeLetter('TYPE_CHANGED')).toBe('T');
    });

    it('tones them semantically, never as a colour', () => {
      expect(qitsChangeTone('ADDED')).toBe('success');
      expect(qitsChangeTone('DELETED')).toBe('danger');
      expect(qitsChangeTone('RENAMED')).toBe('warning');
      expect(qitsChangeTone('MODIFIED')).toBe('info');
    });

    it('carries both paths of a rename into the title', () => {
      expect(
        qitsChangeTitle({
          path: 'src/lib/change-tree-model.ts',
          previousPath: 'src/lib/tree-model.ts',
          changeType: 'RENAMED',
        }),
      ).toBe('src/lib/change-tree-model.ts — renamed from src/lib/tree-model.ts');
    });

    it('states one path where there is only one', () => {
      expect(qitsChangeTitle({ path: 'README.md', changeType: 'MODIFIED' })).toBe(
        'README.md — modified',
      );
      // A previousPath equal to the path says nothing and is not repeated.
      expect(
        qitsChangeTitle({ path: 'README.md', previousPath: 'README.md', changeType: 'COPIED' }),
      ).toBe('README.md — copied');
    });
  });
});
