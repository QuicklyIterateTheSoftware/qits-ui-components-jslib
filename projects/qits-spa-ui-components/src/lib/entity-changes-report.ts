import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { QitsBadge, type QitsBadgeTone } from './badge';
import { QitsMermaidDiagram } from './mermaid-diagram';
import type {
  QitsEntityChangesBaseline,
  QitsEntityChangesPayload,
  QitsEntityColumnChange,
  QitsEntityTableChange,
  QitsEntityUnitChange,
  QitsReport,
  QitsReportContext,
  QitsReportKind,
} from './reports';

/** The `entity-changes` kind's wire name. */
export const QITS_ENTITY_CHANGES_KIND = 'entity-changes';

/** Which diagrams a CHANGED unit shows: one side, or both beside each other. */
export type QitsEntityDiagramView = 'before' | 'after' | 'both';

const UNIT_TONE: Record<string, QitsBadgeTone> = {
  ADDED: 'warning',
  CHANGED: 'warning',
  REMOVED: 'danger',
  UNCHANGED: 'neutral',
  CURRENT: 'info',
};

const TABLE_TONE: Record<string, QitsBadgeTone> = {
  ADDED: 'warning',
  CHANGED: 'warning',
  REMOVED: 'danger',
};

const TABLE_ORDER: Record<string, number> = { ADDED: 0, REMOVED: 1, CHANGED: 2 };

/** A status chip's tone: ADDED/CHANGED warning, REMOVED danger, UNCHANGED neutral, CURRENT info. */
export function qitsEntityStatusTone(status: string): QitsBadgeTone {
  return UNIT_TONE[status] ?? 'neutral';
}

/** One unit as the view draws it. */
interface UnitRow {
  readonly key: string;
  readonly change: QitsEntityUnitChange;
  readonly tone: QitsBadgeTone;
  readonly tables: readonly QitsEntityTableChange[];
  /** `+1 ~2 −0 tables`, or null where the unit lists no table. */
  readonly tally: string | null;
  readonly hasChanges: boolean;
  /** Which sides this status draws. */
  readonly sides: 'pair' | 'after' | 'before';
}

/**
 * The `entity-changes` view (qits-760): per persistence unit, what the fold changed in the
 * database entities against the baseline release, and the diagram itself.
 *
 * - **A status chip** per unit — ADDED and CHANGED in the warning tone, REMOVED in danger,
 *   UNCHANGED neutral, CURRENT info — beside the unit's name and its file.
 * - **The change list** — tables added, removed and changed; per table its columns added, removed
 *   and changed (`before → after`); then relations added and removed.
 * - **The diagrams**, drawn by `QitsMermaidDiagram`. A CHANGED unit has a Before / After switch,
 *   both sides beside each other when wide and stacked when narrow; ADDED and CURRENT show After
 *   only, REMOVED Before only. UNCHANGED units are collapsed until asked — a collapsed unit loads
 *   no mermaid at all.
 * - **CURRENT** says "No baseline: this is the first diagram" — no baseline, or one from before
 *   the rollout, is an answer and not N tables added. A truncated report says so.
 *
 * A payload that is not an entity-changes report is said in one line; it never throws.
 */
