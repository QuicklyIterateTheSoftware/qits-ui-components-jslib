import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';

import { QitsCommitMessage } from './commit-message';
import { provideQitsWorkBriefs, type QitsWorkBrief, type QitsWorkBriefSource } from './work-briefs';

const HOUR = 3_600_000;

/** What a fake qits-projects knows: `qits-404` is not one of them, so it stays plain text. */
const KNOWN: Readonly<Record<string, Omit<QitsWorkBrief, 'id' | 'qualifiedId'>>> = {
  'qits-1897': {
    archetype: 'TICKET',
    status: 'IMPLEMENTING',
    title: 'Commit subjects render their work ids as references with a brief popover',
    updatedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
  },
  'qits-1868': {
    archetype: 'TICKET',
    status: 'DONE',
    title: 'Bump the estate to Quarkus 3.40.1',
    updatedAt: new Date(Date.now() - 50 * HOUR).toISOString(),
  },
  'qits-3': {
    archetype: 'EPIC',
    status: 'REFINED',
    title: 'Maintenance: keep every dependency current',
    updatedAt: new Date(Date.now() - 400 * HOUR).toISOString(),
  },
};

/** A literal source, a little slow, so the plain-text first paint is visible too. */
const FAKE_BRIEFS: QitsWorkBriefSource = (_project, ids) =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve(
          ids
            .filter((id) => KNOWN[id])
            .map((id) => ({ id: `uuid-${id}`, qualifiedId: id, ...KNOWN[id] })),
        ),
      300,
    ),
  );

const meta: Meta<QitsCommitMessage> = {
  title: 'Components/CommitMessage',
  component: QitsCommitMessage,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideQitsWorkBriefs(FAKE_BRIEFS)] })],
  args: {
    message: 'feat(qits-1897): work refs in commit messages',
    project: 'qits',
  },
};

export default meta;
type Story = StoryObj<QitsCommitMessage>;

/** One subject: hover `qits-1897` (or tap it on a touch screen) for its brief. */
export const Subject: Story = {};

/** An id qits-projects does not know is plain text, exactly as written. */
export const UnknownId: Story = {
  name: 'Unknown id',
  args: { message: 'fix(qits-404): an id nobody filed' },
};

/** No project, no references: the whole message is text. */
export const NoProject: Story = {
  name: 'No project',
  args: { project: undefined },
};

/**
 * A commit list as the frontends draw it: each row a link, each subject a truncating span. The
 * panel is not clipped by the ellipsis, and a tap on an id on a touch screen opens it instead of
 * following the row. Every id of every row goes out in one request.
 */
export const InACommitList: Story = {
  name: 'In a commit list',
  render: () => ({
    template: `
      <ul style="list-style: none; margin: 0; padding: 0; width: 360px; font: 14px system-ui, sans-serif; color: var(--color-fg)">
        @for (row of rows; track row.sha) {
          <li style="border-bottom: 1px solid var(--color-line-subtle)">
            <a href="#commit" style="display: flex; gap: 8px; padding: 8px 4px; color: inherit; text-decoration: none">
              <code style="color: var(--color-fg-muted)">{{ row.sha }}</code>
              <span style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis">
                <qits-commit-message [message]="row.subject" project="qits" />
              </span>
            </a>
          </li>
        }
      </ul>
    `,
    props: {
      rows: [
        { sha: '426510f', subject: 'bump(qits-1868): 1 dependencies' },
        {
          sha: 'cf729fe',
          subject:
            'chore(qits-1868, qits-1897, qits-404): bump(qits-3): 42 dependencies and a long tail',
        },
        { sha: '2d35c3e', subject: 'feat(qits-1897): work refs in commit messages' },
        { sha: 'c9da0b1', subject: 'docs: qits-ci-service is not a work id' },
      ],
    },
    moduleMetadata: { imports: [QitsCommitMessage] },
  }),
};
