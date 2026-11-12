import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { QitsButton } from './button';

/** Screenshots of the button: every variant at every size, then disabled and busy. */
@Component({
  imports: [QitsButton],
  host: { style: 'display: grid; gap: 8px; padding: 8px; width: max-content' },
  template: `
    @for (variant of variants; track variant) {
      <div style="display: flex; align-items: center; gap: 8px">
        @for (size of sizes; track size) {
          <qits-button [variant]="variant" [size]="size"
            >Re-run {{ variant }} {{ size }}</qits-button
          >
        }
      </div>
    }
  `,
})
class EveryVariant {
  readonly variants = ['primary', 'secondary', 'ghost'] as const;
  readonly sizes = ['sm', 'md', 'lg'] as const;
}

@Component({
  imports: [QitsButton],
  host: { style: 'display: flex; gap: 8px; padding: 8px; width: max-content' },
  template: `
    <qits-button disabled>Disabled</qits-button>
    <qits-button variant="secondary" disabled>Disabled</qits-button>
    <qits-button busy>Working…</qits-button>
  `,
})
class Inert {}

describe('QitsButton (screenshots)', () => {
  it('paints every variant at every size', async () => {
    const fixture = TestBed.createComponent(EveryVariant);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchScreenshot('every-variant', { kind: 'DATA' });
  });

  it('dims a disabled and a busy button', async () => {
    const fixture = TestBed.createComponent(Inert);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchScreenshot('inert', { kind: 'DATA' });
  });
});
