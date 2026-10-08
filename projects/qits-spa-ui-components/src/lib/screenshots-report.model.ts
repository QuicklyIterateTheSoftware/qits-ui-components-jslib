/**
 * The `screenshots` report's payload, version 1 (qits-762), as the CLI's `ScreenshotsReportKind`
 * writes it: the committed screenshot baselines at the fold compared with those at the newest
 * released version's tag, as path → blob maps. It carries paths and blob shas, never image bytes;
 * the view reads the bytes from qits-githost when a person opens a row.
 */

/** The `screenshots` kind's wire name. */
export const QITS_SCREENSHOTS_KIND = 'screenshots';

/** What happened to one baseline image between the baseline tag and the fold. */
export type QitsScreenshotStatus = 'NEW' | 'CHANGED' | 'REMOVED';

/** The release compared with: its version and the tag peeled to its commit. */
export interface QitsScreenshotsBaseline {
  readonly version: string;
  /** The commit the before images are read at. */
  readonly commitSha: string;
}

/** A storage convention that found baselines in the repository — `vitest-browser` / `vitest`. */
export interface QitsScreenshotConvention {
  readonly id: string;
  readonly tool: string;
}

/** The counts, always complete — even where `entries` was cut at 1000. */
export interface QitsScreenshotTotals {
  /** The files at the fold. */
  readonly screenshots: number;
  readonly new: number;
  readonly changed: number;
  readonly removed: number;
  readonly unchanged: number;
}

/** One `key=value` line of the renderer fingerprint that differs; a null side is absent there. */
export interface QitsScreenshotRendererEntry {
  readonly key: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** The renderer fingerprint (`renderer.txt`) compared between the two sides. */
export interface QitsScreenshotRenderer {
  readonly path: string;
  readonly changed: boolean;
  readonly entries: readonly QitsScreenshotRendererEntry[];
}

/** One baseline image that is new, changed or removed. */
export interface QitsScreenshotEntry {
  readonly status: QitsScreenshotStatus;
  /** The repository path, the same on both sides. */
  readonly path: string;
  readonly convention: string | null;
  /** `<dir>/<spec file>`, the spec that renders it. */
  readonly spec: string | null;
  readonly name: string | null;
  readonly browser: string | null;
  readonly platform: string | null;
  /** Null for NEW. */
  readonly beforeBlob: string | null;
  /** Null for REMOVED. */
  readonly afterBlob: string | null;
  readonly beforeBytes: number | null;
  readonly afterBytes: number | null;
  /** On a NEW entry: the REMOVED path holding the identical blob. */
  readonly movedFrom: string | null;
  /** On a REMOVED entry: the NEW path holding the identical blob. */
  readonly movedTo: string | null;
}

/**
 * The payload, version 1. Named `…Payload` because `QitsScreenshotsReport` is the component that
 * draws it.
 */
export interface QitsScreenshotsPayload {
  /** qits-githost's storage id of the repository; null and the view can list paths but no images. */
  readonly repositoryId: string | null;
  /** The fold's commit — the after images are read there. */
  readonly headSha: string;
  /** Null without a baseline: every file is NEW. */
  readonly baseline: QitsScreenshotsBaseline | null;
  readonly conventions: readonly QitsScreenshotConvention[];
  readonly totals: QitsScreenshotTotals;
  /** Null where the convention has no record, or there is no baseline. */
  readonly renderer: QitsScreenshotRenderer | null;
  /** NEW, CHANGED, REMOVED, then by path; at most 1000. */
  readonly entries: readonly QitsScreenshotEntry[];
  /** True when more than `entries` existed. */
  readonly truncated: boolean;
}

const STATUSES: ReadonlySet<string> = new Set(['NEW', 'CHANGED', 'REMOVED']);

/**
 * Narrows a stored payload to {@link QitsScreenshotsPayload}, or null where it is not one.
 *
 * The top level must be an object with an `entries` array; anything less is not a screenshots
 * report and the view says so. Below that it is lenient: an entry without a path or with a status
 * this version does not know is dropped, a missing text is null, a missing number null, missing
 * totals are counted from the entries — so a field left out is drawn as absent, never thrown over.
 * Never throws.
 */
export function asScreenshotsPayload(value: unknown): QitsScreenshotsPayload | null {
  if (!isRecord(value) || !Array.isArray(value['entries'])) return null;
  const entries = records(value['entries']).flatMap(readEntry);
  const baseline = value['baseline'];
  const renderer = value['renderer'];
  return {
    repositoryId: text(value['repositoryId']) || null,
    headSha: text(value['headSha']) ?? '',
    baseline:
      isRecord(baseline) && typeof baseline['commitSha'] === 'string'
        ? { version: text(baseline['version']) ?? '', commitSha: baseline['commitSha'] }
        : null,
    conventions: records(value['conventions']).flatMap((convention) =>
      typeof convention['id'] === 'string'
        ? [{ id: convention['id'], tool: text(convention['tool']) ?? '' }]
        : [],
    ),
    totals: readTotals(value['totals'], entries),
    renderer: isRecord(renderer) ? readRenderer(renderer) : null,
    entries,
    truncated: value['truncated'] === true,
  };
}

function readEntry(entry: Record<string, unknown>): QitsScreenshotEntry[] {
  const path = text(entry['path']);
  const status = text(entry['status']);
  if (!path || !status || !STATUSES.has(status)) return [];
  return [
    {
      status: status as QitsScreenshotStatus,
      path,
      convention: text(entry['convention']),
      spec: text(entry['spec']),
      name: text(entry['name']),
      browser: text(entry['browser']),
      platform: text(entry['platform']),
      beforeBlob: text(entry['beforeBlob']),
      afterBlob: text(entry['afterBlob']),
      beforeBytes: count(entry['beforeBytes']),
      afterBytes: count(entry['afterBytes']),
      movedFrom: text(entry['movedFrom']),
      movedTo: text(entry['movedTo']),
    },
  ];
}

function readTotals(value: unknown, entries: readonly QitsScreenshotEntry[]): QitsScreenshotTotals {
  const totals = isRecord(value) ? value : {};
  const of = (status: QitsScreenshotStatus) =>
    entries.filter((entry) => entry.status === status).length;
  const added = count(totals['new']) ?? of('NEW');
  const changed = count(totals['changed']) ?? of('CHANGED');
  const unchanged = count(totals['unchanged']) ?? 0;
  return {
    screenshots: count(totals['screenshots']) ?? added + changed + unchanged,
    new: added,
    changed,
    removed: count(totals['removed']) ?? of('REMOVED'),
    unchanged,
  };
}

function readRenderer(renderer: Record<string, unknown>): QitsScreenshotRenderer {
  return {
    path: text(renderer['path']) ?? '',
    changed: renderer['changed'] === true,
    entries: records(renderer['entries']).flatMap((entry) =>
      typeof entry['key'] === 'string'
        ? [{ key: entry['key'], before: text(entry['before']), after: text(entry['after']) }]
        : [],
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
