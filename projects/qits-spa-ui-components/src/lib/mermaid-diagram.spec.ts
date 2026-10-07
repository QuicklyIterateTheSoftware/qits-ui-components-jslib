import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { QITS_MERMAID_LOADER, QitsMermaidDiagram, type QitsMermaid } from './mermaid-diagram';

const DEFINITION = 'erDiagram\n  ci_run {\n    uuid id PK "not null"\n  }\n';

/** A stand-in for mermaid's default export; `render` answers with a marked SVG unless told off. */
function stubMermaid(render?: QitsMermaid['render']) {
  return {
    initialize: vi.fn<QitsMermaid['initialize']>(),
    render: vi.fn<QitsMermaid['render']>(
      render ??
        (async (id, definition) => ({
          svg: `<svg data-id="${id}"><text>${definition.split('\n')[0]}</text></svg>`,
        })),
    ),
  };
}

/** Lets the lazy load and the render settle, then draws what they set. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function element(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('QitsMermaidDiagram', () => {
  let mermaid: ReturnType<typeof stubMermaid>;
  let load: ReturnType<typeof vi.fn<() => Promise<QitsMermaid>>>;

  function setup(stub = stubMermaid()): ComponentFixture<QitsMermaidDiagram> {
    mermaid = stub;
    load = vi.fn(async () => stub as QitsMermaid);
    TestBed.configureTestingModule({
      providers: [{ provide: QITS_MERMAID_LOADER, useValue: load }],
    });
    const fixture = TestBed.createComponent(QitsMermaidDiagram);
    fixture.componentRef.setInput('definition', DEFINITION);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the definition through mermaid in strict mode and puts the SVG in place', async () => {
    const fixture = setup();
    expect(element(fixture).querySelector('.drawing')?.textContent).toContain('Drawing diagram');
    await settle(fixture);

    expect(load).toHaveBeenCalledTimes(1);
    expect(mermaid.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
    });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    const [id, definition] = mermaid.render.mock.calls[0];
    expect(id).toMatch(/^qits-mermaid-\d+$/);
    expect(definition).toBe(DEFINITION);

    const diagram = element(fixture).querySelector<HTMLElement>('.diagram');
    expect(diagram?.hidden).toBe(false);
    expect(diagram?.querySelector('svg')?.getAttribute('data-id')).toBe(id);
    expect(diagram?.getAttribute('role')).toBe('img');
    expect(element(fixture).querySelector('pre')).toBeNull();
    expect(element(fixture).querySelector('.drawing')).toBeNull();
  });

  it('falls back to the definition as text when mermaid rejects it, and does not throw', async () => {
    const fixture = setup(
      stubMermaid(async (id) => {
        // What mermaid does on a failed render: its scratch container stays in the body.
        const scratch = document.createElement('div');
        scratch.id = `d${id}`;
        document.body.appendChild(scratch);
        throw new Error('Parse error on line 2');
      }),
    );
    await settle(fixture);
    expect(document.getElementById(`d${mermaid.render.mock.calls[0][0]}`)).toBeNull();
    expect(element(fixture).querySelector('pre.definition')?.textContent).toBe(DEFINITION);
    expect(element(fixture).querySelector<HTMLElement>('.diagram')?.hidden).toBe(true);
  });

  it('falls back to text when mermaid cannot be loaded at all', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: QITS_MERMAID_LOADER,
          useValue: () => Promise.reject(new Error('chunk failed to load')),
        },
      ],
    });
    const fixture = TestBed.createComponent(QitsMermaidDiagram);
    fixture.componentRef.setInput('definition', DEFINITION);
    fixture.detectChanges();
    await settle(fixture);
    expect(element(fixture).querySelector('pre.definition')?.textContent).toBe(DEFINITION);
  });

  it('shows a blank definition as text without loading mermaid', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('definition', '   ');
    fixture.detectChanges();
    await settle(fixture);
    expect(element(fixture).querySelector('pre.definition')).not.toBeNull();
    expect(mermaid.render).not.toHaveBeenCalledWith(expect.anything(), '   ');
  });

  it('re-renders when the definition changes, and keeps only the newest drawing', async () => {
    const fixture = setup();
    await settle(fixture);
    fixture.componentRef.setInput('definition', 'erDiagram\n  ci_step {\n  }\n');
    fixture.detectChanges();
    await settle(fixture);
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(mermaid.render.mock.calls[1][1]).toBe('erDiagram\n  ci_step {\n  }\n');
    expect(element(fixture).querySelectorAll('.diagram svg')).toHaveLength(1);
    expect(element(fixture).querySelector('.diagram svg')?.getAttribute('data-id')).toBe(
      mermaid.render.mock.calls[1][0],
    );
  });

  it('draws in the dark theme where the host prefers a dark scheme', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      const fixture = setup();
      await settle(fixture);
      expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
    } finally {
      window.matchMedia = original;
    }
  });

  it('does not import mermaid when it is not rendered', async () => {
    @Component({
      selector: 'qits-spec-mermaid-host',
      changeDetection: ChangeDetectionStrategy.OnPush,
      imports: [QitsMermaidDiagram],
      template: `@if (shown()) {
        <qits-mermaid-diagram [definition]="definition" />
      }`,
    })
    class Host {
      readonly shown = signal(false);
      readonly definition = DEFINITION;
    }

    const stub = stubMermaid();
    const loader = vi.fn(async () => stub as QitsMermaid);
    TestBed.configureTestingModule({
      providers: [{ provide: QITS_MERMAID_LOADER, useValue: loader }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await settle(fixture);
    expect(loader).not.toHaveBeenCalled();

    fixture.componentInstance.shown.set(true);
    fixture.detectChanges();
    await settle(fixture);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(stub.render).toHaveBeenCalledWith(expect.any(String), DEFINITION);
  });
});
