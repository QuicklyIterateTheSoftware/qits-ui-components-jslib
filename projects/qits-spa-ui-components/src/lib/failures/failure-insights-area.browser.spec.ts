import { TestBed } from '@angular/core/testing';
import { mount, showing } from '../../testing/browser/mount';
import {
  locatedFailure,
  STORY_CONTEXT,
  STORY_TEST_FILE,
  storyPlatform,
} from './failure-story-fixtures';
import { QitsFailureInsightsArea } from './failure-insights-area';

/** Screenshots of a failure's insights area, the standard insights given a located failure. */
const STYLE = 'display: block; padding: 8px; width: 760px';

describe('QitsFailureInsightsArea (screenshots)', () => {
  it('shows the insights of a located failure', async () => {
    TestBed.configureTestingModule({
      providers: storyPlatform({ kind: 'file', content: STORY_TEST_FILE }),
    });
    const { host, view } = await mount(
      QitsFailureInsightsArea,
      { failure: locatedFailure(), context: STORY_CONTEXT },
      STYLE,
    );
    await showing(host, 'void refusesAnotherRunsToken()');
    await expect.element(view()).toMatchScreenshot('located', { kind: 'DATA' });
  });
});