@Component({
  selector: 'qits-entity-changes-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsBadge, QitsMermaidDiagram],
  template: `
    @if (payload(); as p) {
      @if (p.truncated) {
        <p class="muted truncated">
          Truncated: the report was over 1 MiB, so the diagrams of unchanged units were left out.
        </p>
      }
      @if (!rows().length) {
        <p class="muted no-units">No entity diagram in this run.</p>
      }
      @for (row of rows(); track row.key) {
        <section class="unit" [attr.data-status]="row.change.status">
          <header class="unit-head">
            <qits-badge class="status" [label]="row.change.status" [tone]="row.tone" />
            <span class="unit-name">{{ row.change.unit }}</span>
            <span class="code file">{{ row.change.file }}</span>
            @if (row.tally) {
              <span class="muted tally">{{ row.tally }}</span>
            }
          </header>

          @if (row.change.status === 'CURRENT') {
            <p class="muted current">No baseline: this is the first diagram.</p>
          }

          @if (row.change.status === 'UNCHANGED') {
            <button
              type="button"
              class="toggle unchanged-toggle"
              [attr.aria-expanded]="isOpen(row.key)"
              (click)="toggle(row.key)"
            >
              Unchanged since {{ baselineVersion() }}: {{ isOpen(row.key) ? 'hide' : 'show' }} the
              diagram
            </button>
            @if (isOpen(row.key)) {
              @if (row.change.after; as after) {
                <figure class="side after">
                  <qits-mermaid-diagram
                    [definition]="after"
                    [label]="row.change.unit + ' entities'"
                  />
                </figure>
              } @else {
                <p class="muted dropped">The diagram was left out of this report.</p>
              }
            }
          } @else {
            @if (row.change.status !== 'CURRENT' && row.hasChanges) {
              <div class="changes">
                @if (row.tables.length) {
                  <ul class="tables">
                    @for (table of row.tables; track $index) {
                      <li class="table" [attr.data-status]="table.status">
                        <qits-badge
                          class="table-status"
                          [label]="table.status.toLowerCase()"
                          [tone]="tableTone(table.status)"
                        />&ngsp;<span class="code table-name">{{ table.name }}</span>
                        @if (table.origin) {
                          &ngsp;<span class="muted origin">from {{ table.origin }}</span>
                        }
                        @if (
                          table.columns.added.length ||
                          table.columns.removed.length ||
                          table.columns.changed.length
                        ) {
                          <ul class="columns">
                            @for (column of table.columns.added; track $index) {
                              <li class="column-added">
                                <span class="sign">+</span>&ngsp;<span class="code">{{
                                  column
                                }}</span>
                              </li>
                            }
                            @for (column of table.columns.removed; track $index) {
                              <li class="column-removed">
                                <span class="sign">−</span>&ngsp;<span class="code">{{
                                  column
                                }}</span>
                              </li>
                            }
                            @for (column of table.columns.changed; track $index) {
                              <li class="column-changed">
                                <span class="sign">~</span>&ngsp;<span class="code">{{
                                  columnChange(column)
                                }}</span>
                              </li>
                            }
                          </ul>
                        }
                      </li>
                    }
                  </ul>
                }
                @if (row.change.relations.added.length || row.change.relations.removed.length) {
                  <ul class="relations">
                    @for (relation of row.change.relations.added; track $index) {
                      <li class="relation-added">
                        <span class="sign">+</span> relation
                        <span class="code">{{ relation }}</span>
                      </li>
                    }
                    @for (relation of row.change.relations.removed; track $index) {
                      <li class="relation-removed">
                        <span class="sign">−</span> relation
                        <span class="code">{{ relation }}</span>
                      </li>
                    }
                  </ul>
                }
              </div>
            }

            @switch (row.sides) {
              @case ('pair') {
                <div class="switch" role="group" [attr.aria-label]="row.change.unit + ' diagram'">
                  @for (option of views; track option.view) {
                    <button
                      type="button"
                      class="view"
                      [class.selected]="viewOf(row.key) === option.view"
                      [attr.aria-pressed]="viewOf(row.key) === option.view"
                      (click)="setView(row.key, option.view)"
                    >
                      {{ option.label }}
                    </button>
                  }
                </div>
                <div class="diagrams" [attr.data-view]="viewOf(row.key)">
                  @if (viewOf(row.key) !== 'after') {
                    <figure class="side before">
                      <figcaption>Before · {{ baselineVersion() }}</figcaption>
                      @if (row.change.before; as before) {
                        <qits-mermaid-diagram
                          [definition]="before"
                          [label]="row.change.unit + ' entities before'"
                        />
                      } @else {
                        <p class="muted dropped">Not in this report.</p>
                      }
                    </figure>
                  }
                  @if (viewOf(row.key) !== 'before') {
                    <figure class="side after">
                      <figcaption>After · this change</figcaption>
                      @if (row.change.after; as after) {
                        <qits-mermaid-diagram
                          [definition]="after"
                          [label]="row.change.unit + ' entities after'"
                        />
                      } @else {
                        <p class="muted dropped">Not in this report.</p>
                      }
                    </figure>
                  }
                </div>
              }
              @case ('before') {
                <div class="diagrams">
                  <figure class="side before">
                    <figcaption>Before · {{ baselineVersion() }}</figcaption>
                    @if (row.change.before; as before) {
                      <qits-mermaid-diagram
                        [definition]="before"
                        [label]="row.change.unit + ' entities before'"
                      />
                    } @else {
                      <p class="muted dropped">Not in this report.</p>
                    }
                  </figure>
                </div>
              }
              @default {
                <div class="diagrams">
                  <figure class="side after">
                    <figcaption>After · this change</figcaption>
                    @if (row.change.after; as after) {
                      <qits-mermaid-diagram
                        [definition]="after"
                        [label]="row.change.unit + ' entities'"
                      />
                    } @else {
                      <p class="muted dropped">Not in this report.</p>
                    }
                  </figure>
                </div>
              }
            }
          }
        </section>
      }
    } @else {
      <p class="muted unreadable">This entity-changes report could not be read.</p>
    }
  `,
  styles: `
    :host {
      display: block;
      font-size: 0.875rem;
      color: #111827;
    }
    p {
      margin: 0.25rem 0;
    }
    ul {
      margin: 0.25rem 0;
      padding-left: 1.25rem;
      list-style: none;
    }
    li {
      margin: 0.15rem 0;
    }
    .muted {
      color: #6b7280;
    }
    .unit + .unit {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e5e7eb;
    }
    .unit-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.5rem;
    }
    .unit-name {
      font-weight: 600;
    }
    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      overflow-wrap: anywhere;
    }
    .tables,
    .relations {
      padding-left: 0;
    }
    .columns {
      padding-left: 1.5rem;
    }
    .sign {
      display: inline-block;
      width: 1ch;
      font-weight: 600;
    }
    .column-added .sign,
    .relation-added .sign {
      color: #047857;
    }
    .column-removed,
    .relation-removed {
      color: #b91c1c;
    }
    .column-changed .sign {
      color: #b45309;
    }
    .table[data-status='REMOVED'] .table-name {
      text-decoration: line-through;
      color: #6b7280;
    }
    .toggle {
      font: inherit;
      text-align: left;
      color: #1d4ed8;
      background: none;
      border: 0;
      padding: 0;
      margin: 0.25rem 0;
      cursor: pointer;
    }
    .switch {
      display: inline-flex;
      margin: 0.5rem 0 0.25rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      overflow: hidden;
    }
    .view {
      font: inherit;
      font-size: 0.8rem;
      padding: 0.15rem 0.75rem;
      color: #374151;
      background: #fff;
      border: 0;
      cursor: pointer;
    }
    .view + .view {
      border-left: 1px solid #d1d5db;
    }
    .view.selected {
      color: #fff;
      background: #1d4ed8;
    }
    .diagrams {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
    .side {
      margin: 0;
      min-width: 0;
    }
    figcaption {
      margin-bottom: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #374151;
    }
  `,
})
export class QitsEntityChangesReport {
  /** The `entity-changes` report, payload included. */
  readonly report = input.required<QitsReport>();
  /**
   * The baseline run's report of the same kind. Unused: the CLI already compared the two diagrams,
   * and the payload carries both sides. Declared because every kind component takes it.
   */
  readonly baseline = input<QitsReport | null>(null);
  /** The run; its baseline names the version "Before" is. */
  readonly context = input<QitsReportContext | null>(null);

