import { mount } from '../testing/browser/mount';
import { QitsContractsReport } from './contracts-report';
import {
  contractsContext,
  contractsReport,
  FULL_DIFF,
  NO_BASELINE,
} from './fixtures/contracts/contracts-states';

/** Screenshots of the contracts report: against a baseline, the inventory alone, and unreadable. */
const STYLE = 'display: block; padding: 8px; width: 760px';

describe('QitsContractsReport (screenshots)', () => {
  it('shows what changed against a baseline', async () => {
    const { view } = await mount(QitsContractsReport, { ...FULL_DIFF }, STYLE);
    await expect.element(view()).toMatchScreenshot('full-diff', { kind: 'DATA' });
  });

  it('shows the inventory without a baseline', async () => {
    const { view } = await mount(QitsContractsReport, { ...NO_BASELINE }, STYLE);
    await expect.element(view()).toMatchScreenshot('no-baseline', { kind: 'DATA' });
  });

  it('says so when the payload is unreadable', async () => {
    const { view } = await mount(
      QitsContractsReport,
      {
        report: contractsReport('r-contracts', { pacts: 'not a list' }),
        baseline: null,
        context: contractsContext(false),
      },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('unreadable', { kind: 'ERROR' });
  });
});
