import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { QitsAppLinks } from './app-links';
import { QitsBadge, type QitsBadgeTone } from './badge';
import { contractChanges, qitsInteractionKey, qitsPairKey } from './contracts-diff';
import {
  QITS_CONTRACTS_KIND,
  readContractsPayload,
  type QitsContractInteraction,
  type QitsContractPair,
  type QitsContractRole,
  type QitsContractsPayload,
  type QitsInteractionEntry,
} from './contracts-report.types';
import type { QitsReport, QitsReportContext, QitsReportKind } from './reports';
import { QITS_SCOPE } from './scope';

/** One interaction as a section draws it: its identity, and its entry where a payload has it. */
interface QitsContractLine {
  readonly key: string;
  readonly description: string;
  readonly providerStates: readonly string[];
  readonly entry: QitsInteractionEntry | null;
}

/** Interactions of one pair, under the pair's heading. */
interface QitsContractGroup {
  readonly key: string;
  readonly pair: QitsContractPair;
  readonly lines: readonly QitsContractLine[];
}

const ROLE_LABEL: Record<QitsContractRole, string> = { CONSUMER: 'consumer', PROVIDER: 'provider' };
const ROLE_TONE: Record<QitsContractRole, QitsBadgeTone> = {
  CONSUMER: 'info',
  PROVIDER: 'highlight',
};

/**
 * The `contracts` view (qits-759): which contracts this change adds, removes and changes against
 * the baseline release, then the whole inventory, collapsed.
 *
 * - **New** — new consumer→provider pairs, with the side this repository is on; new provider
 *   states; new interactions, grouped by pair.
 * - **Removed** — the same three, muted, a removed provider state in the warning tone: it is a
 *   promise the provider no longer makes. Hidden when nothing was removed.
 * - **Changed** — interactions whose request or response moved (`contentHash`), by pair. The
 *   bodies are not in the report; the pact's source is linked at the fold's commit instead.
 * - **Inventory** — provider states with their operations, then every pact by role and pair with
 *   its interaction count, each expandable; a failed verification in the danger tone.
 *
 * The changes are computed here, by {@link contractChanges}, from the two payloads — the same rules
 * the CLI's highlights use. Without a baseline nothing is new and the view is the inventory. A
 * payload that is not a contracts report is said in one line; it never throws.
 */
