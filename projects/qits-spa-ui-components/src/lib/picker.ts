import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
} from '@angular/core';
import { QITS_THEME_DEFAULTS } from './theme-defaults';

/** One choice: the value the host cares about, and the words the reader sees. */
export interface QitsPickerOption<T> {
  readonly value: T;
  readonly label: string;
}

/** Instance ids, so `aria-activedescendant` can name an option on the page. */
let nextPickerId = 0;

/**
 * A picker: the list *is* the empty state. With nothing chosen the options stand open in the flow
 * of the page; choosing one collapses them into the bar above, beside a clear button that puts the
 * list back. There is no closed-with-a-value-missing state, so a reader never has to open anything
 * to find out what they can pick.
 *
 * A rail runs down the left of both the bar and the rows. Pointing at a row — or arrowing onto it —
 * draws a caret there at half opacity: the choice is *pending*, not made. Committing locks that
 * caret into the bar at full opacity and the label rises into the slot, which is the same caret and
 * the same word travelling, rather than two unrelated states swapping over.
 *
 * `value` is a `model`, so `[(value)]` binds both ways and `(valueChange)` alone reads as the
 * output — `T | undefined`, the second half being the cleared state. `T` is whatever the host
 * wants back; only `label` is ever rendered.
 *
 * A `value` that matches no option shows the list, because the component cannot display a label it
 * was not given. Pass `compareWith` when values are objects that will not survive `Object.is` —
 * reloaded records, anything crossing a serialisation boundary.
 *
 * The rows are the ARIA listbox pattern: the list itself is the single tab stop and holds the key
 * handler, and `aria-activedescendant` names the current row. That is why the rows carry a click
 * but neither a `tabindex` nor keys of their own — the two template lint rules suppressed over the
 * `<li>` are asking for exactly what this pattern forbids. Rows made focusable would be one tab
 * stop each and a second, competing notion of "current".
 */
