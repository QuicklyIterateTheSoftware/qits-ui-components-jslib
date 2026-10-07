/**
 * The entity-changes view's states, shared by its stories and its spec so that "the view renders
 * each story's state" tests exactly what the stories show. The payloads follow qits-760's Design
 * §5 (payload v1) as the CLI's `EntityChangesReportKind` writes it. Nothing here reaches the
 * published package.
 */
import type {
  QitsEntityChangesPayload,
  QitsEntityUnitChange,
  QitsReport,
  QitsReportContext,
} from '../../reports';

export const ENTITY_BASELINE_VERSION = '2026.1003.52637';

/** `docs/database/ci.md`'s mermaid block at the baseline tag. */
export const CI_BEFORE = `erDiagram
  %% ci_run: eu.wohlben.qits.ci.entity.CiRun (ci)
  ci_run {
    uuid id PK "not null"
    string repository "not null, length 255"
    string status "not null, length 32"
  }
  %% ci_step: eu.wohlben.qits.ci.entity.CiStep (ci)
  ci_step {
    uuid id PK "not null"
    string kind "not null, length 64"
    boolean legacy_flag "null"
    uuid run_id FK "not null"
  }
  %% ci_trace: eu.wohlben.qits.ci.entity.CiTrace (ci)
  ci_trace {
    uuid id PK "not null"
    text body "null"
  }
  ci_step }o--|| ci_run : "run_id"
`;

/** The same file at the fold: ci_report added, ci_trace removed, ci_step.kind narrowed. */
export const CI_AFTER = `erDiagram
  %% ci_report: eu.wohlben.qits.ci.entity.CiReport (ci)
  ci_report {
    uuid id PK "not null"
    string kind "not null, length 64"
    text payload "not null, lob"
    uuid run_id FK "not null"
  }
  %% ci_run: eu.wohlben.qits.ci.entity.CiRun (ci)
  ci_run {
    uuid id PK "not null"
    string repository "not null, length 255"
    string status "not null, length 32"
  }
  %% ci_step: eu.wohlben.qits.ci.entity.CiStep (ci)
  ci_step {
    uuid id PK "not null"
    string kind "not null, length 32"
    uuid run_id FK "not null"
    instant started_at "null"
  }
  ci_report }o--|| ci_run : "run_id"
  ci_step }o--|| ci_run : "run_id"
`;

const ARTIFACTS_AFTER = `erDiagram
  %% blob: eu.wohlben.qits.blobstore.entity.Blob (qits-registries-javalib)
  blob {
    string digest PK "not null, length 71"
    long size "not null"
  }
`;

/** CHANGED: a table added, one removed, one with a column added, one removed and one narrowed. */
export const CI_CHANGED: QitsEntityUnitChange = {
  file: 'docs/database/ci.md',
  unit: 'ci',
  status: 'CHANGED',
  tables: [
    {
      name: 'ci_step',
      status: 'CHANGED',
      origin: 'ci',
      columns: {
        added: ['started_at instant, null'],
        removed: ['legacy_flag boolean, null'],
        changed: [{ name: 'kind', before: 'string, not null, 64', after: 'string, not null, 32' }],
      },
    },
    {
      name: 'ci_report',
      status: 'ADDED',
      origin: 'ci',
      columns: {
        added: [
          'id uuid PK, not null',
          'kind string, not null, 64',
          'payload text, not null, lob',
          'run_id uuid FK, not null',
        ],
        removed: [],
        changed: [],
      },
    },
    {
      name: 'ci_trace',
      status: 'REMOVED',
      origin: 'ci',
      columns: { added: [], removed: [], changed: [] },
    },
  ],
  relations: { added: ['ci_report }o--|| ci_run : run_id'], removed: [] },
  before: CI_BEFORE,
  after: CI_AFTER,
};

export const CI_CURRENT: QitsEntityUnitChange = {
  file: 'docs/database/ci.md',
  unit: 'ci',
  status: 'CURRENT',
  tables: [],
  relations: { added: [], removed: [] },
  before: null,
  after: CI_AFTER,
};