@Component({
  selector: 'qits-contracts-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, QitsBadge],
  template: `
    <ng-template #line let-line let-tone="tone">
      <span class="description">{{ line.description }}</span>
      @if (line.entry?.method) {
        &ngsp;<span class="code request">{{ line.entry.method }} {{ line.entry.path ?? '' }}</span>
      }
      @if (line.providerStates.length) {
        &ngsp;<span class="states">given {{ line.providerStates.join(', ') }}</span>
      }
      @if (line.entry?.verified === 'FAILED') {
        &ngsp;<qits-badge class="verified" label="verification failed" tone="danger" />
      }
    </ng-template>
    <ng-template #pairLabel let-pair let-tone="tone">
      <qits-badge
        class="role"
        [label]="roleLabel(pair.role)"
        [tone]="roleTone(pair.role, tone)"
      />&ngsp;<span class="pair">{{ pair.consumer }} → {{ pair.provider }}</span>
    </ng-template>
    <ng-template #groups let-groups let-tone="tone">
      @for (group of groups; track group.key) {
        <div class="group">
          <p class="group-head">
            <ng-container
              *ngTemplateOutlet="pairLabel; context: { $implicit: group.pair, tone: tone }"
            />
          </p>
          <ul class="interactions">
            @for (entry of group.lines; track entry.key) {
              <li class="interaction">
                <ng-container *ngTemplateOutlet="line; context: { $implicit: entry }" />
              </li>
            }
          </ul>
        </div>
      }
    </ng-template>

    @if (payload(); as p) {
      @if (!changes()) {
        <p class="muted no-baseline">No baseline — showing the inventory.</p>
      }
      @if (!p.sides.provider) {
        <p class="muted provider-absent">Provider side not reported in this run.</p>
      }
      @if (p.truncated) {
        <p class="muted truncated">
          Truncated: the report kept only the first 2,000 interactions, so the lists below are
          incomplete.
        </p>
      }
      @if (p.skipped.length) {
        <ul class="muted skipped">
          @for (skipped of p.skipped; track $index) {
            <li>
              Skipped <span class="code">{{ skipped.file }}</span
              >{{ skipped.reason ? ': ' + skipped.reason : '' }}
            </li>
          }
        </ul>
      }

      @if (changes(); as c) {
        <section class="new">
          <h4>New</h4>
          @if (!c.newPairs.length && !c.newStates.length && !newGroups().length) {
            <p class="muted nothing-new">Nothing new since {{ baselineVersion() }}.</p>
          }
          @if (c.newPairs.length) {
            <ul class="pairs">
              @for (pair of c.newPairs; track $index) {
                <li class="new-pair">
                  <ng-container *ngTemplateOutlet="pairLabel; context: { $implicit: pair }" />
                </li>
              }
            </ul>
          }
          @if (c.newStates.length) {
            <ul class="states-list">
              @for (state of c.newStates; track state) {
                <li class="new-state">
                  <qits-badge label="provider state" tone="info" /> {{ state }}
                </li>
              }
            </ul>
          }
          <ng-container *ngTemplateOutlet="groups; context: { $implicit: newGroups() }" />
        </section>

        @if (c.removedPairs.length || c.removedStates.length || removedGroups().length) {
          <section class="removed">
            <h4>Removed</h4>
            @if (c.removedPairs.length) {
              <ul class="pairs">
                @for (pair of c.removedPairs; track $index) {
                  <li class="removed-pair">
                    <ng-container
                      *ngTemplateOutlet="pairLabel; context: { $implicit: pair, tone: 'neutral' }"
                    />
                  </li>
                }
              </ul>
            }
            @if (c.removedStates.length) {
              <ul class="states-list">
                @for (state of c.removedStates; track state) {
                  <li class="removed-state warn">
                    <qits-badge label="provider state" tone="warning" /> {{ state }}
                  </li>
                }
              </ul>
            }
            <ng-container
              *ngTemplateOutlet="groups; context: { $implicit: removedGroups(), tone: 'neutral' }"
            />
          </section>
        }

        @if (changedGroups().length) {
          <section class="changed">
            <h4>Changed</h4>
            <ng-container *ngTemplateOutlet="groups; context: { $implicit: changedGroups() }" />
          </section>
        }
      }

      <section class="inventory">
        <button
          type="button"
          class="toggle inventory-toggle"
          [attr.aria-expanded]="inventoryOpen()"
          (click)="inventoryOpen.set(!inventoryOpen())"
        >
          Inventory: {{ p.pacts.length }} {{ p.pacts.length === 1 ? 'pact' : 'pacts' }},
          {{ interactionCount() }} interactions, {{ p.providerStates?.states?.length ?? 0 }}
          provider states
        </button>
        @if (inventoryOpen()) {
          <div class="inventory-body">
            @if (p.providerStates; as states) {
              <h5>Provider states{{ states.provider ? ' of ' + states.provider : '' }}</h5>
              @if (states.states.length) {
                <ul class="provider-states">
                  @for (state of states.states; track state.name) {
                    <li>
                      {{ state.name }}
                      @if (state.operations.length) {
                        <span class="code operations">{{ state.operations.join(', ') }}</span>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p class="muted">None declared.</p>
              }
            }
            @for (side of sides(); track side.role) {
              <h5>{{ side.title }}</h5>
              <ul class="pacts">
                @for (pact of side.pacts; track pact.key) {
                  <li class="pact">
                    <button
                      type="button"
                      class="toggle pact-toggle"
                      [attr.aria-expanded]="isOpen(pact.key)"
                      (click)="togglePact(pact.key)"
                    >
                      {{ pact.entry.consumer }} → {{ pact.entry.provider }}
                    </button>
                    <span class="muted count">
                      {{ pact.entry.interactions.length }}
                      {{ pact.entry.interactions.length === 1 ? 'interaction' : 'interactions' }}
                    </span>
                    @if (pact.failed) {
                      <span class="failed">{{ pact.failed }} failed verification</span>
                    }
                    @if (pact.entry.source; as source) {
                      @if (sourceHref(source); as href) {
                        <a class="code source" [href]="href">{{ source }}</a>
                      } @else {
                        <span class="code source">{{ source }}</span>
                      }
                    }
                    @if (isOpen(pact.key)) {
                      <ul class="interactions">
                        @for (entry of pact.lines; track entry.key) {
                          <li
                            class="interaction"
                            [class.failed-interaction]="entry.entry?.verified === 'FAILED'"
                          >
                            <ng-container *ngTemplateOutlet="line; context: { $implicit: entry }" />
                          </li>
                        }
                      </ul>
                    }
                  </li>
                }
              </ul>
            }
            @if (!p.pacts.length) {
              <p class="muted no-pacts">No pacts.</p>
            }
          </div>
        }
      </section>
    } @else {
      <p class="muted unreadable">This contracts report could not be read.</p>
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
    h4 {
      margin: 0.75rem 0 0.25rem;
      font-size: 0.875rem;
      font-weight: 600;
    }
    h5 {
      margin: 0.5rem 0 0.25rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #374151;
    }
    ul {
      margin: 0.25rem 0;
      padding-left: 1.25rem;
    }
    li {
      margin: 0.15rem 0;
    }
    .muted,
    .removed {
      color: #6b7280;
    }
    .warn {
      color: #b45309;
    }
    .failed,
    .failed-interaction .description {
      color: #b91c1c;
      font-weight: 600;
    }
    .group-head {
      margin-top: 0.5rem;
    }
    .pair {
      font-weight: 600;
    }
    .removed .pair {
      font-weight: 400;
    }
    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      overflow-wrap: anywhere;
    }
    .operations,
    .count,
    .failed,
    .source {
      margin-left: 0.5rem;
    }
    .states,
    .operations {
      color: #6b7280;
    }
    .toggle {
      font: inherit;
      text-align: left;
      color: #1d4ed8;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .inventory {
      margin-top: 0.75rem;
    }
    a.source {
      color: #1d4ed8;
    }
  `,
})
export class QitsContractsReport {
  /** The `contracts` report, payload included. */
  readonly report = input.required<QitsReport>();
  /** The baseline run's `contracts` report, when there is one: what "new" is measured against. */
  readonly baseline = input<QitsReport | null>(null);
  /** The run; `commitSha` is the fold a pact's source is linked at. */
  readonly context = input<QitsReportContext | null>(null);

