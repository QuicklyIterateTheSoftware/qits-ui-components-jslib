import { applicationConfig } from '@storybook/angular-vite';
import type { Meta, StoryObj } from '@storybook/angular-vite';

import { CI_AFTER } from './fixtures/entity-changes/entity-changes-states';
import { QitsMermaidDiagram } from './mermaid-diagram';
import { MERMAID_STORY_LOADER } from './fixtures/mermaid-story-loader';

const meta: Meta<QitsMermaidDiagram> = {
  title: 'Diagrams/Mermaid',
  component: QitsMermaidDiagram,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [MERMAID_STORY_LOADER] })],
  args: { definition: CI_AFTER, label: 'ci entities' },
};

export default meta;
type Story = StoryObj<QitsMermaidDiagram>;

/** A generated entity diagram, drawn by mermaid — loaded only now, in strict mode. */
export const Valid: Story = { name: 'Valid definition' };

/** A definition mermaid cannot parse stays legible: the text, in a `<pre>`. */
export const Invalid: Story = {
  name: 'Invalid definition',
  args: { definition: 'erDiagram\n  ci_run {\n    uuid id PK "not null"\n  ci_run }o--|| : \n' },
};