export const CI_UNCHANGED: QitsEntityUnitChange = {
  file: 'docs/database/ci.md',
  unit: 'ci',
  status: 'UNCHANGED',
  tables: [],
  relations: { added: [], removed: [] },
  before: null,
  after: CI_AFTER,
};

const ARTIFACTS_ADDED: QitsEntityUnitChange = {
  file: 'docs/database/eu.wohlben.qits.blobstore.entity.md',
  unit: 'eu.wohlben.qits.blobstore.entity',
  status: 'ADDED',
  tables: [
    {
      name: 'blob',
      status: 'ADDED',
      origin: 'qits-registries-javalib',
      columns: {
        added: ['digest string PK, not null, 71', 'size long, not null'],
        removed: [],
        changed: [],
      },
    },
  ],
  relations: { added: [], removed: [] },
  before: null,
  after: ARTIFACTS_AFTER,
};

const TRACES_REMOVED: QitsEntityUnitChange = {
  file: 'docs/database/traces.md',
  unit: 'traces',
  status: 'REMOVED',
  tables: [
    {
      name: 'trace_span',
      status: 'REMOVED',
      origin: 'ci',
      columns: { added: [], removed: [], changed: [] },
    },
  ],
  relations: { added: [], removed: ['trace_span }o--|| ci_run : run_id'] },
  before: `erDiagram
  trace_span {
    uuid id PK "not null"
  }
`,
  after: null,
};

export function entityChangesReport(id: string, payload: unknown, kindVersion = 1): QitsReport {
  return {
    id,
    kind: 'entity-changes',
    kindVersion,
    stepIndex: 0,
    highlights: [],
    baselineRunId: null,
    baselineVersion: null,
    payloadBytes: JSON.stringify(payload ?? null).length,
    submittedAt: '2026-10-07T10:00:00Z',
    payload,
  };
}

export function entityChangesContext(withBaseline: boolean): QitsReportContext {
  return {
    runId: 'run-1',
    commitSha: '3f9c2e1a7b5d',
    baseline: withBaseline
      ? {
          version: ENTITY_BASELINE_VERSION,
          runId: 'run-0',
          releaseRequestId: 'rr-0',
          tagSha: 'def5678',
        }
      : null,
    ciOrigin: '',
  };
}

const BASELINE = { version: ENTITY_BASELINE_VERSION, tagSha: 'def5678', hadDiagram: true };

function payload(
  units: readonly QitsEntityUnitChange[],
  overrides: Partial<QitsEntityChangesPayload> = {},
): QitsEntityChangesPayload {
  return { baseline: BASELINE, units, truncated: false, ...overrides };
}

export interface EntityChangesState {
  readonly report: QitsReport;
  readonly baseline: QitsReport | null;
  readonly context: QitsReportContext;
}

function state(payloadValue: QitsEntityChangesPayload, withBaseline = true): EntityChangesState {
  return {
    report: entityChangesReport('r-entities', payloadValue),
    baseline: null,
    context: entityChangesContext(withBaseline),
  };
}

/** A unit CHANGED: a table added and one removed, a column added, `kind` narrowed 64 → 32. */
export const CHANGED = state(payload([CI_CHANGED]));

/** No baseline: the first diagram, After only. */
export const CURRENT = state(payload([CI_CURRENT], { baseline: null }), false);

/** Nothing moved since the baseline: collapsed until asked. */
export const UNCHANGED = state(payload([CI_UNCHANGED]));

/** Over 1 MiB: the unchanged unit's diagram was dropped, and the report says so. */
export const TRUNCATED = state(
  payload(
    [
      CI_CHANGED,
      {
        ...CI_UNCHANGED,
        file: 'docs/database/maintenance.md',
        unit: 'maintenance',
        after: null,
      },
    ],
    { truncated: true },
  ),
);

/** One unit of every status. */
export const EVERY_STATUS = state(
  payload([
    ARTIFACTS_ADDED,
    CI_CHANGED,
    { ...CI_CURRENT, file: 'docs/database/epics.md', unit: 'epics' },
    TRACES_REMOVED,
    { ...CI_UNCHANGED, file: 'docs/database/projects.md', unit: 'projects' },
  ]),
);