  private readonly links = inject(QitsAppLinks);
  private readonly scope = inject(QITS_SCOPE, { optional: true });

  protected roleLabel(role: QitsContractRole): string {
    return ROLE_LABEL[role] ?? String(role).toLowerCase();
  }

  /** The role's own tone, unless a section mutes it. */
  protected roleTone(role: QitsContractRole, override?: QitsBadgeTone | null): QitsBadgeTone {
    return override ?? ROLE_TONE[role] ?? 'neutral';
  }

  protected readonly inventoryOpen = signal(false);
  private readonly openPacts = signal<ReadonlySet<string>>(new Set());

  protected readonly payload = computed(() => readContractsPayload(this.report().payload));
  /**
   * The baseline's payload — null where there is no baseline report, where it is another version
   * of the kind, or where it cannot be read: each of those is "no baseline", never an error.
   */
  private readonly baselinePayload = computed(() => {
    const baseline = this.baseline();
    return baseline && baseline.kindVersion === 1 ? readContractsPayload(baseline.payload) : null;
  });

  protected readonly changes = computed(() => {
    const payload = this.payload();
    return payload ? contractChanges(payload, this.baselinePayload()) : null;
  });

  protected readonly newGroups = computed(() =>
    groupsOf(this.changes()?.newInteractions, this.payload()),
  );
  protected readonly removedGroups = computed(() =>
    groupsOf(this.changes()?.removedInteractions, this.baselinePayload()),
  );
  protected readonly changedGroups = computed(() =>
    groupsOf(this.changes()?.changedInteractions, this.payload()),
  );

