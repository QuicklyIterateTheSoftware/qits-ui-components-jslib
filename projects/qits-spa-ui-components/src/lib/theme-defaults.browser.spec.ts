import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QitsBadge } from './badge';
import { QitsButton } from './button';
import { QitsCard } from './card';

/**
 * The no-theme proof (ticket qits-2085): an app that never loads `theme.css` keeps today's light
 * look. With the test build's stylesheet (Tailwind and the theme) switched off, the components'
 * `@property` registrations (`QITS_THEME_DEFAULTS`, through Angular's emulated encapsulation) are
 * all that defines the tokens, and every colour computes to the literal the component painted
 * before it had tokens. Then, with the stylesheet back, the theme's `data-theme` decides the card's
 * surface. No screenshots: the colours are compared value by value.
 */
@Component({
  imports: [QitsBadge, QitsButton, QitsCard],
  template: `
    <qits-badge label="QUEUED" tone="neutral" />
    <qits-badge label="RUNNING" tone="info" />
    <qits-badge label="SUCCESS" tone="success" />
    <qits-badge label="FLAKY" tone="warning" />
    <qits-badge label="FAILED" tone="danger" />
    <qits-badge label="REFINED" tone="highlight" />
    <qits-button variant="primary">Primary</qits-button>
    <qits-button variant="secondary">Secondary</qits-button>
    <qits-button variant="ghost">Ghost</qits-button>
    <qits-card heading="Latest run" subheading="main @ 18f7422">Body</qits-card>
  `,
})
class Everything {}

/** The light colours each badge tone painted before the theme: background, text, border. */
const BADGE_TONES: Readonly<Record<string, readonly [string, string, string]>> = {
  neutral: ['rgb(243, 244, 246)', 'rgb(55, 65, 81)', 'rgb(229, 231, 235)'],
  info: ['rgb(239, 246, 255)', 'rgb(29, 78, 216)', 'rgb(191, 219, 254)'],
  success: ['rgb(236, 253, 245)', 'rgb(4, 120, 87)', 'rgb(167, 243, 208)'],
  warning: ['rgb(255, 251, 235)', 'rgb(180, 83, 9)', 'rgb(253, 230, 138)'],
  danger: ['rgb(254, 242, 242)', 'rgb(185, 28, 28)', 'rgb(254, 202, 202)'],
  highlight: ['rgb(245, 243, 255)', 'rgb(109, 40, 217)', 'rgb(221, 214, 254)'],
};

const WHITE = 'rgb(255, 255, 255)';

/** The test build's global stylesheet (`styles.css`: Tailwind, the theme, the test font). */
function testStylesheet(): HTMLLinkElement {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="stylesheet"][href$="styles.css"]',
  );
  if (!link) throw new Error('the test build loads no styles.css');
  return link;
}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(Everything);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function style(root: HTMLElement, selector: string): CSSStyleDeclaration {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`nothing matches ${selector}`);
  return getComputedStyle(element);
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('the components without theme.css', () => {
  beforeAll(() => {
    testStylesheet().disabled = true;
  });

  afterAll(() => {
    testStylesheet().disabled = false;
  });

  it('defines no token on the page: the stylesheet is really off', () => {
    expect(
      getComputedStyle(document.documentElement).getPropertyValue('--color-charcoal-brown-950'),
    ).toBe('');
    expect(getComputedStyle(document.documentElement).getPropertyValue('--qits-color-scheme')).toBe(
      '',
    );
  });

  it('paints every badge tone in its light literals', () => {
    const root = render();
    for (const [tone, [background, color, border]] of Object.entries(BADGE_TONES)) {
      const badge = style(root, `.qits-badge-${tone}`);
      expect.soft(badge.backgroundColor, `${tone} background`).toBe(background);
      expect.soft(badge.color, `${tone} text`).toBe(color);
      expect.soft(badge.borderTopColor, `${tone} border`).toBe(border);
    }
  });

  it('paints every button variant in its light literals', () => {
    const root = render();
    const primary = style(root, '.qits-button-primary');
    expect(primary.backgroundColor).toBe('rgb(31, 41, 55)');
    expect(primary.color).toBe('rgb(249, 250, 251)');
    const secondary = style(root, '.qits-button-secondary');
    expect(secondary.backgroundColor).toBe('rgb(243, 244, 246)');
    expect(secondary.color).toBe('rgb(17, 24, 39)');
    expect(secondary.borderTopColor).toBe('rgb(209, 213, 219)');
    const ghost = style(root, '.qits-button-ghost');
    expect(ghost.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(ghost.color).toBe('rgb(31, 41, 55)');
  });

  it('paints the card in its light literals', () => {
    const root = render();
    const card = style(root, '.qits-card');
    expect(card.backgroundColor).toBe(WHITE);
    expect(card.borderTopColor).toBe('rgb(229, 231, 235)');
    expect(style(root, '.qits-card-header').borderBottomColor).toBe('rgb(243, 244, 246)');
    expect(style(root, '.qits-card-title').color).toBe('rgb(17, 24, 39)');
    expect(style(root, '.qits-card-subtitle').color).toBe('rgb(107, 114, 128)');
  });

  it('stays light under data-theme="dark": without the theme the attribute means nothing', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const root = render();
    expect(style(root, '.qits-card').backgroundColor).toBe(WHITE);
    expect(style(root, '.qits-badge-neutral').backgroundColor).toBe('rgb(243, 244, 246)');
  });
});

describe('the components with theme.css', () => {
  /** What the theme's dark surface (`--color-charcoal-brown-950`) computes to as a background. */
  function darkSurface(root: HTMLElement): string {
    const probe = document.createElement('div');
    probe.style.background = 'var(--color-charcoal-brown-950)';
    root.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }

  it('paints the card white under data-theme="light"', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const root = render();
    expect(style(root, '.qits-card').backgroundColor).toBe(WHITE);
  });

  it('paints the card the dark surface under data-theme="dark"', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const root = render();
    const background = style(root, '.qits-card').backgroundColor;
    expect(background).not.toBe(WHITE);
    expect(background).not.toBe('');
    expect(background).toBe(darkSurface(root));
  });
});
