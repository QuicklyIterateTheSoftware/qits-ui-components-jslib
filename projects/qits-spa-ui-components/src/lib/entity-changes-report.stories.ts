import { applicationConfig } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';

import { QitsEntityChangesReport } from './entity-changes-report';
import {
  CHANGED,
  CURRENT,
  EVERY_STATUS,
  TRUNCATED,
  UNCHANGED,
} from './fixtures/entity-changes/entity-changes-states';
// Relative, not `@qits/ui-components/mermaid`: Storybook compiles library sources directly, never
// against the built dist this package's own path mapping points at (ticket qits-1910). Without
// this, the diagrams this report draws would all fall back to their definitions as text.
import { provideQitsMermaid } from '../../mermaid/src/provide-qits-mermaid';

const meta: Meta<QitsEntityChangesReport> = {
  title: 'Reports/Entity changes',
  component: QitsEntityChangesReport,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideQitsMermaid()] })],
  args: { ...CHANGED },
};

export default meta;
type Story = StoryObj<QitsEntityChangesReport>;

/**
 * A unit CHANGED against the baseline: a table added and one removed, a column added and `kind`
 * narrowed from 64 to 32 — with the Before / After switch, both sides drawn by default.
 */
export const Changed: Story = { name: 'Changed, with a narrowed column' };

/** No baseline, or one from before the rollout: the first diagram, After only. */
export const Current: Story = { name: 'Current (no baseline)', args: { ...CURRENT } };

/** Nothing moved since the baseline: collapsed until asked, and mermaid not loaded until then. */
export const Unchanged: Story = { name: 'Unchanged', args: { ...UNCHANGED } };

/** Over 1 MiB: the unchanged unit's diagram was dropped, and the report says so. */
export const Truncated: Story = { name: 'Truncated', args: { ...TRUNCATED } };

/** One unit of every status, each with its chip. */
export const EveryStatus: Story = { name: 'Every status', args: { ...EVERY_STATUS } };
