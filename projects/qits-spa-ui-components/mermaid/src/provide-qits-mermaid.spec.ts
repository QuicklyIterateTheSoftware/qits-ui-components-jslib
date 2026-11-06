import { TestBed } from '@angular/core/testing';
import { QITS_MERMAID_LOADER } from '@qits/ui-components';

import { provideQitsMermaid } from './provide-qits-mermaid';

describe('provideQitsMermaid', () => {
  it('installs an async loader, distinct from the main entry point default', () => {
    // The main entry point's own default factory (qits-1910) never imports mermaid: it is a plain,
    // synchronous function that returns an already-rejected promise. This one does the real
    // `import('mermaid')`, so it has to be async — checked by shape, not by actually loading
    // mermaid, which would be slow and pointless to redo here.
    const withoutProvider = TestBed.inject(QITS_MERMAID_LOADER);
    expect(withoutProvider.constructor.name).toBe('Function');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideQitsMermaid()] });
    const load = TestBed.inject(QITS_MERMAID_LOADER);

    expect(typeof load).toBe('function');
    expect(load).not.toBe(withoutProvider);
    expect(load.constructor.name).toBe('AsyncFunction');
  });
});
