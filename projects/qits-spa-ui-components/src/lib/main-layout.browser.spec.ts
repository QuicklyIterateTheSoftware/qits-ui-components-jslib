import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { mount, showing } from '../testing/browser/mount';
import { QITS_BROWSER_ORIGIN } from './app-links';
import { QitsMainLayout } from './main-layout';
import { provideQitsNavigationLinks, type QitsNavLink } from './navigation';

/**
 * Screenshots of the main layout with literal navigation links (no request is made): the side
 * navigation at a wide viewport, and at a phone's width the bar closed and the menu open. The
 * layout fills the viewport's height, so each test sets the viewport it is shot at.
 */
const LINKS: readonly QitsNavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'CI', href: '/ci/' },
  { label: 'Deployments', href: '/platform-deployments/' },
  { label: 'Artifacts', href: '/artifacts/' },
  { label: 'Projects', href: '/projects/' },
];

const WIDE = { width: 800, height: 600 };
const NARROW = { width: 390, height: 640 };

/** The test-browser target's own viewport (`angular.json`), tall so a long report is shot whole. */
const OWN = { width: 800, height: 3000 };

describe('QitsMainLayout (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideQitsNavigationLinks(LINKS),
        { provide: QITS_BROWSER_ORIGIN, useValue: 'https://projects.dev.example.com' },
      ],
    });
  });

  afterEach(async () => {
    await page.viewport(OWN.width, OWN.height);
  });

  it('draws the side navigation at a wide viewport', async () => {
    await page.viewport(WIDE.width, WIDE.height);
    const { host, view } = await mount(QitsMainLayout, { brand: 'qits' }, 'display: block');
    await showing(host, 'Deployments');
    await expect.element(view()).toMatchScreenshot('wide', { kind: 'DATA' });
  });

  it('draws the bar with the menu closed at a phone width', async () => {
    await page.viewport(NARROW.width, NARROW.height);
    const { view } = await mount(QitsMainLayout, { brand: 'qits' }, 'display: block');
    await expect.element(view()).toMatchScreenshot('narrow-closed', { kind: 'DATA' });
  });

  it('opens the menu at a phone width', async () => {
    await page.viewport(NARROW.width, NARROW.height);
    const { fixture, view } = await mount(QitsMainLayout, { brand: 'qits' }, 'display: block');
    await view().getByRole('button', { name: 'Toggle navigation' }).click();
    await fixture.whenStable();
    await expect.element(view().getByRole('link', { name: 'Deployments' })).toBeVisible();
    await expect.element(view()).toMatchScreenshot('narrow-open', { kind: 'DATA' });
  });
});
