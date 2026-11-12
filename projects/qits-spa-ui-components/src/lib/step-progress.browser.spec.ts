import { mount } from '../testing/browser/mount';
import { QitsStepProgress, type QitsStepProgressStep } from './step-progress';

/**
 * Screenshots of the step progress: a running step with one not started, an overrun, a run not
 * started, and a finished run. The component measures against now, so the clock is fixed.
 */
const NOW = Date.parse('2026-11-12T10:00:00Z');

function ago(seconds: number): string {
  return new Date(NOW - seconds * 1000).toISOString();
}

const STYLE = 'display: block; padding: 8px; width: 460px';

const RUNNING: QitsStepProgressStep[] = [
  { expectedMillis: 250_000, startedAt: ago(90) },
  { expectedMillis: 200_000 },
];

const OVERRUN: QitsStepProgressStep[] = [
  { expectedMillis: 12_000, startedAt: ago(300), finishedAt: ago(291) },
  { expectedMillis: 60_000, startedAt: ago(291) },
  { expectedMillis: 25_000 },
];

const NOT_STARTED: QitsStepProgressStep[] = [
  { expectedMillis: 12_000 },
  { expectedMillis: 95_000 },
  { expectedMillis: 60_000 },
  { expectedMillis: 25_000 },
];

const FINISHED: QitsStepProgressStep[] = [
  { expectedMillis: 12_000, startedAt: ago(400), finishedAt: ago(391) },
  { expectedMillis: 95_000, startedAt: ago(391), finishedAt: ago(300) },
  { expectedMillis: 60_000, startedAt: ago(300), finishedAt: ago(120) },
  { expectedMillis: 25_000, startedAt: ago(120), finishedAt: ago(98) },
];

describe('QitsStepProgress (screenshots)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills a running step and leaves the next one empty', async () => {
    const { view } = await mount(QitsStepProgress, { steps: RUNNING }, STYLE);
    await expect.element(view()).toMatchScreenshot('running', { kind: 'DATA' });
  });

  it('holds an overrun step full in the overdue tone', async () => {
    const { view } = await mount(QitsStepProgress, { steps: OVERRUN }, STYLE);
    await expect.element(view()).toMatchScreenshot('overrun', { kind: 'DATA' });
  });

  it('draws a run nobody has picked up', async () => {
    const { view } = await mount(QitsStepProgress, { steps: NOT_STARTED }, STYLE);
    await expect.element(view()).toMatchScreenshot('not-started', { kind: 'PENDING' });
  });

  it('draws a finished run', async () => {
    const { view } = await mount(QitsStepProgress, { steps: FINISHED }, STYLE);
    await expect.element(view()).toMatchScreenshot('finished', { kind: 'DATA' });
  });
});
