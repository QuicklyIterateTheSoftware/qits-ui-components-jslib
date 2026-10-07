import type {
  QitsContractChanges,
  QitsContractInteraction,
  QitsContractPair,
  QitsContractRole,
  QitsContractsPayload,
  QitsInteractionEntry,
  QitsPactEntry,
} from './contracts-report.types';

/**
 * What a `contracts` report adds, removes and changes against its baseline — the browser's half of
 * qits-759's identity rules, the CLI's `ContractChanges` being the other. Both answer the same
 * shared fixture (`report/contracts/diff/` in qits-platform-access-cli), so they cannot drift.
 *
 * - a provider state is its `name`;
 * - a pair is `role` + `consumer` + `provider`;
 * - an interaction is its pair + `description` + its sorted provider-state names;
 * - a changed interaction has the same identity in both and a different `contentHash`;
 * - a role whose side is false in **either** report contributes nothing — a verification report
 *   missing from one run says nothing about the pacts it would have named; states are compared
 *   only where both reports read an index;
 * - the interactions of a new pair are new interactions too, and those of a removed pair removed.
 *
 * No baseline is `null`: without one nothing is new, and the report is the inventory. Pure.
 */
export function contractChanges(
  report: QitsContractsPayload,
  baseline: QitsContractsPayload | null,
): QitsContractChanges | null {
  if (!baseline) return null;
  const compared = (role: QitsContractRole): boolean =>
    role === 'CONSUMER'
      ? report.sides.consumer && baseline.sides.consumer
      : report.sides.provider && baseline.sides.provider;

  const pairsNow = pairsOf(report.pacts, compared);
  const pairsThen = pairsOf(baseline.pacts, compared);
  const interactionsNow = interactionsOf(report.pacts, compared);
  const interactionsThen = interactionsOf(baseline.pacts, compared);

  const changed: QitsContractInteraction[] = [];
  for (const [key, now] of interactionsNow) {
    const then = interactionsThen.get(key);
    if (then && then.contentHash !== now.contentHash) changed.push(now.identity);
  }

  const statesCompared = report.sides.providerStates && baseline.sides.providerStates;
  const statesNow = statesCompared ? stateNames(report) : new Set<string>();
  const statesThen = statesCompared ? stateNames(baseline) : new Set<string>();

  return {
    newPairs: missingFrom(pairsNow, pairsThen).sort(comparePairs),
    removedPairs: missingFrom(pairsThen, pairsNow).sort(comparePairs),
    newInteractions: identities(missingFrom(interactionsNow, interactionsThen)),
    removedInteractions: identities(missingFrom(interactionsThen, interactionsNow)),
    changedInteractions: changed.sort(compareInteractions),
    newStates: [...statesNow].filter((name) => !statesThen.has(name)).sort(compareText),
    removedStates: [...statesThen].filter((name) => !statesNow.has(name)).sort(compareText),
  };
}

/** The identity key of a pair; JSON so no name can forge a separator. */
export function qitsPairKey(pair: QitsContractPair): string {
  return JSON.stringify([pair.role, pair.consumer, pair.provider]);
}

/** The identity key of an interaction of `pair`. */
export function qitsInteractionKey(
  pair: QitsContractPair,
  interaction: { readonly description: string; readonly providerStates: readonly string[] },
): string {
  return JSON.stringify([
    pair.role,
    pair.consumer,
    pair.provider,
    interaction.description,
    sortedStates(interaction.providerStates),
  ]);
}

interface Keyed {
  readonly identity: QitsContractInteraction;
  readonly contentHash: string | null;
}

function pairsOf(
  pacts: readonly QitsPactEntry[],
  compared: (role: QitsContractRole) => boolean,
): Map<string, QitsContractPair> {
  const pairs = new Map<string, QitsContractPair>();
  for (const pact of pacts) {
    if (!compared(pact.role)) continue;
    const pair = { role: pact.role, consumer: pact.consumer, provider: pact.provider };
    const key = qitsPairKey(pair);
    if (!pairs.has(key)) pairs.set(key, pair);
  }
  return pairs;
}

function interactionsOf(
  pacts: readonly QitsPactEntry[],
  compared: (role: QitsContractRole) => boolean,
): Map<string, Keyed> {
  const interactions = new Map<string, Keyed>();
  for (const pact of pacts) {
    if (!compared(pact.role)) continue;
    for (const interaction of pact.interactions) {
      const key = qitsInteractionKey(pact, interaction);
      if (interactions.has(key)) continue;
      interactions.set(key, {
        identity: identityOf(pact, interaction),
        contentHash: interaction.contentHash,
      });
    }
  }
  return interactions;
}

function identityOf(
  pact: QitsPactEntry,
  interaction: QitsInteractionEntry,
): QitsContractInteraction {
  return {
    role: pact.role,
    consumer: pact.consumer,
    provider: pact.provider,
    description: interaction.description,
    providerStates: sortedStates(interaction.providerStates),
  };
}

function missingFrom<T>(from: Map<string, T>, other: Map<string, T>): T[] {
  return [...from].filter(([key]) => !other.has(key)).map(([, value]) => value);
}

function identities(keyed: readonly Keyed[]): QitsContractInteraction[] {
  return keyed.map((entry) => entry.identity).sort(compareInteractions);
}

function stateNames(payload: QitsContractsPayload): Set<string> {
  return new Set((payload.providerStates?.states ?? []).map((state) => state.name));
}

function sortedStates(states: readonly string[]): string[] {
  return [...states].sort(compareText);
}

/** Code-unit order, which is Java's `String.compareTo` — the CLI sorts the same way. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePairs(a: QitsContractPair, b: QitsContractPair): number {
  return (
    compareText(a.role, b.role) ||
    compareText(a.consumer, b.consumer) ||
    compareText(a.provider, b.provider)
  );
}

function compareInteractions(a: QitsContractInteraction, b: QitsContractInteraction): number {
  return (
    comparePairs(a, b) ||
    compareText(a.description, b.description) ||
    compareText(a.providerStates.join('\u0000'), b.providerStates.join('\u0000'))
  );
}
