import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

import type { QitsTestFailure } from '../test-results-report';

/**
 * What a failing test is, in the terms an insight or an action decides by: the language and the
 * tool that ran it, the shape qits-ci recorded, and a category a classifier may refine the shape
 * into. The standard classifier's category is the shape, lower-cased — `assertion`, `timeout`.
 */
export interface QitsFailureKind {
  readonly language: string;
  readonly tool: string;
  readonly shape: string;
  readonly category: string;
}

/**
 * Decides what a failure is, or declines with `null`. A failure no classifier answers for is
 * **unclassified**, and an unclassified failure gets no insight area at all — nothing is drawn for
 * a language or tool this library has never been taught about.
 */
export interface QitsFailureClassifier {
  readonly id: string;
  classify(failure: QitsTestFailure): QitsFailureKind | null;
}

/** Every registered classifier, in registration order. Multi; empty until one is provided. */
export const QITS_FAILURE_CLASSIFIERS = new InjectionToken<readonly QitsFailureClassifier[]>(
  'QITS_FAILURE_CLASSIFIERS',
);

/** Register one classifier — asked after every classifier registered before it. */
export function provideQitsFailureClassifier(
  classifier: QitsFailureClassifier,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: QITS_FAILURE_CLASSIFIERS, useValue: classifier, multi: true },
  ]);
}

/** The language/tool pairs the standard classifier answers for. */
const STANDARD_TOOLS: Readonly<Record<string, readonly string[]>> = {
  java: ['surefire', 'failsafe'],
  typescript: ['vitest'],
  javascript: ['vitest'],
};

/**
 * The classifier `provideQitsStandardFailureInsights()` installs: Java under surefire or failsafe,
 * TypeScript or JavaScript under vitest — the two ecosystems qits-ci's parsers record today. The
 * category is the shape, lower-cased; anything else is not this classifier's to answer.
 */
export class StandardFailureClassifier implements QitsFailureClassifier {
  readonly id = 'standard';

  classify(failure: QitsTestFailure): QitsFailureKind | null {
    const coordinates = failure?.coordinates;
    const language = lower(coordinates?.language);
    const tool = lower(coordinates?.tool);
    const shape = typeof failure?.shape === 'string' ? failure.shape : '';
    if (!shape || !STANDARD_TOOLS[language]?.includes(tool)) return null;
    return { language, tool, shape, category: shape.toLowerCase() };
  }
}

/**
 * Ask every classifier in registration order; the first non-null answer wins. A classifier that
 * throws counts as having declined — one broken registration must not take the others' answers,
 * nor the report, down with it.
 */
export function classifyFailure(
  classifiers: readonly QitsFailureClassifier[] | null | undefined,
  failure: QitsTestFailure,
): QitsFailureKind | null {
  for (const classifier of classifiers ?? []) {
    try {
      const kind = classifier.classify(failure);
      if (kind) return kind;
    } catch {
      // Declined, by throwing.
    }
  }
  return null;
}

function lower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}
