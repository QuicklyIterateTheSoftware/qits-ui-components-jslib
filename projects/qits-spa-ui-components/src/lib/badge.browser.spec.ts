import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { QitsBadge } from './badge';

/** Screenshots of the badge, one of each tone side by side. */
@Component({
  imports: [QitsBadge],
  host: { style: 'display: flex; gap: 8px; padding: 8px; width: max-content' },
  template: `
    <qits-badge label="QUEUED" tone="neutral" />
    <qits-badge label="RUNNING" tone="info" />
    <qits-badge label="SUCCESS" tone="success" />
    <qits-badge label="FLAKY" tone="warning" />
    <qits-badge label="FAILED" tone="danger" />
    <qits-badge label="REFINED" tone="highlight" />
  `,
})
class EveryTone {}

describe('QitsBadge (screenshots)', () => {
  it('paints every tone', async () => {
    const fixture = TestBed.createComponent(EveryTone);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchScreenshot('every-tone', { kind: 'DATA' });
  });
});
