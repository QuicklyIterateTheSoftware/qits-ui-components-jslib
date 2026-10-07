import {
  InjectionToken,
  makeEnvironmentProviders,
  type EnvironmentProviders,
  type Type,
} from '@angular/core';

import type { QitsReportContext } from '../reports';
import type { QitsTestFailure } from '../test-results-report';
import type { QitsFailureKind } from './failure-kinds';

/**
 * One insight into an opened failure — the test's code, say — drawn under `title` in the failure's
 * insight area whenever `appliesTo` holds for the failure and its kind.
 *
 * The component is rendered through the area's outlet and is handed up to three inputs, each only
 * if it declares it: `failure: QitsTestFailure`, `kind: QitsFailureKind` and `context:
 * QitsReportContext | null`.
 */
export interface QitsFailureInsightProvider {
  readonly id: string;
  readonly title: string;
  appliesTo(kind: QitsFailureKind, failure: QitsTestFailure): boolean;
  readonly component: Type<unknown>;
}

/** Every registered insight, in registration order — the order the area draws them in. Multi. */
export const QITS_FAILURE_INSIGHTS = new InjectionToken<readonly QitsFailureInsightProvider[]>(
  'QITS_FAILURE_INSIGHTS',
);

/** Register one insight. A new insight is this one line beside its component. */
export function provideQitsFailureInsight(
  provider: QitsFailureInsightProvider,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: QITS_FAILURE_INSIGHTS, useValue: provider, multi: true },
  ]);
}

/**
 * Something a reader can do about a failure — rerun it, open a ticket — drawn as a button under the
 * insights wherever `appliesTo` holds.
 *
 * **Kept in the design, shipped with no implementation.** The area already draws the row, so the
 * first action is a registration, not a change to the area. Until then the token answers empty and
 * the row is never drawn.
 */
export interface QitsFailureActionProvider {
  readonly id: string;
  readonly label: string;
  appliesTo(kind: QitsFailureKind, failure: QitsTestFailure): boolean;
  run(failure: QitsTestFailure, context: QitsReportContext): Promise<void>;
}

/** Every registered action. Multi, and empty by default. */
export const QITS_FAILURE_ACTIONS = new InjectionToken<readonly QitsFailureActionProvider[]>(
  'QITS_FAILURE_ACTIONS',
  { providedIn: 'root', factory: () => [] },
);