  protected readonly views: readonly { view: QitsEntityDiagramView; label: string }[] = [
    { view: 'before', label: 'Before' },
    { view: 'after', label: 'After' },
    { view: 'both', label: 'Both' },
  ];

  private readonly openUnits = signal<ReadonlySet<string>>(new Set());
  private readonly unitViews = signal<ReadonlyMap<string, QitsEntityDiagramView>>(new Map());

  protected readonly payload = computed(() => readEntityChangesPayload(this.report().payload));

  protected readonly baselineVersion = computed(
    () =>
      this.payload()?.baseline?.version ??
      this.context()?.baseline?.version ??
      this.report().baselineVersion ??
      'the baseline',
  );

  protected readonly rows = computed((): UnitRow[] =>
    (this.payload()?.units ?? []).map((change, index) => {
      const tables = [...change.tables].sort(
        (a, b) =>
          (TABLE_ORDER[a.status] ?? 3) - (TABLE_ORDER[b.status] ?? 3) ||
          a.name.localeCompare(b.name),
      );
      const count = (status: string) => tables.filter((table) => table.status === status).length;
      return {
        key: `${change.file}#${index}`,
        change,
        tone: qitsEntityStatusTone(change.status),
        tables,
        tally:
          tables.length && change.status !== 'CURRENT'
            ? `+${count('ADDED')} ~${count('CHANGED')} −${count('REMOVED')} tables`
            : null,
        hasChanges:
          tables.length > 0 ||
          change.relations.added.length > 0 ||
          change.relations.removed.length > 0,
        sides:
          change.status === 'REMOVED'
            ? 'before'
            : change.status === 'ADDED' || change.status === 'CURRENT'
              ? 'after'
              : change.status === 'CHANGED' || (change.before !== null && change.after !== null)
                ? 'pair'
                : change.after === null && change.before !== null
                  ? 'before'
                  : 'after',
      };
    }),
  );

