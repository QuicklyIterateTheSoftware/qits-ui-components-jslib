import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  ViewContainerRef,
  type ComponentRef,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
  type Type,
} from '@angular/core';

import type { QitsReportContext } from '../reports';
import type { QitsTestFailure } from '../test-results-report';
import { declaredInputs } from './declared-inputs';
import { classifyFailure, QITS_FAILURE_CLASSIFIERS, type QitsFailureKind } from './failure-kinds';
import {
  QITS_FAILURE_ACTIONS,
  QITS_FAILURE_INSIGHTS,
  type QitsFailureActionProvider,
  type QitsFailureInsightProvider,
} from './failure-insights';

/**
 * Draws one insight's component beside itself, and survives the component throwing.
 *
 * Where `NgComponentOutlet` would let a constructor, an input or a first render that throws escape
 * into the report's own change detection — and take the whole report with it — this creates the
 * component itself, inside a `try`, and turns a throw into the muted line. The inputs are handed
 * over the way the outlet's `inputs` would be, narrowed to the ones the component declares.
 */
@Component({
  selector: 'qits-failure-insight-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (failed()) {
      <p class="muted broken">{{ title() }} could not be shown.</p>
    }
  `,
  styles: `
    .muted {
      margin: 0.25rem 0;
      color: #6b7280;
    }
  `,
})
export class QitsFailureInsightSlot implements OnChanges, OnDestroy {
  readonly component = input.required<Type<unknown>>();
  readonly inputs = input.required<Readonly<Record<string, unknown>>>();
  readonly title = input('');

  protected readonly failed = signal(false);
  private readonly container = inject(ViewContainerRef);
  private ref: ComponentRef<unknown> | null = null;
  private readonly handed = new Map<string, unknown>();

  ngOnChanges(changes: SimpleChanges): void {
    try {
      const fresh = !!changes['component'] || this.ref === null;
      if (fresh) {
        this.clear();
        if (this.failed()) return;
        this.ref = this.container.createComponent(this.component(), {
          injector: this.container.injector,
        });
      }
      for (const [name, value] of Object.entries(declaredInputs(this.component(), this.inputs()))) {
        if (this.handed.has(name) && Object.is(this.handed.get(name), value)) continue;
        this.handed.set(name, value);
        this.ref!.setInput(name, value);
      }
      if (fresh) this.ref!.changeDetectorRef.detectChanges();
    } catch {
      this.clear();
      this.failed.set(true);
    }
  }

  ngOnDestroy(): void {
    this.clear();
  }

  private clear(): void {
    this.container.clear();
    this.ref = null;
    this.handed.clear();
  }
}

interface InsightEntry {
  readonly provider: QitsFailureInsightProvider;
  /** Its `appliesTo` threw: drawn as the muted line, never as its component. */
  readonly broken: boolean;
}

/**
 * `<qits-failure-insights>`: everything this library can say about one opened failure.
 *
 * The failure is classified first ({@link classifyFailure}); an **unclassified failure draws
 * nothing at all** — no heading, no empty box. A classified one draws every registered insight
 * whose `appliesTo` holds, each under its title, then a row with every applying action — and no
 * row when none applies, which today is always.
 *
 * An insight that throws — in `appliesTo` or while it renders — costs only its own section, which
 * becomes a muted line: a report is never allowed to break the page that shows it.
 *
 * The test-results view creates this only inside an opened failure (it is the default of qits-990's
 * `QITS_TEST_FAILURE_PREVIEW` slot), so a closed list fetches nothing.
 */
@Component({
  selector: 'qits-failure-insights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsFailureInsightSlot],
  template: `
    @if (kind()) {
      <div class="insights">
        @for (entry of entries(); track entry.provider.id) {
          @if (entry.broken) {
            <p class="muted broken">{{ entry.provider.title }} could not be shown.</p>
          } @else {
            <section class="insight" [attr.data-insight]="entry.provider.id">
              <h4 class="title">{{ entry.provider.title }}</h4>
              <qits-failure-insight-slot
                [component]="entry.provider.component"
                [inputs]="inputs()"
                [title]="entry.provider.title"
              />
            </section>
          }
        }
        @if (actions().length) {
          <div class="actions" role="group" aria-label="Actions on this failure">
            @for (action of actions(); track action.id) {
              <button
                type="button"
                class="action"
                [attr.data-action]="action.id"
                [disabled]="running() === action.id"
                (click)="run(action)"
              >
                {{ action.label }}
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .insights {
      margin-top: 0.5rem;
    }
    .insight + .insight {
      margin-top: 0.75rem;
    }
    .title {
      margin: 0 0 0.25rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #374151;
    }
    .muted {
      margin: 0.25rem 0;
      color: #6b7280;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }
    .action {
      font: inherit;
      font-size: 0.8rem;
      padding: 0.25rem 0.6rem;
      color: #1d4ed8;
      background: #ffffff;
      border: 1px solid #bfdbfe;
      border-radius: 0.3rem;
      cursor: pointer;
    }
    .action:disabled {
      cursor: progress;
      opacity: 0.6;
    }
  `,
})
export class QitsFailureInsightsArea {
  readonly failure = input.required<QitsTestFailure>();
  readonly context = input<QitsReportContext | null>(null);

  private readonly classifiers = inject(QITS_FAILURE_CLASSIFIERS, { optional: true }) ?? [];
  private readonly insights = inject(QITS_FAILURE_INSIGHTS, { optional: true }) ?? [];
  private readonly allActions = inject(QITS_FAILURE_ACTIONS, { optional: true }) ?? [];

  protected readonly kind = computed<QitsFailureKind | null>(() =>
    classifyFailure(this.classifiers, this.failure()),
  );

  protected readonly entries = computed<readonly InsightEntry[]>(() => {
    const kind = this.kind();
    if (!kind) return [];
    const failure = this.failure();
    const entries: InsightEntry[] = [];
    for (const provider of this.insights) {
      try {
        if (provider.appliesTo(kind, failure)) entries.push({ provider, broken: false });
      } catch {
        entries.push({ provider, broken: true });
      }
    }
    return entries;
  });

  /** One object for every insight, so an unchanged failure hands nothing over again. */
  protected readonly inputs = computed(() => ({
    failure: this.failure(),
    kind: this.kind(),
    context: this.context(),
  }));

  /** Actions need the run they act on, so none is offered without a context. */
  protected readonly actions = computed<readonly QitsFailureActionProvider[]>(() => {
    const kind = this.kind();
    if (!kind || !this.context()) return [];
    const failure = this.failure();
    return this.allActions.filter((action) => {
      try {
        return action.appliesTo(kind, failure);
      } catch {
        return false;
      }
    });
  });

  protected readonly running = signal<string | null>(null);

  protected run(action: QitsFailureActionProvider): void {
    const context = this.context();
    if (!context || this.running()) return;
    this.running.set(action.id);
    let done: Promise<void>;
    try {
      done = Promise.resolve(action.run(this.failure(), context));
    } catch {
      done = Promise.resolve();
    }
    void done.catch(() => undefined).finally(() => this.running.set(null));
  }
}
