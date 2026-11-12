import type { Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { expect } from 'vitest';
import { page, type Locator } from 'vitest/browser';

/**
 * How long the specs wait for something asynchronous to land (a fake answer, mermaid's first load):
 * well over `expect.poll`'s 1 s default, which mermaid's first import alone can take.
 */
export const WAIT_MS = 10_000;

/** A mounted component and the locator its screenshot is taken of. */
export interface Mounted<T> {
  readonly fixture: ComponentFixture<T>;
  readonly host: HTMLElement;
  /**
   * The host's locator, made afresh on every call: Vitest's `elementLocator` describes the element
   * by what it shows at that moment, so one made before an answer lands no longer finds it after.
   */
  readonly view: () => Locator;
}

/**
 * Mounts `type` with `inputs` set, the way the browser screenshot specs shoot a component: its host
 * element is what the screenshot frames, so `style` (default a little padding, so a border or a
 * shadow at the edge is in the shot) goes on the host. Waits for the application to be stable.
 */
export async function mount<T>(
  type: Type<T>,
  inputs: Readonly<Record<string, unknown>> = {},
  style = 'display: block; padding: 8px',
): Promise<Mounted<T>> {
  const fixture = TestBed.createComponent(type);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const host = fixture.nativeElement as HTMLElement;
  host.setAttribute('style', style);
  fixture.detectChanges();
  await fixture.whenStable();
  return {
    fixture,
    host,
    view: () => page.elementLocator(host),
  };
}

/** Waits until `host` shows `text` (Vitest's text locators are fixed when they are made). */
export async function showing(host: Element, text: string): Promise<void> {
  await expect.poll(() => host.textContent ?? '', { timeout: WAIT_MS }).toContain(text);
}

/**
 * Forces the page's theme to `scheme` (`data-theme` on `<html>`), for a component that redraws
 * asynchronously when the scheme changes (mermaid): the spec waits for the redraw itself and then
 * takes that scheme's shot alone (`colorSchemes: [scheme]`), which the harness then takes without
 * a switch. `clearScheme()` (after each test) gives the page back.
 */
export function forceScheme(scheme: 'LIGHT' | 'DARK'): void {
  document.documentElement.setAttribute('data-theme', scheme.toLowerCase());
}

export function clearScheme(): void {
  document.documentElement.removeAttribute('data-theme');
}