  protected tableTone(status: string): QitsBadgeTone {
    return TABLE_TONE[status] ?? 'neutral';
  }

  protected columnChange(column: QitsEntityColumnChange): string {
    return `${column.name}: ${column.before} → ${column.after}`;
  }

  protected isOpen(key: string): boolean {
    return this.openUnits().has(key);
  }

  protected toggle(key: string): void {
    const open = new Set(this.openUnits());
    if (!open.delete(key)) open.add(key);
    this.openUnits.set(open);
  }

  protected viewOf(key: string): QitsEntityDiagramView {
    return this.unitViews().get(key) ?? 'both';
  }

  protected setView(key: string, view: QitsEntityDiagramView): void {
    this.unitViews.set(new Map(this.unitViews()).set(key, view));
  }
}

/**
 * Narrows a stored payload to {@link QitsEntityChangesPayload}, or null where it is not one.
 *
 * The top level must be an object with a `units` array; anything less is not an entity-changes
 * report and the view says so. Below that it is lenient on purpose: a unit or table without its
 * name is dropped, a missing list is empty, a missing text is null and a missing flag false — so a
 * field a parser leaves out is drawn as absent, never thrown over. Never throws.
 */
export function readEntityChangesPayload(value: unknown): QitsEntityChangesPayload | null {
  if (!isRecord(value) || !Array.isArray(value['units'])) return null;
  const baseline = value['baseline'];
  return {
    baseline: isRecord(baseline) ? readBaseline(baseline) : null,
    units: records(value['units']).flatMap((unit) => {
      const file = text(unit['file']);
      const name = text(unit['unit']);
      if (file === null && name === null) return [];
      const relations = isRecord(unit['relations']) ? unit['relations'] : {};
      return [
        {
          file: file ?? '',
          unit: name ?? file ?? '',
          status: text(unit['status']) ?? 'UNKNOWN',
          tables: records(unit['tables'])
            .filter((table) => typeof table['name'] === 'string')
            .map(readTable),
          relations: { added: strings(relations['added']), removed: strings(relations['removed']) },
          before: text(unit['before']),
          after: text(unit['after']),
        } satisfies QitsEntityUnitChange,
      ];
    }),
    truncated: value['truncated'] === true,
  };
}

function readBaseline(baseline: Record<string, unknown>): QitsEntityChangesBaseline {
  return {
    version: text(baseline['version']),
    tagSha: text(baseline['tagSha']),
    hadDiagram: baseline['hadDiagram'] === true,
  };
}

function readTable(table: Record<string, unknown>): QitsEntityTableChange {
  const columns = isRecord(table['columns']) ? table['columns'] : {};
  return {
    name: table['name'] as string,
    status: text(table['status']) ?? 'CHANGED',
    origin: text(table['origin']),
    columns: {
      added: strings(columns['added']),
      removed: strings(columns['removed']),
      changed: records(columns['changed'])
        .filter((column) => typeof column['name'] === 'string')
        .map((column) => ({
          name: column['name'] as string,
          before: text(column['before']) ?? '',
          after: text(column['after']) ?? '',
        })),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The `entity-changes` kind's registration, payload version 1 — part of the standard kinds. */
export const QITS_ENTITY_CHANGES_REPORT_KIND: QitsReportKind = {
  kind: QITS_ENTITY_CHANGES_KIND,
  versions: [1],
  title: 'Entities',
  component: QitsEntityChangesReport,
};
