import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  Injector,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { provideQitsWorkBriefs, type QitsWorkBrief, type QitsWorkBriefSource } from './work-briefs';
import { qitsLinkWorkIds, QitsWorkRefs } from './work-refs';

function brief(qualifiedId: string, overrides: Partial<QitsWorkBrief> = {}): QitsWorkBrief {
  return {
    id: `uuid-${qualifiedId}`,
    qualifiedId,
    archetype: 'TICKET',
    status: 'READY_FOR_DEV',
    title: `The title of ${qualifiedId}`,
    updatedAt: '2026-11-06T11:29:56.962030Z',
    ...overrides,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Rendered markdown, as a page would bind it to `[innerHTML]`. */
const MARKDOWN =
  '<h2>Plan</h2><p>Follows qits-1897, see <a href="/x">qits-1</a>.</p>' +
  '<p>Inline <code>qits-2</code> and:</p><pre><code>git log --grep qits-404\n</code></pre>' +
  '<p>Not ids: fx-1, qits-1897x, other-qits-1.</p>';

/** What reads on the page: the text with every (closed) panel left out. */
function visibleText(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.qits-work-ref-panel').forEach((panel) => panel.remove());
  return copy.textContent ?? '';
}

describe('qitsLinkWorkIds', () => {
  let source: ReturnType<typeof vi.fn<QitsWorkBriefSource>>;
  let roots: HTMLElement[] = [];

  function configure(
    answer: QitsWorkBriefSource = async (_p, ids) =>
      ids.filter((id) => id !== 'qits-404').map((id) => brief(id)),
    platform = 'browser',
  ): Injector {
    source = vi.fn<QitsWorkBriefSource>(answer);
    TestBed.configureTestingModule({
      providers: [provideQitsWorkBriefs(source), { provide: PLATFORM_ID, useValue: platform }],
    });
    return TestBed.inject(Injector);
  }

  function root(html: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.append(el);
    roots.push(el);
    return el;
  }

  async function settled(): Promise<void> {
    await settle();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  afterEach(() => {
    roots.forEach((el) => el.remove());
    roots = [];
  });

  const refs = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('qits-work-ref')];
  const triggers = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.qits-work-ref')];

  it('splits a text node into its text and a reference', async () => {
    const injector = configure();
    const el = root('<p>Follows qits-1897 closely.</p>');
    qitsLinkWorkIds(el, 'qits', injector);
    const p = el.querySelector('p') as HTMLElement;
    expect([...p.childNodes].map((node) => node.nodeName)).toEqual([
      '#text',
      'QITS-WORK-REF',
      '#text',
    ]);
    expect(p.firstChild?.textContent).toBe('Follows ');
    expect(p.lastChild?.textContent).toBe(' closely.');
    // Plain text at once, a reference once the brief lands.
    expect(refs(el)[0].textContent).toBe('qits-1897');
    await settled();
    expect(triggers(el).map((t) => t.textContent)).toEqual(['qits-1897']);
    expect(el.querySelector('[role="tooltip"]')?.textContent).toContain('The title of qits-1897');
  });

  it('links ids in code and pre, leaves links and foreign or partial ids alone', async () => {
    const injector = configure();
    const el = root(MARKDOWN);
    qitsLinkWorkIds(el, 'qits', injector);
    await settled();
    expect(refs(el).map((ref) => ref.textContent)).toEqual([
      expect.stringContaining('qits-1897'),
      expect.stringContaining('qits-2'),
      'qits-404',
    ]);
    expect(el.querySelector('code qits-work-ref')).not.toBeNull();
    expect(el.querySelector('pre code qits-work-ref')?.textContent).toBe('qits-404');
    expect(el.querySelector('a[href="/x"]')?.outerHTML).toBe('<a href="/x">qits-1</a>');
    expect(el.querySelector('p:last-child')?.innerHTML).toBe(
      'Not ids: fx-1, qits-1897x, other-qits-1.',
    );
    expect(visibleText(el)).toBe(root(MARKDOWN).textContent);
  });

  it('draws an id it has no brief for as plain text, without a wrapper', async () => {
    const injector = configure();
    const el = root('<pre><code>qits-404</code></pre>');
    qitsLinkWorkIds(el, 'qits', injector);
    await settled();
    const ref = refs(el)[0];
    expect(ref.textContent).toBe('qits-404');
    expect(ref.querySelector('span, a, [role]')).toBeNull();
    expect(el.querySelector('.qits-work-ref, .qits-work-ref-panel')).toBeNull();
  });

  it('leaves the HTML byte-identical without a project, and off the browser', async () => {
    const injector = configure();
    const el = root(MARKDOWN);
    const before = el.innerHTML;
    const undo = qitsLinkWorkIds(el, undefined, injector);
    qitsLinkWorkIds(el, '', injector);
    await settled();
    expect(el.innerHTML).toBe(before);
    undo();
    expect(el.innerHTML).toBe(before);
    expect(source).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const server = configure(undefined, 'server');
    const rendered = root(MARKDOWN);
    qitsLinkWorkIds(rendered, 'qits', server);
    await settle();
    expect(rendered.innerHTML).toBe(before);
    expect(source).not.toHaveBeenCalled();
  });

  it('asks once for the ids of every root linked in one tick', async () => {
    const injector = configure();
    qitsLinkWorkIds(root('<p>qits-1 and qits-2</p>'), 'qits', injector);
    qitsLinkWorkIds(root('<p><code>qits-3</code>, qits-1 again</p>'), 'qits', injector);
    await settled();
    expect(source).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledWith('qits', ['qits-1', 'qits-2', 'qits-3']);
  });

  it('draws nothing twice when a root is linked again', async () => {
    const injector = configure();
    const el = root('<p>qits-1 and qits-2</p>');
    qitsLinkWorkIds(el, 'qits', injector);
    await settled();
    qitsLinkWorkIds(el, 'qits', injector);
    await settled();
    expect(refs(el)).toHaveLength(2);
    expect(el.querySelector('qits-work-ref qits-work-ref')).toBeNull();
  });

  it('undoes it: every reference destroyed, its text restored, a second call harmless', async () => {
    const injector = configure();
    const el = root(MARKDOWN);
    const before = el.innerHTML;
    const undo = qitsLinkWorkIds(el, 'qits', injector);
    await settled();
    expect(refs(el)).toHaveLength(3);
    undo();
    expect(refs(el)).toHaveLength(0);
    expect(el.innerHTML).toBe(before);
    expect(el.querySelector('p')?.childNodes).toHaveLength(3); // text, the link, text: merged
    undo();
    expect(el.innerHTML).toBe(before);
  });
});

@Component({
  imports: [QitsWorkRefs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="markdown"
    [innerHTML]="html()"
    [qitsWorkRefs]="project()"
    [qitsWorkRefsHtml]="html()"
  ></div>`,
})
class Host {
  readonly html = signal(MARKDOWN);
  readonly project = signal<string | undefined>('qits');
}

@Component({
  imports: [QitsWorkRefs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (shown()) {
    <div
      class="markdown"
      [innerHTML]="html"
      [qitsWorkRefs]="'qits'"
      [qitsWorkRefsHtml]="html"
    ></div>
  }`,
})
class Toggled {
  readonly html = '<p>qits-1</p>';
  readonly shown = signal(true);
}

describe('QitsWorkRefs', () => {
  let fixture: ComponentFixture<Host>;
  let source: ReturnType<typeof vi.fn<QitsWorkBriefSource>>;

  function configure(): void {
    source = vi.fn<QitsWorkBriefSource>(async (_p, ids) => ids.map((id) => brief(id)));
    TestBed.configureTestingModule({
      providers: [provideQitsWorkBriefs(source)],
    });
  }

  /** `null` renders without a project (`undefined` would take the default). */
  async function render(project: string | null = 'qits'): Promise<void> {
    configure();
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.project.set(project ?? undefined);
    await changed();
  }

  async function changed(): Promise<void> {
    fixture.detectChanges();
    await settle();
    await fixture.whenStable();
  }

  const markdown = () =>
    (fixture.nativeElement as HTMLElement).querySelector('.markdown') as HTMLElement;
  const refs = () => [...markdown().querySelectorAll('qits-work-ref')];

  it('links the ids of the HTML bound to innerHTML, in one request', async () => {
    await render();
    expect(source).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledWith('qits', ['qits-1897', 'qits-2', 'qits-404']);
    expect([...markdown().querySelectorAll('.qits-work-ref')].map((t) => t.textContent)).toEqual([
      'qits-1897',
      'qits-2',
      'qits-404',
    ]);
    expect(markdown().querySelector('a[href="/x"]')?.textContent).toBe('qits-1');
  });

  it('re-links new HTML without leaving a duplicate behind', async () => {
    await render();
    fixture.componentInstance.html.set('<p>Now qits-7 and <code>qits-8</code>.</p>');
    await changed();
    expect(refs().map((ref) => ref.querySelector('.qits-work-ref')?.textContent)).toEqual([
      'qits-7',
      'qits-8',
    ]);
    // Nothing changed: nothing is linked again.
    await changed();
    expect(refs()).toHaveLength(2);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('restores the text when the project goes, and links for a new one', async () => {
    await render();
    fixture.componentInstance.project.set(undefined);
    await changed();
    expect(refs()).toHaveLength(0);
    expect(markdown().innerHTML).toBe(MARKDOWN);
    fixture.componentInstance.project.set('qits');
    await changed();
    expect(refs()).toHaveLength(3);
  });

  it('leaves the HTML byte-identical without a project', async () => {
    await render(null);
    expect(markdown().innerHTML).toBe(MARKDOWN);
    expect(source).not.toHaveBeenCalled();
  });

  it('destroys its references with it', async () => {
    configure();
    const toggled = TestBed.createComponent(Toggled);
    toggled.detectChanges();
    await settle();
    await toggled.whenStable();
    const appRef = TestBed.inject(ApplicationRef);
    const ref = (toggled.nativeElement as HTMLElement).querySelector('qits-work-ref');
    expect(ref?.querySelector('.qits-work-ref')).not.toBeNull();
    const attached = appRef.viewCount;
    toggled.componentInstance.shown.set(false);
    toggled.detectChanges();
    await toggled.whenStable();
    expect((toggled.nativeElement as HTMLElement).querySelector('qits-work-ref')).toBeNull();
    expect(appRef.viewCount).toBe(attached - 1);
  });
});
