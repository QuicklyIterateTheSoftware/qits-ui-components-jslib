import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { uiComponentsSymbolUses, withoutComments } from './sources';

describe('withoutComments', () => {
  it('drops line and block comments but keeps strings, URLs and inline templates', () => {
    const code = [
      '// provideQitsBuilds() is not called here',
      '/* nor QitsSourceFiles */',
      "const url = 'https://example.test/x'; // QitsRepositoryRawClient",
      'const template = `<qits-run-reports [runId]="id" /> // kept: inside a literal`;',
      'const s = "a \\" quote"; provideQitsNavigation();',
    ].join('\n');
    const kept = withoutComments(code, false);
    expect(kept).not.toMatch(/provideQitsBuilds|QitsSourceFiles|QitsRepositoryRawClient/);
    expect(kept).toContain("'https://example.test/x'");
    expect(kept).toContain('<qits-run-reports [runId]="id" /> // kept: inside a literal');
    expect(kept).toContain('provideQitsNavigation();');
  });

  it('drops a template comment', () => {
    expect(withoutComments('<!-- <qits-run-reports /> --><p></p>', true)).not.toContain('qits-run');
  });
});

describe('uiComponentsSymbolUses', () => {
  let root: string;
  beforeEach(() => (root = mkdtempSync(join(tmpdir(), 'qits-ui-components-sources-'))));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds whole symbols and tags in application files, never in specs or stories', () => {
    mkdirSync(join(root, 'run'));
    writeFileSync(join(root, 'run/run-page.html'), '<qits-run-reports [runId]="r" />');
    writeFileSync(
      join(root, 'run/run-page.ts'),
      'inject(QitsReportsClientFake); provideQitsProjects()',
    );
    writeFileSync(join(root, 'run/run-page.spec.ts'), 'QitsReportsClient; QitsSourceFiles');
    writeFileSync(join(root, 'run/x.stories.ts'), 'QitsRepositoryRawClient');
    writeFileSync(join(root, 'run/notes.md'), 'provideQitsBuilds');
    const uses = uiComponentsSymbolUses(root).map((use) => use.symbol);
    expect(uses.sort()).toEqual(['<qits-run-reports', 'provideQitsProjects']);
  });
});