@Component({
  selector: 'qits-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qits-picker-bar" [class.qits-picker-disabled]="disabled()">
      <span class="qits-picker-rail" aria-hidden="true">
        @if (selected()) {
          <svg class="qits-picker-caret qits-picker-caret-locked" viewBox="0 0 8 10">
            <path d="M0 0 L8 5 L0 10 Z" />
          </svg>
        }
      </span>

      @if (selected(); as option) {
        <span class="qits-picker-value">{{ option.label }}</span>
        <button
          type="button"
          class="qits-picker-clear"
          [disabled]="disabled()"
          [attr.aria-label]="clearLabel()"
          (click)="clear()"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1 1 L11 11 M11 1 L1 11" />
          </svg>
        </button>
      } @else {
        <span class="qits-picker-placeholder">{{ placeholder() }}</span>
      }
    </div>

    @if (!selected()) {
      @if (options().length) {
        <ul
          class="qits-picker-list"
          role="listbox"
          [attr.tabindex]="disabled() ? null : 0"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-disabled]="disabled() ? 'true' : null"
          [attr.aria-activedescendant]="activeId()"
          (focus)="focused.set(true)"
          (blur)="onBlur()"
          (keydown)="onKeydown($event)"
          (mouseleave)="onMouseLeave()"
        >
          @for (option of options(); track $index) {
            <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
            <li
              class="qits-picker-option"
              [id]="id + '-option-' + $index"
              [class.qits-picker-option-active]="$index === active()"
              role="option"
              aria-selected="false"
              (mouseenter)="onMouseEnter($index)"
              (click)="select($index)"
            >
              <span class="qits-picker-rail" aria-hidden="true">
                @if ($index === active()) {
                  <svg class="qits-picker-caret" viewBox="0 0 8 10">
                    <path d="M0 0 L8 5 L0 10 Z" />
                  </svg>
                }
              </span>
              <span class="qits-picker-label">{{ option.label }}</span>
            </li>
          }
        </ul>
      } @else {
        <p class="qits-picker-empty">{{ emptyLabel() }}</p>
      }
    }
  `,
  styles: [
    QITS_THEME_DEFAULTS,
    `
      :host {
        display: block;
        color: var(--color-fg);
      }

      /* The one column the caret lives in, shared by the bar and every row — that shared width is
       what makes the caret read as moving rather than reappearing somewhere else. */
      .qits-picker-rail {
        flex: none;
        width: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        align-self: stretch;
      }
      .qits-picker-caret {
        width: 7px;
        height: 9px;
        fill: var(--color-fg-control);
        opacity: 0.5;
      }
      .qits-picker-caret-locked {
        opacity: 1;
      }

      .qits-picker-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding-right: 6px;
        font-size: 14px;
        background: var(--color-surface);
        border: 1px solid var(--color-line-strong);
        border-radius: 999px;
      }
      .qits-picker-bar .qits-picker-rail {
        margin: 4px 0;
        border-right: 1px solid var(--color-line);
      }
      .qits-picker-disabled {
        background: var(--color-surface-subtle);
        opacity: 0.6;
      }
      .qits-picker-value {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        animation: qits-picker-pull-in 160ms ease-out;
      }
      .qits-picker-placeholder {
        flex: 1;
        min-width: 0;
        color: var(--color-fg-faint);
      }

      /* The chosen row rising into the slot it was picked into. */
      @keyframes qits-picker-pull-in {
        from {
          opacity: 0;
          transform: translateY(9px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      .qits-picker-clear {
        flex: none;
        display: inline-flex;
        padding: 5px;
        background: transparent;
        border: none;
        border-radius: 999px;
        color: var(--color-fg-muted);
        cursor: pointer;
      }
      .qits-picker-clear:hover:not(:disabled) {
        background: var(--color-surface-muted);
        color: var(--color-fg);
      }
      .qits-picker-clear:disabled {
        cursor: not-allowed;
      }
      .qits-picker-clear svg {
        width: 11px;
        height: 11px;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
      }

      .qits-picker-list {
        list-style: none;
        margin: 6px 0 0;
        padding: 2px 0;
        border-radius: 8px;
      }
      .qits-picker-list:focus-visible {
        outline: 2px solid var(--color-fg-control);
        outline-offset: 2px;
      }
      .qits-picker-option {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px 5px 0;
        font-size: 14px;
        border-radius: 6px;
        cursor: pointer;
      }
      .qits-picker-option-active {
        background: var(--color-surface-muted);
      }
      .qits-picker-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .qits-picker-disabled + .qits-picker-list .qits-picker-option {
        cursor: not-allowed;
      }
      .qits-picker-empty {
        margin: 6px 0 0;
        padding: 5px 8px 5px 30px;
        font-size: 14px;
        color: var(--color-fg-faint);
      }

      @media (prefers-reduced-motion: reduce) {
        .qits-picker-value {
          animation: none;
        }
      }
    `,
  ],
})
export class QitsPicker<T> {
  /** Everything that can be picked, in the order it is shown. */
  readonly options = input.required<readonly QitsPickerOption<T>[]>();
  /** What is picked, or `undefined` for nothing. Two-way: `[(value)]`. */
  readonly value = model<T | undefined>(undefined);
  /** How two values are told apart — override when `Object.is` is too strict for `T`. */
  readonly compareWith = input<(a: T, b: T) => boolean>(Object.is);
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Held in the empty slot. Blank by default: the list below already says what this is. */
  readonly placeholder = input('');
  /** Names the list for a screen reader, which has no visible label to fall back on. */
  readonly ariaLabel = input('Options');
  readonly clearLabel = input('Clear selection');
  /** Stands in for the list when there is nothing to pick. */
  readonly emptyLabel = input('No options');

  protected readonly id = `qits-picker-${nextPickerId++}`;

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The row the caret is on: hovered or arrowed onto, chosen by neither. `-1` is none. */
  protected readonly active = signal(-1);
  protected readonly focused = signal(false);

  /**
   * The option `value` names. Resolved rather than stored, so a host that swaps the options out
   * from under a selection is answered honestly — no match, no label, and the list comes back.
   */
  protected readonly selected = computed(() => {
    const value = this.value();
    if (value === undefined) return undefined;
    const same = this.compareWith();
    return this.options().find((option) => same(option.value, value));
  });

  protected readonly activeId = computed(() =>
    this.active() >= 0 ? `${this.id}-option-${this.active()}` : null,
  );

  protected onMouseEnter(index: number): void {
    if (!this.disabled()) this.active.set(index);
  }

  /** The caret follows the pointer, but must not snatch the row a keyboard is standing on. */
  protected onMouseLeave(): void {
    if (!this.focused()) this.active.set(-1);
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.active.set(-1);
  }

  protected select(index: number): void {
    if (this.disabled()) return;
    const option = this.options()[index];
    if (!option) return;
    this.value.set(option.value);
    this.active.set(-1);
    // The list the focus was in has just gone; hand it to the one control that replaced it.
    this.focusAfterRender('.qits-picker-clear');
  }

  protected clear(): void {
    if (this.disabled()) return;
    this.value.set(undefined);
    this.focusAfterRender('.qits-picker-list');
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const last = this.options().length - 1;
    if (last < 0) return;

    switch (event.key) {
      case 'ArrowDown':
        this.active.update((index) => (index >= last ? 0 : index + 1));
        break;
      case 'ArrowUp':
        this.active.update((index) => (index <= 0 ? last : index - 1));
        break;
      case 'Home':
        this.active.set(0);
        break;
      case 'End':
        this.active.set(last);
        break;
      case 'Enter':
      case ' ':
        if (this.active() < 0) return;
        this.select(this.active());
        break;
      default:
        return;
    }
    // Only reached by a key this component acted on — the page must not also scroll.
    event.preventDefault();
  }

  /**
   * Selecting and clearing each destroy the control the focus was in. Waiting for the render that
   * replaces it is the only moment the successor exists to be focused.
   */
  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
