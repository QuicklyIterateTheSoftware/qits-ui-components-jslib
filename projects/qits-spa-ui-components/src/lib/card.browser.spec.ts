import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { QitsBadge } from './badge';
import { QitsButton } from './button';
import { QitsCard } from './card';

/** Screenshots of the card: titled with an action, elevated, and untitled. */
@Component({
  imports: [QitsBadge, QitsButton, QitsCard],
  host: { style: 'display: grid; gap: 16px; padding: 16px; width: 360px' },
  template: `
    <qits-card heading="Latest run" subheading="main @ 18f7422">
      <qits-button qitsCardActions size="sm" variant="secondary">Re-run</qits-button>
      <qits-badge label="SUCCESS" tone="success" />
    </qits-card>
    <qits-card heading="Latest run" subheading="main @ 18f7422" elevated>
      <qits-button qitsCardActions size="sm" variant="secondary">Re-run</qits-button>
      <qits-badge label="SUCCESS" tone="success" />
    </qits-card>
    <qits-card>Nothing here needs a title.</qits-card>
  `,
})
class Cards {}

describe('QitsCard (screenshots)', () => {
  it('frames a titled, an elevated and an untitled card', async () => {
    const fixture = TestBed.createComponent(Cards);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchScreenshot('cards', { kind: 'DATA' });
  });
});
