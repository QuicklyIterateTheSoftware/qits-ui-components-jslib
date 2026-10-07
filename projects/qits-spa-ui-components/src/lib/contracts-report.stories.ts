import type { Meta, StoryObj } from '@storybook/angular-vite';

import { QitsContractsReport } from './contracts-report';
import {
  FULL_DIFF,
  NO_BASELINE,
  PROVIDER_ABSENT,
  TRUNCATED,
  contractsContext,
  contractsReport,
} from './fixtures/contracts/contracts-states';

const meta: Meta<QitsContractsReport> = {
  title: 'Reports/Contracts',
  component: QitsContractsReport,
  tags: ['autodocs'],
  args: { ...FULL_DIFF },
};

export default meta;
type Story = StoryObj<QitsContractsReport>;

/**
 * The shared diff fixture: a new pair on each side, a removed pair, new, removed and changed
 * interactions, a new provider state and a removed one in the warning tone.
 */
export const FullDiff: Story = { name: 'Against a baseline' };

/** A first release, or a baseline from before the kind: nothing is new, the inventory is all. */
export const NoBaseline: Story = { name: 'No baseline', args: { ...NO_BASELINE } };

/** The verifier did not run: the provider side is said not reported, and nothing on it removed. */
export const ProviderSideAbsent: Story = {
  name: 'Provider side not reported',
  args: { ...PROVIDER_ABSENT },
};

/** Over 2,000 interactions: the report says plainly that the lists are incomplete. */
export const Truncated: Story = { name: 'Truncated', args: { ...TRUNCATED } };

/** A payload that is not a contracts report: one line, never an error. */
export const Unreadable: Story = {
  name: 'Unreadable payload',
  args: {
    report: contractsReport('r-contracts', { pacts: 'not a list' }),
    baseline: null,
    context: contractsContext(false),
  },
};
