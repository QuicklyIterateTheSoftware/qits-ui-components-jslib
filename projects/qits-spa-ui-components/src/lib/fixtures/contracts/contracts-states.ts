/**
 * The contracts view's states, shared by its stories and its spec so that "the view renders each
 * story's state" tests exactly what the stories show. Built on the shared diff fixtures in
 * `./diff/`, which are copied verbatim from qits-platform-access-cli (see `contracts-diff.spec.ts`
 * for the source commit). Nothing here reaches the published package.
 */
import type { QitsContractsPayload } from '../../contracts-report.types';
import type { QitsReport, QitsReportContext } from '../../reports';
import baselineJson from './diff/baseline.json';
import absentBaselineJson from './diff/provider-side-absent/baseline.json';
import absentReportJson from './diff/provider-side-absent/report.json';
import reportJson from './diff/report.json';

export const CONTRACTS_REPORT = reportJson as unknown as QitsContractsPayload;
export const CONTRACTS_BASELINE = baselineJson as unknown as QitsContractsPayload;

export const CONTRACTS_BASELINE_VERSION = '2026.1006.201216';

export function contractsReport(id: string, payload: unknown): QitsReport {
  return {
    id,
    kind: 'contracts',
    kindVersion: 1,
    stepIndex: 1,
    highlights: [],
    baselineRunId: null,
    baselineVersion: null,
    payloadBytes: JSON.stringify(payload ?? null).length,
    submittedAt: '2026-10-07T10:00:00Z',
    payload,
  };
}

export function contractsContext(withBaseline: boolean): QitsReportContext {
  return {
    runId: 'run-1',
    commitSha: '3f9c2e1a7b5d',
    baseline: withBaseline
      ? {
          version: CONTRACTS_BASELINE_VERSION,
          runId: 'run-0',
          releaseRequestId: 'rr-0',
          tagSha: 'def5678',
        }
      : null,
    ciOrigin: '',
  };
}

export interface ContractsState {
  readonly report: QitsReport;
  readonly baseline: QitsReport | null;
  readonly context: QitsReportContext;
}

/** A first release, or a baseline from before the kind: the inventory only. */
export const NO_BASELINE: ContractsState = {
  report: contractsReport('r-contracts', CONTRACTS_REPORT),
  baseline: null,
  context: contractsContext(false),
};

/** The shared fixture pair: new, removed and changed on both sides, a new and a removed state. */
export const FULL_DIFF: ContractsState = {
  report: contractsReport('r-contracts', CONTRACTS_REPORT),
  baseline: contractsReport('r-contracts-0', CONTRACTS_BASELINE),
  context: contractsContext(true),
};

/**
 * The verifier did not run in this run: no `PROVIDER` pacts, and none of the baseline's is called
 * removed.
 */
export const PROVIDER_ABSENT: ContractsState = {
  report: contractsReport('r-contracts', {
    ...CONTRACTS_REPORT,
    sources: CONTRACTS_REPORT.sources.filter((source) => source.tool !== 'pact-jvm'),
    sides: { ...CONTRACTS_REPORT.sides, provider: false },
    pacts: CONTRACTS_REPORT.pacts.filter((pact) => pact.role !== 'PROVIDER'),
  }),
  baseline: contractsReport('r-contracts-0', CONTRACTS_BASELINE),
  context: contractsContext(true),
};

/**
 * The CLI's second shared case: the baseline read no verification report, so this run's provider
 * pacts are neither new nor anything else — nothing changed.
 */
export const BASELINE_PROVIDER_ABSENT: ContractsState = {
  report: contractsReport('r-contracts', absentReportJson),
  baseline: contractsReport('r-contracts-0', absentBaselineJson),
  context: contractsContext(true),
};

/**
 * More than 2,000 interactions existed, and one pact file did not parse: the report says both
 * plainly.
 */
export const TRUNCATED: ContractsState = {
  report: contractsReport('r-contracts', {
    ...CONTRACTS_REPORT,
    skipped: [{ file: 'pacts/broken.json', reason: 'not a pact: no consumer' }],
    truncated: true,
  }),
  baseline: contractsReport('r-contracts-0', CONTRACTS_BASELINE),
  context: contractsContext(true),
};
