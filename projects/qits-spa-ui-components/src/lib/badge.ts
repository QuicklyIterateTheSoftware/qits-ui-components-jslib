import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { QITS_THEME_DEFAULTS } from './theme-defaults';

export type QitsBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'highlight';

/**
 * A short status word — a run's outcome, a deployment's state. The label is required because a
 * badge with nothing in it is a coloured dot, and a coloured dot is not a status.
 *
 * Tone is a *semantic* input, not a colour: callers say `success`, never `#16a34a`, so restyling
 * the whole system stays a change in this file.
 *
 * `highlight` marks a thing singled out as ready/planned — it is the purple of the shared entity
 * status palette (REFINED); see qits-projects-frontend's `entities-model.ts` `STATUS_TONES`.
 */
@Component({
  selector: 'qits-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <span [class]="classes()">{{ label() }}</span> `,
  styles: [
    QITS_THEME_DEFAULTS,
    `
      :host {
        display: inline-block;
      }
      .qits-badge {
        display: inline-block;
        font: inherit;
        font-size: 12px;
        line-height: 1.4;
        font-weight: 600;
        letter-spacing: 0.02em;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid transparent;
        white-space: nowrap;
      }
      .qits-badge-neutral {
        background: var(--color-surface-muted);
        color: var(--color-fg-soft);
        border-color: var(--color-line);
      }
      .qits-badge-info {
        background: var(--color-accent-soft);
        color: var(--color-accent);
        border-color: var(--color-accent-line);
      }
      .qits-badge-success {
        background: var(--color-success-soft);
        color: var(--color-success);
        border-color: var(--color-success-line);
      }
      .qits-badge-warning {
        background: var(--color-warning-soft);
        color: var(--color-warning);
        border-color: var(--color-warning-line);
      }
      .qits-badge-danger {
        background: var(--color-danger-soft);
        color: var(--color-danger);
        border-color: var(--color-danger-line);
      }
      .qits-badge-highlight {
        background: var(--color-special-soft);
        color: var(--color-special);
        border-color: var(--color-special-line);
      }
    `,
  ],
})
export class QitsBadge {
  readonly label = input.required<string>();
  readonly tone = input<QitsBadgeTone>('neutral');

  protected readonly classes = computed(() => `qits-badge qits-badge-${this.tone()}`);
}
