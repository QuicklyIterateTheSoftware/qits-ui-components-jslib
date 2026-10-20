/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { UiComponentsFeature } from './blocks';

/**
 * Every library symbol through which an application makes one of the library's calls, and the
 * features that call belongs to. A source naming one of these turns the feature on, wherever in
 * `src/app` it does so; `uiComponentsPact`'s guard fails when the pacts it wrote miss one.
 *
 * The client classes are root-provided, so they "resolve" in any application: only their use in
 * the sources says the application reads through them. The `provideQits*` functions are checked
 * against what the application's config really provides.
 */
export const UI_COMPONENTS_CALLING_SYMBOLS: Readonly<
  Record<string, readonly UiComponentsFeature[]>
> = {
  provideQitsNavigation: ['NAVIGATION'],
  provideQitsProjects: ['PROJECTS', 'REPOSITORIES'],
  provideQitsRepositories: ['REPOSITORIES'],
  QitsProjectRepositoryLookup: ['REPOSITORIES'],
  provideQitsBuilds: ['ACTIVE_RUNS'],
  QitsReportsClient: ['RUN_REPORTS'],
  QitsRunReports: ['RUN_REPORTS'],
  '<qits-run-reports': ['RUN_REPORTS'],
  provideQitsStandardReportKinds: ['SOURCE_FILE', 'RAW_FILE'],
  provideQitsStandardFailureInsights: ['SOURCE_FILE'],
  QitsCodePreviewInsight: ['SOURCE_FILE'],
  QitsCodePreview: ['SOURCE_FILE'],
  '<qits-code-preview': ['SOURCE_FILE'],
  QitsSourceFiles: ['SOURCE_FILE'],
  provideQitsScreenshotsReportKind: ['RAW_FILE'],
  QITS_SCREENSHOTS_REPORT_KIND: ['RAW_FILE'],
  QitsScreenshotsReport: ['RAW_FILE'],
  '<qits-screenshots-report': ['RAW_FILE'],
  QitsRepositoryRawClient: ['RAW_FILE'],
};

/** One calling symbol, where a source uses it. */
export interface UiComponentsSymbolUse {
  readonly symbol: string;
  /** Relative to the cwd. */
  readonly file: string;
}

/** Specs and stories stand in for the library's clients; they are not the application's use. */
const NOT_APPLICATION = /\.(spec|stories)\.ts$/;

/**
 * Every use of a {@link UI_COMPONENTS_CALLING_SYMBOLS} symbol in the `.ts` and `.html` files under
 * `sources` (the application's `src/app`), comments left out: a comment that names a provider is
 * prose, not a call. Specs and stories are skipped.
 */
export function uiComponentsSymbolUses(sources: string): UiComponentsSymbolUse[] {
  const uses: UiComponentsSymbolUse[] = [];
  for (const file of files(sources)) {
    const code = withoutComments(readFileSync(file, 'utf8'), file.endsWith('.html'));
    for (const symbol of Object.keys(UI_COMPONENTS_CALLING_SYMBOLS)) {
      if (used(code, symbol)) uses.push({ symbol, file: relative(process.cwd(), file) });
    }
  }
  return uses;
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|html)$/.test(name) && !NOT_APPLICATION.test(name)) out.push(path);
  }
  return out;
}

/** A tag (`<qits-run-reports`) by its opening, any other symbol as a whole identifier. */
function used(code: string, symbol: string): boolean {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = symbol.startsWith('<')
    ? new RegExp(`${escaped}(?![\\w-])`)
    : new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`);
  return pattern.test(code);
}

/**
 * `source` with its comments blanked: `<!-- -->` in a template, `//` and `/* *\/` in TypeScript,
 * where string and template literals are stepped over so a `//` in a URL is not taken for one.
 * Literals stay: an inline template is a string, and `<qits-run-reports` in it is a use.
 */
export function withoutComments(source: string, html: boolean): string {
  if (html) return source.replace(/<!--[\s\S]*?-->/g, ' ');
  let out = '';
  for (let i = 0; i < source.length;) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      out += ' ';
    } else if (c === '"' || c === "'" || c === '`') {
      const start = i++;
      while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
      out += source.slice(start, ++i);
    } else {
      out += c;
      i++;
    }
  }
  return out;
}
