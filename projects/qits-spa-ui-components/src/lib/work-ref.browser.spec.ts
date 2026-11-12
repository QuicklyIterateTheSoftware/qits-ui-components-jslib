import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { provideQitsWorkBriefs, type QitsWorkBrief } from './work-briefs';
import { QitsWorkRef } from './work-ref';

/**
 * Screenshots of a work reference: the dotted id in a sentence, and the brief it opens on focus. The
 * brief is given, so nothing is read; the brief's age is measured against a fixed clock.
 */
const NOW = Date.parse('2026-11-12T10:00:00Z');

const BRIEF: QitsWorkBrief = {
  id: '6f1d1c1e-0000-4000-8000-000000001897',
  qualifiedId: 'qits-1897',
  archetype: 'TASK',
  status: 'IMPLEMENTING',
  title: 'Paint every component with theme tokens, registered with light defaults',
  updatedAt: new Date(NOW - 3 * 3600 * 1000).toISOString(),
};

@Component({
  imports: [QitsWorkRef],
  host: { style: 'display: block; padding: 8px; width: 420px; font-size: 14px' },
  template: `<p style="margin: 0">
    Fixes <qits-work-ref project="qits" qualifiedId="qits-1897" [brief]="brief" /> for good.
  </p>`,
})
class Sentence {
  readonly brief = BRIEF;
}

describe('QitsWorkRef (screenshots)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // Never asked: the brief is given. A source that answers nothing, so no request is possible.
    TestBed.configureTestingModule({ providers: [provideQitsWorkBriefs(async () => [])] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the id in its sentence', async () => {
    const fixture = TestBed.createComponent(Sentence);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchScreenshot('closed', { kind: 'DATA' });
  });

  it('opens the brief on focus', async () => {
    const fixture = TestBed.createComponent(Sentence);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLElement>('.qits-work-ref')?.focus();
    fixture.detectChanges();
    const box = page.elementLocator(host).getByRole('tooltip');
    await expect.element(box).toBeVisible();
    await expect.element(box).toMatchScreenshot('brief', { kind: 'DATA' });
  });
});
