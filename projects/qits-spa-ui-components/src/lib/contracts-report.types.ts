/**
 * The `contracts` report's payload, version 1 (qits-759), as the CLI's `ContractsReportKind`
 * writes it: the pacts a repository publishes (`pacts/*.json`, role `CONSUMER`), the pacts its
 * provider verification ran (Pact-JVM's JSON report, role `PROVIDER`), and the provider states its
 * golden-master index declares.
 *
 * The payload type is `QitsContractsPayload` rather than `QitsContractsReport` because that name
 * is the component that draws it — a type and a class cannot share one export, the same reason
 * qits-990 named `QitsRunReportsDto`.
 */

/** The `contracts` kind's wire name. */
export const QITS_CONTRACTS_KIND = 'contracts';

/** Which side of a pact this repository is: it wrote the pact, or it verified it. */
export type QitsContractRole = 'CONSUMER' | 'PROVIDER';

/** One file a parser read. */
export interface QitsContractSource {
  readonly language: string;
  readonly tool: string;
  /** Relative to the repository root. */
  readonly file: string;
  /** `pact-v4`, `pact-jvm-json-report`, `golden-master-index-v1`, … */
  readonly format: string;
}

/**
 * Which inputs this run found. A side that is false was not reported, and is never compared: its
 * pairs are neither new nor removed.
 */
export interface QitsContractSides {
  /** A `pacts/` file was found. */
  readonly consumer: boolean;
  /** A Pact-JVM verification report was found. */
  readonly provider: boolean;
  /** A golden-master index was found. */
  readonly providerStates: boolean;
}

export interface QitsProviderState {
  readonly name: string;
  /** The operationIds the state's golden masters record. */
  readonly operations: readonly string[];
}

/** The provider states a golden-master index declares. */
export interface QitsProviderStates {
  /** The application name the index states. */
  readonly provider: string | null;
  readonly states: readonly QitsProviderState[];
}

/** One interaction, without its bodies. */
export interface QitsInteractionEntry {
  readonly description: string;
  readonly providerStates: readonly string[];
  /** `Synchronous/HTTP`, `Asynchronous/Messages`, …; null where the pact does not say. */
  readonly type: string | null;
  /** Null for a message. */
  readonly method: string | null;
  readonly path: string | null;
  readonly status: number | null;
  /** `sha256:…` over the canonical request + response (or contents); what "changed" compares. */
  readonly contentHash: string | null;
  /** The verifier's result on the provider side; null on the consumer side. */
  readonly verified: 'OK' | 'FAILED' | null;
}

/** One pact: a consumer→provider pair, from one side, with its interactions. */
export interface QitsPactEntry {
  readonly role: QitsContractRole;
  readonly consumer: string;
  readonly provider: string;
  readonly specification: string | null;
  /** The file the pact was read from, relative to the repository root. */
  readonly source: string | null;
  /**
   * The library through which the consumer's calls to the provider go — a shared client such as
   * `qits-eventstream-javalib` — carrying the library's repository, its artifact coordinate and the
   * version pinned. Absent, or explicitly `null`, for a direct pact; the pact file's name is then
   * `<consumer>_<library>_<provider>.json` rather than `<consumer>_<provider>.json`.
   */
  readonly via?: {
    readonly repository: string;
    readonly artifact?: string;
    readonly version?: string;
  } | null;
  readonly interactions: readonly QitsInteractionEntry[];
}

/** A file a parser found but could not read. */
export interface QitsSkippedFile {
  readonly file: string;
  readonly reason: string;
}

/** The `contracts` payload, version 1. */
export interface QitsContractsPayload {
  readonly sources: readonly QitsContractSource[];
  readonly sides: QitsContractSides;
  /** Null where no golden-master index was found. */
  readonly providerStates: QitsProviderStates | null;
  readonly pacts: readonly QitsPactEntry[];
  readonly skipped: readonly QitsSkippedFile[];
  /** More than 2,000 interactions existed; only the first were kept. */
  readonly truncated: boolean;
}

/**
 * A pair's identity: role, consumer and provider, with the names as written in the pact, plus —
 * between consumer and provider, the CLI's own field order — the library's repository the calls go
 * through, or null for a direct pact. Only the repository is identity (see {@link QitsPactEntry.via}
 * for the artifact and version a specific pact pins), so a direct and a library pact for the same
 * consumer and provider are two pairs, never one, and two releases of the same library are one pair,
 * never two.
 */
