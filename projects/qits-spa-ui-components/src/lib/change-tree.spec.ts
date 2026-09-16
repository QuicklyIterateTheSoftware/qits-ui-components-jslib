import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { QitsChangeTree } from './change-tree';
import type { QitsChangeEntry } from './change-tree-model';

describe('QitsChangeTree', () => {
  function render(
    entries: readonly QitsChangeEntry[],
    selected: string | null = null,
  ): ComponentFixture<QitsChangeTree> {
    const fixture = TestBed.createComponent(QitsChangeTree);
    fixture.componentRef.setInput('entries', entries);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    return fixture;
  }

  function entries(fixture: ComponentFixture<QitsChangeTree>): HTMLButtonElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
  }

  function items(fixture: ComponentFixture<QitsChangeTree>): Element[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('li[role="treeitem"]')];
  }

  it('draws a folded chain as one row and keeps the list flat with aria-level', () => {
    const fixture = render([
      { path: 'components/qits-projects/qits-projects-service/pom.xml', changeType: 'MODIFIED' },
    ]);
    const names = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.qits-change-tree-name'),
    ];
    expect(names.map((name) => name.textContent)).toEqual([
      'components/qits-projects/qits-projects-service',
      'pom.xml',
    ]);
    // Flat: two siblings in one <ul>, told apart by aria-level rather than by nesting.
    expect(items(fixture).map((li) => li.getAttribute('aria-level'))).toEqual(['1', '2']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('ul').length).toBe(1);
  });

  it('marks each change type with its letter and tone', () => {
    const fixture = render([
      { path: 'added.ts', changeType: 'ADDED' },
      { path: 'changed.ts', changeType: 'MODIFIED' },
      { path: 'gone.ts', changeType: 'DELETED' },
      { path: 'moved.ts', previousPath: 'was.ts', changeType: 'RENAMED' },
    ]);
    const marks = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-change]')];
    expect(marks.map((mark) => mark.textContent)).toEqual(['A', 'M', 'D', 'R']);
    expect(marks.map((mark) => [...mark.classList].at(-1))).toEqual([
      'qits-change-tree-mark-success',
      'qits-change-tree-mark-info',
      'qits-change-tree-mark-danger',
      'qits-change-tree-mark-warning',
    ]);
  });

  it('states a rename’s previous path in the row title', () => {
    const fixture = render([
      { path: 'src/change-tree-model.ts', previousPath: 'src/tree-model.ts', changeType: 'RENAMED' },
    ]);
    const file = entries(fixture).find((button) => button.dataset['kind'] === 'file');
    expect(file?.getAttribute('title')).toBe(
      'src/change-tree-model.ts — renamed from src/tree-model.ts',
    );
  });

  it('reports the path when a file is chosen', () => {
    const fixture = render([{ path: 'a/file.txt', changeType: 'ADDED' }]);
    const seen: (string | null)[] = [];
    fixture.componentInstance.selected.subscribe((path) => seen.push(path));
    entries(fixture)
      .find((button) => button.dataset['kind'] === 'file')
      ?.click();
    fixture.detectChanges();
    expect(seen).toEqual(['a/file.txt']);
    expect(items(fixture).at(-1)?.getAttribute('aria-selected')).toBe('true');
  });

  it('never moves the selection when a directory is pressed', () => {
    const fixture = render([{ path: 'a/file.txt', changeType: 'ADDED' }], 'a/file.txt');
    const seen: (string | null)[] = [];
    fixture.componentInstance.selected.subscribe((path) => seen.push(path));

    const dir = entries(fixture).find((button) => button.dataset['kind'] === 'dir');
    dir?.click();
    fixture.detectChanges();

    // The directory folded shut, and the selection did not move with it.
    expect(seen).toEqual([]);
    expect(fixture.componentInstance.selected()).toBe('a/file.txt');
    expect(items(fixture).length).toBe(1);
    expect(items(fixture)[0].getAttribute('aria-expanded')).toBe('false');

    entries(fixture)[0].click();
    fixture.detectChanges();
    expect(items(fixture).length).toBe(2);
    expect(seen).toEqual([]);
  });

  describe('a submodule row — expandable and selectable at once', () => {
    const SUBMODULE: readonly QitsChangeEntry[] = [
      { path: 'components/qits-ci/qits-ci-service', changeType: 'MODIFIED' },
      { path: 'components/qits-ci/qits-ci-service/src/Main.java', changeType: 'ADDED' },
    ];

    function toggleButton(fixture: ComponentFixture<QitsChangeTree>): HTMLButtonElement {
      return entries(fixture).find((button) => button.dataset['kind'] === 'toggle')!;
    }

    function labelButton(fixture: ComponentFixture<QitsChangeTree>): HTMLButtonElement {
      return entries(fixture).find(
        (button) =>
          button.dataset['kind'] === 'dir' &&
          button.dataset['path'] === 'components/qits-ci/qits-ci-service',
      )!;
    }

    it('draws the directory’s own change mark, the way a file row does', () => {
      const fixture = render(SUBMODULE);
      const marks = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-change]')];
      expect(marks.map((mark) => mark.textContent)).toEqual(['M', 'A']);
      expect(labelButton(fixture).querySelector('[data-change]')?.textContent).toBe('M');
      expect(labelButton(fixture).getAttribute('title')).toBe(
        'components/qits-ci/qits-ci-service — modified',
      );
    });

    it('selects on the label and does not toggle', () => {
      const fixture = render(SUBMODULE);
      const seen: (string | null)[] = [];
      fixture.componentInstance.selected.subscribe((path) => seen.push(path));

      labelButton(fixture).click();
      fixture.detectChanges();

      expect(seen).toEqual(['components/qits-ci/qits-ci-service']);
      // Still open: choosing the row did not fold it, and its children are still drawn.
      expect(items(fixture).length).toBe(4);
      const row = items(fixture)[1];
      expect(row.getAttribute('aria-expanded')).toBe('true');
      expect(row.getAttribute('aria-selected')).toBe('true');
      expect(row.classList).toContain('qits-change-tree-selected');
    });

    it('toggles on the chevron and does not move the selection', () => {
      const fixture = render(SUBMODULE, 'components/qits-ci/qits-ci-service');
      const seen: (string | null)[] = [];
      fixture.componentInstance.selected.subscribe((path) => seen.push(path));

      toggleButton(fixture).click();
      fixture.detectChanges();

      expect(seen).toEqual([]);
      // The children are gone, and the row is still the chosen one.
      expect(items(fixture).length).toBe(2);
      expect(items(fixture)[1].getAttribute('aria-expanded')).toBe('false');
      expect(items(fixture)[1].getAttribute('aria-selected')).toBe('true');
      expect(toggleButton(fixture).getAttribute('aria-label')).toBe(
        'Expand components/qits-ci/qits-ci-service',
      );

      toggleButton(fixture).click();
      fixture.detectChanges();
      expect(items(fixture).length).toBe(4);
      expect(seen).toEqual([]);
    });

    it('keeps both actions reachable from the keyboard, inside one treeitem', () => {
      const fixture = render(SUBMODULE);
      const row = items(fixture)[1];
      const buttons = [...row.querySelectorAll('button')];
      expect(buttons.length).toBe(2);
      // Ordinary buttons: in the tab order, and neither is nested inside the other.
      expect(buttons.some((button) => button.hasAttribute('disabled'))).toBe(false);
      expect(buttons.map((button) => button.getAttribute('tabindex'))).toEqual([null, null]);
      expect(row.querySelectorAll('button button').length).toBe(0);
      // The states stay on the treeitem, not on either control.
      expect(buttons.some((button) => button.hasAttribute('aria-selected'))).toBe(false);
      expect(buttons.some((button) => button.hasAttribute('aria-expanded'))).toBe(false);
    });

    it('leaves a plain directory with its one toggle-only control', () => {
      const fixture = render([{ path: 'a/file.txt', changeType: 'ADDED' }]);
      const dir = items(fixture)[0];
      expect(dir.querySelectorAll('button').length).toBe(1);
      expect(dir.getAttribute('aria-selected')).toBe('false');
    });
  });

  it('says so when nothing changed', () => {
    expect((render([]).nativeElement as HTMLElement).textContent).toContain('No files changed.');
  });
});
