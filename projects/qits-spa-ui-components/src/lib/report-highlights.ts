import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { QitsBadge, type QitsBadgeTone } from './badge';
import type { QitsReportHighlight } from './reports';

/**
 * A highlight's severity as a badge tone. The four the CLI writes map onto the badge's semantic
 * tones; anything else is drawn neutral rather than dropped.
 */
export function qitsHighlightTone(severity: string | null | undefined): QitsBadgeTone {
  switch (severity) {
    case 'good':
      return 'success';
    case 'bad':
      return 'danger';
    case 'warn':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * The highlights strip: one chip per highlight — "3 tests failed", "coverage −2.1%" — toned by its
 * severity (`good` → success, `bad` → danger, `warn` → warning, `info` → neutral). It draws what it
 * is given and fetches nothing; an empty list draws nothing.
 */
@Component({
  selector: 'qits-report-highlights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsBadge],
  template: `
    @if (highlights().length) {
      <ul class="strip" aria-label="Report highlights">
        @for (highlight of highlights(); track $index) {
          <li [attr.data-severity]="highlight.severity">
            <qits-badge [label]="highlight.text" [tone]="tone(highlight.severity)" />
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .strip {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class QitsReportHighlights {
  readonly highlights = input<readonly QitsReportHighlight[]>([]);

  protected readonly tone = qitsHighlightTone;
}