export interface QitsContractPair {
  readonly role: QitsContractRole;
  readonly consumer: string;
  readonly via: string | null;
  readonly provider: string;
}

/** An interaction's identity: its pair, its description and its sorted provider-state names. */
export interface QitsContractInteraction extends QitsContractPair {
  readonly description: string;
  readonly providerStates: readonly string[];
}

/**
 * What changed against the baseline — the shape the CLI's `ContractChanges` serialises too, so the
 * two are compared on one shared fixture. Every key is always present.
 */
export interface QitsContractChanges {
  readonly newPairs: readonly QitsContractPair[];
  readonly removedPairs: readonly QitsContractPair[];
  readonly newInteractions: readonly QitsContractInteraction[];
  readonly removedInteractions: readonly QitsContractInteraction[];
  readonly changedInteractions: readonly QitsContractInteraction[];
  readonly newStates: readonly string[];
  readonly removedStates: readonly string[];
}

/**
 * Narrows a stored payload to {@link QitsContractsPayload}, or null where it is not one.
 *
 * The top level must be an object with a `sides` object and a `pacts` array; anything less is not
 * a contracts report and the view says so. Below that it is lenient on purpose: an entry missing
 * its names is dropped, a missing list is empty, a missing flag is false — so a field a later
 * version adds or a parser leaves out is drawn as absent, never thrown over. Never throws.
 */
export function readContractsPayload(value: unknown): QitsContractsPayload | null {
  if (!isRecord(value) || !isRecord(value['sides']) || !Array.isArray(value['pacts'])) return null;
  const sides = value['sides'];
  const states = value['providerStates'];
  return {
    sources: records(value['sources'])
      .filter((source) => typeof source['file'] === 'string')
      .map((source) => ({
        language: text(source['language']) ?? '',
        tool: text(source['tool']) ?? '',
        file: source['file'] as string,
        format: text(source['format']) ?? '',
      })),
    sides: {
      consumer: sides['consumer'] === true,
      provider: sides['provider'] === true,
      providerStates: sides['providerStates'] === true,
    },
    providerStates: isRecord(states)
      ? {
          provider: text(states['provider']),
          states: records(states['states'])
            .filter((state) => typeof state['name'] === 'string')
            .map((state) => ({
              name: state['name'] as string,
              operations: strings(state['operations']),
            })),
        }
      : null,
    pacts: records(value['pacts']).flatMap((pact) => {
      const role = pact['role'];
      const consumer = text(pact['consumer']);
      const provider = text(pact['provider']);
      if ((role !== 'CONSUMER' && role !== 'PROVIDER') || consumer === null || provider === null) {
        return [];
      }
      return [
        {
          role,
          consumer,
          provider,
          specification: text(pact['specification']),
          source: text(pact['source']),
          via: readVia(pact['via']),
          interactions: records(pact['interactions'])
            .filter((interaction) => typeof interaction['description'] === 'string')
            .map(readInteraction),
        } satisfies QitsPactEntry,
      ];
    }),
    skipped: records(value['skipped'])
      .filter((skipped) => typeof skipped['file'] === 'string')
      .map((skipped) => ({
        file: skipped['file'] as string,
        reason: text(skipped['reason']) ?? '',
      })),
    truncated: value['truncated'] === true,
  };
}

function readInteraction(interaction: Record<string, unknown>): QitsInteractionEntry {
  const verified = interaction['verified'];
  const status = interaction['status'];
  return {
    description: interaction['description'] as string,
    providerStates: strings(interaction['providerStates']),
    type: text(interaction['type']),
    method: text(interaction['method']),
    path: text(interaction['path']),
    status: typeof status === 'number' && Number.isFinite(status) ? status : null,
    contentHash: text(interaction['contentHash']),
    verified: verified === 'OK' || verified === 'FAILED' ? verified : null,
  };
}

/**
 * `via`'s object, or `undefined` where it is absent, `null`, or has no `repository` — the same
 * "not a library pact" outcome either way, so a report written before `via` existed and one that
 * says `"via": null` read identically.
 */
function readVia(value: unknown): QitsPactEntry['via'] {
  if (!isRecord(value)) return undefined;
  const repository = text(value['repository']);
  if (repository === null) return undefined;
  return {
    repository,
    artifact: text(value['artifact']) ?? undefined,
    version: text(value['version']) ?? undefined,
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
