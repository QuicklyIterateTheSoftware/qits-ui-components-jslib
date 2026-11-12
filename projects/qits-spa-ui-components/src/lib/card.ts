import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { QITS_THEME_DEFAULTS } from './theme-defaults';

/**
 * A titled surface to group related content. The header is rendered only when a `heading` is
 * given, so an untitled card is a plain panel rather than an empty `<h3>` a screen reader has to
 * announce.
 *
 * Two projection slots: `[qitsCardActions]` lands in the header beside the title, everything else
 * falls into the body.
 */
@Component({
  selector: 'qits-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="elevated() ? 'qits-card qits-card-elevated' : 'qits-card'">
      @if (heading()) {
        <header class="qits-card-header">
          <div class="qits-card-headings">
            <h3 class="qits-card-title">{{ heading() }}</h3>
            @if (subheading()) {
              <p class="qits-card-subtitle">{{ subheading() }}</p>
            }
          </div>
          <ng-content select="[qitsCardActions]" />
        </header>
      }
      <div class="qits-card-body">
        <ng-content />
      </div>
    </section>
  `,
  styles: [
    QITS_THEME_DEFAULTS,
    `
      :host {
        display: block;
      }
      .qits-card {
        background: var(--color-surface);
        border: 1px solid var(--color-line);
        border-radius: 10px;
        overflow: hidden;
      }
      .qits-card-elevated {
        border-color: transparent;
        box-shadow:
          0 1px 3px var(--color-shadow-near),
          0 4px 12px var(--color-shadow-far);
      }
      .qits-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--color-line-subtle);
      }
      .qits-card-title {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--color-fg);
      }
      .qits-card-subtitle {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--color-fg-muted);
      }
      .qits-card-body {
        padding: 16px;
      }
    `,
  ],
})
export class QitsCard {
  readonly heading = input<string>('');
  readonly subheading = input<string>('');
  readonly elevated = input(false, { transform: booleanAttribute });
}
