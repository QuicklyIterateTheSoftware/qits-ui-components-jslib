import { mount } from '../testing/browser/mount';
import { QitsPicker } from './picker';

/** Screenshots of the picker: the open list, a pick, a placeholder, disabled, and nothing to pick. */
const ENVIRONMENTS = [
  { value: 'dev', label: 'Development' },
  { value: 'staging', label: 'Staging' },
  { value: 'prod', label: 'Production' },
];

const STYLE = 'display: block; padding: 8px; width: 320px';

describe('QitsPicker (screenshots)', () => {
  it('lists the options while nothing is picked', async () => {
    const { view } = await mount(QitsPicker<string>, { options: ENVIRONMENTS }, STYLE);
    await expect.element(view()).toMatchScreenshot('empty', { kind: 'DATA' });
  });

  it('shows the pick', async () => {
    const { view } = await mount(
      QitsPicker<string>,
      { options: ENVIRONMENTS, value: 'staging' },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('selected', { kind: 'DATA' });
  });

  it('shows the placeholder', async () => {
    const { view } = await mount(
      QitsPicker<string>,
      { options: ENVIRONMENTS, placeholder: 'Pick an environment' },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('placeholder', { kind: 'DATA' });
  });

  it('dims a disabled pick', async () => {
    const { view } = await mount(
      QitsPicker<string>,
      { options: ENVIRONMENTS, value: 'prod', disabled: true },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('disabled', { kind: 'DATA' });
  });

  it('says so when there is nothing to pick', async () => {
    const { view } = await mount(QitsPicker<string>, { options: [] }, STYLE);
    await expect.element(view()).toMatchScreenshot('no-options', { kind: 'NO_DATA' });
  });
});
