import { TestBed } from '@angular/core/testing';
import { mount, showing } from '../../testing/browser/mount';
import { QitsCodePreview } from './code-preview-insight';
import {
  locatedFailure,
  STORY_CONTEXT,
  STORY_TEST_FILE,
  storyPlatform,
} from './failure-story-fixtures';
import type { QitsSourceFile } from './source-files';

/**
 * Screenshots of a failure's code preview: the test's lines, a repository not resolvable here, and
 * a read that failed. A fake git host answers the read.
 */
const KIND = { language: 'java', tool: 'surefire', shape: 'ASSERTION', category: 'assertion' };

const STYLE = 'display: block; padding: 8px; width: 760px';

function platform(answer: QitsSourceFile): void {
  TestBed.configureTestingModule({ providers: storyPlatform(answer) });
}

/** Waits for the fake git host's answer to be drawn: an excerpt, or a sentence saying why not. */
async function answered(host: Element): Promise<void> {
  await expect.poll(() => !!host.querySelector('qits-code-excerpt, .degraded')).toBe(true);
}

describe('QitsCodePreview (screenshots)', () => {
  it("shows the test's lines", async () => {
    platform({ kind: 'file', content: STORY_TEST_FILE });
    const { host, view } = await mount(
      QitsCodePreview,
      { failure: locatedFailure(), kind: KIND, context: STORY_CONTEXT },
      STYLE,
    );
    await showing(host, 'void refusesAnotherRunsToken()');
    await expect.element(view()).toMatchScreenshot('excerpt', { kind: 'DATA' });
  });

  it('says so when the repository is not resolvable here', async () => {
    platform({ kind: 'file', content: STORY_TEST_FILE });
    const { host, view } = await mount(
      QitsCodePreview,
      {
        failure: locatedFailure({
          repository: { projectId: 'p-other', name: 'qits-elsewhere-service' },
        }),
        kind: KIND,
        context: STORY_CONTEXT,
      },
      STYLE,
    );
    await answered(host);
    await expect.element(view()).toMatchScreenshot('not-resolvable', { kind: 'NO_DATA' });
  });

  it('says so when the read failed', async () => {
    platform({ kind: 'failed' });
    const { host, view } = await mount(
      QitsCodePreview,
      { failure: locatedFailure(), kind: KIND, context: STORY_CONTEXT },
      STYLE,
    );
    await answered(host);
    await expect.element(view()).toMatchScreenshot('read-failed', { kind: 'ERROR' });
  });
});
