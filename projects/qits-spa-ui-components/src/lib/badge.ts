import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

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
  styles: `
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
      background: #f3f4f6;
      color: #374151;
      border-color: #e5e7eb;
    }
    .qits-badge-info {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }
    .qits-badge-success {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }
    .qits-badge-warning {
      background: #fffbeb;
      color: #b45309;
      border-color: #fde68a;
    }
    .qits-badge-danger {
      background: #fef2f2;
      color: #b91c1c;
      border-color: #fecaca;
    }
    .qits-badge-highlight {
      background: #f5f3ff;
      color: #6d28d9;
      border-color: #ddd6fe;
    }
  `,
})
export class QitsBadge {
  readonly label = input.required<string>();
  readonly tone = input<QitsBadgeTone>('neutral');

  protected readonly classes = computed(() => `qits-badge qits-badge-${this.tone()}`);
}
