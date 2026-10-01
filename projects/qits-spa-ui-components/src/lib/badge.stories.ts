import type { Meta, StoryObj } from '@storybook/angular-vite';

import { QitsBadge } from './badge';

const meta: Meta<QitsBadge> = {
  title: 'Components/Badge',
  component: QitsBadge,
  tags: ['autodocs'],
  args: { label: 'SUCCESS', tone: 'success' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'info', 'success', 'warning', 'danger', 'highlight'],
    },
  },
};

export default meta;
type Story = StoryObj<QitsBadge>;

export const Success: Story = {};

export const Neutral: Story = { args: { label: 'QUEUED', tone: 'neutral' } };

export const Danger: Story = { args: { label: 'FAILED', tone: 'danger' } };

/**
 * Tones are semantic names, not colours — a caller says `success`, never `#16a34a`, which is what
 * keeps a restyle of the whole system inside this repository. Here they are side by side.
 */
export const EveryTone: Story = {
  name: 'Every tone',
  render: () => ({
    template: `
      <div style="display: flex; align-items: center; gap: 8px">
        <qits-badge label="QUEUED" tone="neutral" />
        <qits-badge label="RUNNING" tone="info" />
        <qits-badge label="SUCCESS" tone="success" />
        <qits-badge label="FLAKY" tone="warning" />
        <qits-badge label="FAILED" tone="danger" />
        <qits-badge label="REFINED" tone="highlight" />
      </div>
    `,
  }),
};
