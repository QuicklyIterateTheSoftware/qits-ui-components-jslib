import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

import { QitsCodePreviewInsight } from './code-preview-insight';
import { provideQitsFailureClassifier, StandardFailureClassifier } from './failure-kinds';
import { provideQitsFailureInsight } from './failure-insights';
import { JavaHighlighter, provideQitsSyntaxHighlighter, TypeScriptHighlighter } from './syntax';

/**
 * What an opened failure shows out of the box: the standard classifier (Java under surefire and
 * failsafe, TypeScript and JavaScript under vitest), the code-preview insight, and the Java and
 * TypeScript highlighters. `provideQitsStandardReportKinds()` installs this too.
 *
 * The preview reads the failure's repository from `QITS_REPOSITORIES` (`provideQitsProjects()`)
 * and its file from qits-githost, so it needs `provideHttpClient()` as every other read does.
 */
export function provideQitsStandardFailureInsights(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideQitsFailureClassifier(new StandardFailureClassifier()),
    provideQitsFailureInsight(QitsCodePreviewInsight),
    provideQitsSyntaxHighlighter(new JavaHighlighter()),
    provideQitsSyntaxHighlighter(new TypeScriptHighlighter()),
  ]);
}