  protected readonly baselineVersion = computed(
    () => this.context()?.baseline?.version ?? this.baseline()?.baselineVersion ?? 'the baseline',
  );

  protected readonly interactionCount = computed(() =>
    (this.payload()?.pacts ?? []).reduce((sum, pact) => sum + pact.interactions.length, 0),
  );

  /** The inventory's pacts, by role, each with its key, its lines and its failed count. */
  protected readonly sides = computed(() => {
    const pacts = this.payload()?.pacts ?? [];
    return (['CONSUMER', 'PROVIDER'] as const)
      .map((role) => ({
        role,
        title: role === 'CONSUMER' ? 'As consumer' : 'As provider',
        pacts: pacts
          .filter((pact) => pact.role === role)
          .map((entry, index) => ({
            key: `${qitsPairKey(entry)}#${index}`,
            entry,
            lines: entry.interactions.map((interaction, line): QitsContractLine => ({
              key: `${line}`,
              description: interaction.description,
              providerStates: interaction.providerStates,
              entry: interaction,
            })),
            failed: entry.interactions.filter((interaction) => interaction.verified === 'FAILED')
              .length,
          })),
      }))
      .filter((side) => side.pacts.length);
  });

  protected isOpen(key: string): boolean {
    return this.openPacts().has(key);
  }

  protected togglePact(key: string): void {
    const open = new Set(this.openPacts());
    if (!open.delete(key)) open.add(key);
    this.openPacts.set(open);
  }

  /**
   * The pact file on the git host's Code page at the fold's commit — only for a committed file (a
   * verification report under `.qits-reports/` was generated in the run and is in no tree), and
   * only where the page's scope names the repository; otherwise the path is drawn as text.
   */
  protected sourceHref(source: string): string | undefined {
    if (source.startsWith('.qits-reports/')) return undefined;
    const sha = this.context()?.commitSha;
    const scope = this.scope?.scope();
    if (!sha || !scope?.project || !scope.group || !scope.repository) return undefined;
    const path = encodeURIComponent(source).replace(/%2F/g, '/');
    return this.links.href('qits-githost', `branches/${encodeURIComponent(sha)}?path=${path}`, {
      project: scope.project,
      group: scope.group,
      repository: scope.repository,
    });
  }
}

/**
 * Interactions grouped by pair, in the order {@link contractChanges} listed them (already sorted by
 * pair), each matched to its entry in `payload` for the request line.
 */
function groupsOf(
  interactions: readonly QitsContractInteraction[] | undefined,
  payload: QitsContractsPayload | null,
): QitsContractGroup[] {
  if (!interactions?.length) return [];
  const entries = new Map<string, QitsInteractionEntry>();
  for (const pact of payload?.pacts ?? []) {
    for (const interaction of pact.interactions) {
      const key = qitsInteractionKey(pact, interaction);
      if (!entries.has(key)) entries.set(key, interaction);
    }
  }
  const groups: { key: string; pair: QitsContractPair; lines: QitsContractLine[] }[] = [];
  for (const interaction of interactions) {
    const pairKey = qitsPairKey(interaction);
    let group = groups.at(-1);
    if (group?.key !== pairKey) {
      group = {
        key: pairKey,
        pair: {
          role: interaction.role,
          consumer: interaction.consumer,
          provider: interaction.provider,
        },
        lines: [],
      };
      groups.push(group);
    }
    const key = qitsInteractionKey(interaction, interaction);
    group.lines.push({
      key,
      description: interaction.description,
      providerStates: interaction.providerStates,
      entry: entries.get(key) ?? null,
    });
  }
  return groups;
}

/** The `contracts` kind's registration, payload version 1 — part of the standard kinds. */
export const QITS_CONTRACTS_REPORT_KIND: QitsReportKind = {
  kind: QITS_CONTRACTS_KIND,
  versions: [1],
  title: 'Contracts',
  component: QitsContractsReport,
};
