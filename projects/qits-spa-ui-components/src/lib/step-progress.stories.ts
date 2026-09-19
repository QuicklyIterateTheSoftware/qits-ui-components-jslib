import type { Meta, StoryObj } from '@storybook/angular-vite';

import { QitsStepProgress, type QitsStepProgressStep } from './step-progress';

/**
 * The instants are cut from the moment the story is loaded, because the component's whole subject
 * is *now* against a step's own start. A fixture of frozen ISO strings would drift further from
 * the truth every day the workbench stayed open, and a running step would read as centuries late.
 */
function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

const meta: Meta<QitsStepProgress> = {
  title: 'Components/StepProgress',
  component: QitsStepProgress,
  tags: ['autodocs'],
  args: { label: 'Build progress' },
  // The track fills whatever it is given, and a header panel is where it lives: a few hundred
  // pixels is the width the proportions and the per-step numbers have to work at.
  decorators: [
    (story) => {
      const rendered = story();
      return {
        ...rendered,
        template: `<div style="width: 460px">${rendered.template ?? '<qits-step-progress />'}</div>`,
      };
    },
  ],
};

export default meta;
type Story = StoryObj<QitsStepProgress>;

/**
 * **The epic's own example.** A step 90 seconds into a 250-second expectation, and after it a step
 * that has not started, showing only what it is expected to take.
 *
 * ```
 * [---____] 90s / 250s   [____] 200s
 * ```
 *
 * The second bubble is the point: it is empty because its step has not begun, not because a total
 * has not reached it yet.
 */
export const Running: Story = {
  args: {
    steps: [
      { expectedMillis: 250_000, startedAt: ago(90) },
      { expectedMillis: 200_000 },
    ] satisfies QitsStepProgressStep[],
  },
};

/**
 * A step past its own p95. The bubble holds at full in the quieter overdue tone and **does not
 * consume the next one's** — the step after it has still not started, and says so. This is exactly
 * the case the two bars this replaces got wrong: there, a step overrunning ate the seams after it.
 */
export const Overrun: Story = {
  args: {
    steps: [
      { expectedMillis: 12_000, startedAt: ago(300), finishedAt: ago(291) },
      { expectedMillis: 60_000, startedAt: ago(291) },
      { expectedMillis: 25_000 },
    ] satisfies QitsStepProgressStep[],
  },
};

/** A run nobody has picked up: the shape of what it will do, and no claim about progress. */
export const NotStarted: Story = {
  name: 'Not started',
  args: {
    steps: [
      { expectedMillis: 12_000 },
      { expectedMillis: 95_000 },
      { expectedMillis: 60_000 },
      { expectedMillis: 25_000 },
    ] satisfies QitsStepProgressStep[],
  },
};

/**
 * Every step finished, each showing what it really took against what it was expected to. The third
 * ran well over its p95 and keeps the overdue tone: the fact does not stop being true at the end of
 * the step. Nothing is in flight, so the component's clock is not running at all.
 */
export const Finished: Story = {
  args: {
    steps: [
      { expectedMillis: 12_000, startedAt: ago(400), finishedAt: ago(391) },
      { expectedMillis: 95_000, startedAt: ago(391), finishedAt: ago(300) },
      { expectedMillis: 60_000, startedAt: ago(300), finishedAt: ago(120) },
      { expectedMillis: 25_000, startedAt: ago(120), finishedAt: ago(98) },
    ] satisfies QitsStepProgressStep[],
  },
};

/**
 * Wildly uneven expectations, which is what makes a boundary worth drawing: a 10-second step beside
 * a 15-minute one is a sliver and the rest of the track, not two halves. A step too short to give a
 * whole seam away gives what it has rather than being drawn at a negative width.
 */
export const UnevenSteps: Story = {
  name: 'Uneven steps',
  args: {
    steps: [
      { expectedMillis: 4_000, startedAt: ago(220), finishedAt: ago(217) },
      { expectedMillis: 900_000, startedAt: ago(217) },
      { expectedMillis: 8_000 },
    ] satisfies QitsStepProgressStep[],
  },
};
