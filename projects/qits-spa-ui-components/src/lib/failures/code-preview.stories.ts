import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';

import type { QitsSourceFile } from './source-files';
import { QitsCodePreview } from './code-preview-insight';
import {
  locatedFailure,
  STORY_CONTEXT,
  STORY_TEST_FILE,
  storyPlatform,
} from './failure-story-fixtures';

function platform(answer: QitsSourceFile) {
  return applicationConfig({ providers: storyPlatform(answer) });
}

const meta: Meta<QitsCodePreview> = {
  title: 'Failures/Code preview',
  component: QitsCodePreview,
  tags: ['autodocs'],
  decorators: [platform({ kind: 'file', content: STORY_TEST_FILE })],
  args: {
    failure: locatedFailure(),
    kind: { language: 'java', tool: 'surefire', shape: 'ASSERTION', category: 'assertion' },
    context: STORY_CONTEXT,
  },
};

export default meta;
type Story = StoryObj<QitsCodePreview>;

/** The preview on its own, as the area draws it. */
export const Excerpt: Story = { name: 'The test’s lines' };

/** A failure of a repository this page's project does not list: no excerpt and no link. */
export const NotResolvable: Story = {
  name: 'Repository not resolvable here',
  args: {
    failure: locatedFailure({
      repository: { projectId: 'p-other', name: 'qits-elsewhere-service' },
    }),
  },
};

/** The git host no longer has the commit — a release branch since rewritten. */
export const CommitGone: Story = {
  name: 'Commit no longer on the git host',
  decorators: [platform({ kind: 'no-such-rev' })],
};

/** The file is not in the commit: the parser named a path that never existed there. */
export const PathGone: Story = {
  name: 'Path not in the commit',
  decorators: [platform({ kind: 'no-such-path' })],
};

/** The file is binary. */
export const Binary: Story = {
  name: 'Binary file',
  decorators: [platform({ kind: 'binary', size: 40960 })],
};

/** The file is past the git host's 2 MiB content cap. */
export const TooLarge: Story = {
  name: 'File over 2 MiB',
  decorators: [platform({ kind: 'too-large', size: 3 * 1024 * 1024 })],
};

/** The read failed — the host down, a 5xx. */
export const ReadFailed: Story = {
  name: 'Read failed',
  decorators: [platform({ kind: 'failed' })],
};

/** The locator's lines fall outside the file as it stands at the commit. */
export const RangeOutside: Story = {
  name: 'Lines outside the file',
  args: { failure: locatedFailure({ lineStart: 40, lineEnd: 52 }) },
};
