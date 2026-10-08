/**
 * The screenshots view's states, shared by its stories and its spec so that "the view renders each
 * story's state" tests exactly what the stories show. The payloads follow qits-762's Design §1
 * (payload v1) as the CLI's `ScreenshotsReportKind` writes it. Nothing here reaches the published
 * package.
 */
import type { QitsReport, QitsReportContext } from '../../reports';
import type { QitsScreenshotEntry, QitsScreenshotsPayload } from '../../screenshots-report.model';

export const SCREENSHOTS_REPOSITORY_ID = '488363a1-6ba0-4101-948a-14a8bfcb9e79';
export const SCREENSHOTS_BASELINE_VERSION = '2026.1006.93346';
export const SCREENSHOTS_BASELINE_SHA = 'b4a5e1f09c3d2e7a8b6c5d4e3f2a1b0c9d8e7f6a';
export const SCREENSHOTS_HEAD_SHA = '7e3d9c1b2a4f6e8d0c2b4a6f8e0d2c4b6a8f0e2d';

const SHELL = 'src/app/layout/shell';
const SHELL_SPEC = `${SHELL}/shell.layout.browser.spec.ts`;
const NAV = 'src/app/layout/nav';
const NAV_SPEC = `${NAV}/nav.layout.browser.spec.ts`;
const SCHEDULE = 'src/app/schedule';
const SCHEDULE_SPEC = `${SCHEDULE}/schedule.page.browser.spec.ts`;
const WORK = 'src/app/work';
const WORK_SPEC = `${WORK}/work-item.page.browser.spec.ts`;
const LEGACY = 'src/app/legacy';
const LEGACY_SPEC = `${LEGACY}/legacy.page.browser.spec.ts`;

function shot(dir: string, spec: string, file: string): string {
  return `${dir}/__screenshots__/${spec.slice(spec.lastIndexOf('/') + 1)}/${file}`;
}

function entry(
  status: QitsScreenshotEntry['status'],
  dir: string,
  spec: string,
  name: string,
  overrides: Partial<QitsScreenshotEntry> = {},
): QitsScreenshotEntry {
  return {
    status,
    path: shot(dir, spec, `${name}-chromium-linux.png`),
    convention: 'vitest-browser',
    spec,
    name,
    browser: 'chromium',
    platform: 'linux',
    beforeBlob: status === 'NEW' ? null : `before-${name}`,
    afterBlob: status === 'REMOVED' ? null : `after-${name}`,
    beforeBytes: status === 'NEW' ? null : 11602,
    afterBytes: status === 'REMOVED' ? null : 12011,
    movedFrom: null,
    movedTo: null,
    ...overrides,
  };
}

export const NAV_CLOSED_PATH = shot(NAV, NAV_SPEC, 'narrow-closed-chromium-linux.png');
export const SHELL_CLOSED_PATH = shot(SHELL, SHELL_SPEC, 'narrow-closed-chromium-linux.png');

/** A new screenshot of a new page. */
export const NEW_SCHEDULE = entry('NEW', SCHEDULE, SCHEDULE_SPEC, 'wide', { afterBytes: 20480 });
/** A new screenshot that is the identical image of a removed one: the spec was renamed. */
export const NEW_MOVED = entry('NEW', SHELL, SHELL_SPEC, 'narrow-closed', {
  afterBlob: 'same-blob',
  movedFrom: NAV_CLOSED_PATH,
});
/** A rendering that changed, and grew taller. */
export const CHANGED_NARROW = entry('CHANGED', SHELL, SHELL_SPEC, 'narrow-open');
/** A rendering that changed in place. */
export const CHANGED_WIDE = entry('CHANGED', SHELL, SHELL_SPEC, 'wide', {
  beforeBytes: 30210,
  afterBytes: 30544,
});
/** Re-encoded only: a new blob with the same pixels. */
export const CHANGED_REENCODED = entry('CHANGED', WORK, WORK_SPEC, 'work-item-narrow-expanded', {
  beforeBytes: 9100,
  afterBytes: 9104,
});
/** The removed side of the move. */
export const REMOVED_MOVED = entry('REMOVED', NAV, NAV_SPEC, 'narrow-closed', {
  beforeBlob: 'same-blob',
  movedTo: SHELL_CLOSED_PATH,
});
/** A removed page's screenshot. */
export const REMOVED_LEGACY = entry('REMOVED', LEGACY, LEGACY_SPEC, 'old');

