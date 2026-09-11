import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { QitsDiffViewer } from './diff-viewer';

/**
 * A real `git diff-tree -p` patch, preamble and all, with a `\ No newline at end of file` on the
 * end. Hand-trimmed for length; nothing about its *shape* is invented.
 */
const PATCH = [
  'diff --git a/greeting.txt b/greeting.txt',
  'index 5b6fbe2..f9224de 100644',
  '--- a/greeting.txt',
  '+++ b/greeting.txt',
  '@@ -1,4 +1,4 @@',
  ' hello',
  '-old line',
  '+new line',
  ' tail',
  '@@ -20,3 +20,3 @@ context function()',
  '-gone',
  '+here',
  ' last',
  '\\ No newline at end of file',
  '',
].join('\n');

describe('QitsDiffViewer', () => {
  function render(patch: string, path = 'greeting.txt'): ComponentFixture<QitsDiffViewer> {
    const fixture = TestBed.createComponent(QitsDiffViewer);
    fixture.componentRef.setInput('patch', patch);
    fixture.componentRef.setInput('path', path);
    fixture.detectChanges();
    return fixture;
  }

  function lines(fixture: ComponentFixture<QitsDiffViewer>): { kind: string; text: string }[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('li.line')].map((li) => ({
      // `line` is on every row; the second class is the kind.
      kind: [...li.classList].find((name) => name !== 'line') ?? '',
      text: li.querySelector('code')?.textContent ?? '',
    }));
  }

  it('classes a real diff-tree patch line by line', () => {
    const drawn = lines(render(PATCH));
    expect(drawn.map((line) => line.kind)).toEqual([
      'meta', // diff --git
      'meta', // index
      'meta', // ---
      'meta', // +++
      'hunk',
      'context',
      'del',
      'add',
      'context',
      'hunk',
      'del',
      'add',
      'context',
      'meta', // \ No newline at end of file
    ]);
  });

  it('dims the whole diff/index/---/+++ preamble rather than reading it as a change', () => {
    const drawn = lines(render(PATCH));
    // `---`/`+++` are file headers, not a delete and an add of three characters each.
    expect(drawn[2]).toEqual({ kind: 'meta', text: '--- a/greeting.txt' });
    expect(drawn[3]).toEqual({ kind: 'meta', text: '+++ b/greeting.txt' });
  });

  it('does not class "\\ No newline at end of file" as context noise', () => {
    const drawn = lines(render(PATCH));
    const marker = drawn.find((line) => line.text.startsWith('\\ '));
    expect(marker).toBeDefined();
    expect(marker?.kind).toBe('meta');
  });

  it('drops only the trailing empty piece, keeping blank context lines', () => {
    const drawn = lines(render(['@@ -1,2 +1,2 @@', ' ', '', ' tail', ''].join('\n')));
    expect(drawn.map((line) => line.text)).toEqual(['@@ -1,2 +1,2 @@', ' ', '', ' tail']);
  });

  it('says an empty patch is an answer, naming all three causes', () => {
    const text = (render('', 'docs/logo.png').nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('binary file');
    expect(text).toContain('pure rename');
    expect(text).toContain('too large to send');
  });

  it('asks for a file when no path is selected, and draws no rows', () => {
    const fixture = render(PATCH, '');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Select a changed file');
    expect(lines(fixture)).toEqual([]);
  });

  it('follows the patch through a change without fetching anything', () => {
    const fixture = render(PATCH);
    fixture.componentRef.setInput('patch', '@@ -1 +1 @@\n+one');
    fixture.detectChanges();
    expect(lines(fixture).map((line) => line.kind)).toEqual(['hunk', 'add']);
  });
});