const EVERY_ENTRY: readonly QitsScreenshotEntry[] = [
  NEW_MOVED,
  NEW_SCHEDULE,
  CHANGED_NARROW,
  CHANGED_WIDE,
  CHANGED_REENCODED,
  REMOVED_MOVED,
  REMOVED_LEGACY,
];

function payload(overrides: Partial<QitsScreenshotsPayload> = {}): QitsScreenshotsPayload {
  return {
    repositoryId: SCREENSHOTS_REPOSITORY_ID,
    headSha: SCREENSHOTS_HEAD_SHA,
    baseline: { version: SCREENSHOTS_BASELINE_VERSION, commitSha: SCREENSHOTS_BASELINE_SHA },
    conventions: [{ id: 'vitest-browser', tool: 'vitest' }],
    totals: { screenshots: 40, new: 2, changed: 3, removed: 2, unchanged: 35 },
    renderer: {
      path: 'src/testing/browser/renderer.txt',
      changed: false,
      entries: [],
    },
    entries: EVERY_ENTRY,
    truncated: false,
    ...overrides,
  };
}

export function screenshotsReport(id: string, value: unknown, kindVersion = 1): QitsReport {
  return {
    id,
    kind: 'screenshots',
    kindVersion,
    stepIndex: 0,
    highlights: [],
    baselineRunId: null,
    baselineVersion: null,
    payloadBytes: JSON.stringify(value ?? null).length,
    submittedAt: '2026-10-08T10:00:00Z',
    payload: value,
  };
}

export function screenshotsContext(withBaseline = true): QitsReportContext {
  return {
    runId: 'run-1',
    commitSha: SCREENSHOTS_HEAD_SHA,
    baseline: withBaseline
      ? {
          version: SCREENSHOTS_BASELINE_VERSION,
          runId: 'run-0',
          releaseRequestId: 'rr-0',
          tagSha: SCREENSHOTS_BASELINE_SHA,
        }
      : null,
    ciOrigin: '',
  };
}

export interface ScreenshotsState {
  readonly report: QitsReport;
  readonly baseline: QitsReport | null;
  readonly context: QitsReportContext;
}

function state(value: QitsScreenshotsPayload, withBaseline = true): ScreenshotsState {
  return {
    report: screenshotsReport('r-screenshots', value),
    baseline: null,
    context: screenshotsContext(withBaseline),
  };
}

/** New, changed and removed screenshots, with an exact move between a removed and a new one. */
export const EVERY_STATUS = state(payload());

/** The renderer fingerprint moved: every diff may be renderer noise, and the banner says so. */
export const RENDERER_CHANGED = state(
  payload({
    renderer: {
      path: 'src/testing/browser/renderer.txt',
      changed: true,
      entries: [
        {
          key: 'chromium',
          before: 'Google Chrome for Testing 152.0.7390.54',
          after: 'Google Chrome for Testing 153.0.7412.12',
        },
        { key: 'playwright', before: '1.58.0', after: '1.59.1' },
        { key: 'fonts-noto-color-emoji', before: null, after: '2.047-1' },
      ],
    },
  }),
);

/** A first release: no baseline, so every screenshot at the fold is NEW. */
export const NO_BASELINE = state(
  payload({
    baseline: null,
    renderer: null,
    totals: { screenshots: 3, new: 3, changed: 0, removed: 0, unchanged: 0 },
    entries: [
      { ...NEW_SCHEDULE },
      entry('NEW', SHELL, SHELL_SPEC, 'narrow-open'),
      entry('NEW', SHELL, SHELL_SPEC, 'wide'),
    ],
  }),
  false,
);

/** More than 1000 entries existed: the list is cut, the totals are not. */
export const TRUNCATED = state(
  payload({
    totals: { screenshots: 1300, new: 400, changed: 900, removed: 2, unchanged: 0 },
    entries: [
      ...Array.from({ length: 400 }, (_, i) =>
        entry('NEW', SCHEDULE, SCHEDULE_SPEC, `slot-${String(i).padStart(3, '0')}`),
      ),
      ...Array.from({ length: 600 }, (_, i) =>
        entry('CHANGED', SHELL, SHELL_SPEC, `state-${String(i).padStart(3, '0')}`),
      ),
    ],
    truncated: true,
  }),
);

/** `$QITS_CI_REPO_ID` was blank at submit: the paths are listed, the images cannot be read. */
export const NO_REPOSITORY = state(payload({ repositoryId: null }));
