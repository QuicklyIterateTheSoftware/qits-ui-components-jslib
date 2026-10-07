import { contractChanges } from './contracts-diff';
import { readContractsPayload, type QitsContractsPayload } from './contracts-report.types';
// The shared diff fixtures, copied VERBATIM — change them on the CLI's side and copy them again,
// never edit them here, so the browser and the CLI keep answering the same question the same way.
//   source:  qits-platform-access-cli
//   path:    platform-access-commands/src/test/resources/report/contracts/diff/{baseline,report,changes}.json
//   commit:  INTERIM — the CLI had not committed its set yet (qits-759); these were written to the
//            same shape file and are to be replaced by the CLI's files, with the sha noted here.
import baselineJson from './fixtures/contracts/diff/baseline.json';
import changesJson from './fixtures/contracts/diff/changes.json';
import reportJson from './fixtures/contracts/diff/report.json';

const REPORT = reportJson as unknown as QitsContractsPayload;
const BASELINE = baselineJson as unknown as QitsContractsPayload;

describe('contractChanges', () => {
  it('answers the shared fixture exactly as the CLI does', () => {
    expect(contractChanges(REPORT, BASELINE)).toEqual(changesJson);
  });

  it('answers the shared fixture the same after the payload guard', () => {
    expect(
      contractChanges(readContractsPayload(reportJson)!, readContractsPayload(baselineJson)),
    ).toEqual(changesJson);
  });

  it('lists every key, in the shape file’s order', () => {
    expect(Object.keys(contractChanges(REPORT, REPORT)!)).toEqual([
      'newPairs',
      'removedPairs',
      'newInteractions',
      'removedInteractions',
      'changedInteractions',
      'newStates',
      'removedStates',
    ]);
    expect(Object.values(contractChanges(REPORT, REPORT)!).every((list) => list.length === 0)).toBe(
      true,
    );
  });

  it('is null without a baseline: nothing is new, the report is the inventory', () => {
    expect(contractChanges(REPORT, null)).toBeNull();
  });

  it('compares no side either report did not read', () => {
    const noProviderNow: QitsContractsPayload = {
      ...REPORT,
      sides: { ...REPORT.sides, provider: false },
      pacts: REPORT.pacts.filter((pact) => pact.role !== 'PROVIDER'),
    };
    const changes = contractChanges(noProviderNow, BASELINE)!;
    const roles = [
      ...changes.newPairs,
      ...changes.removedPairs,
      ...changes.newInteractions,
      ...changes.removedInteractions,
      ...changes.changedInteractions,
    ].map((entry) => entry.role);
    expect(roles).not.toContain('PROVIDER');
    // The consumer side is still compared.
    expect(changes.removedPairs).toEqual(changesJson.removedPairs);

    // Absent in the baseline instead: the report's provider pacts are not "new" either.
    const noProviderThen: QitsContractsPayload = {
      ...BASELINE,
      sides: { ...BASELINE.sides, provider: false },
      pacts: BASELINE.pacts.filter((pact) => pact.role !== 'PROVIDER'),
    };
    const fromThen = contractChanges(REPORT, noProviderThen)!;
    expect(fromThen.newPairs.map((pair) => pair.role)).toEqual(['CONSUMER']);
    expect(fromThen.newInteractions.every((entry) => entry.role === 'CONSUMER')).toBe(true);
  });

  it('compares states only where both reports read an index', () => {
    const noIndex: QitsContractsPayload = {
      ...REPORT,
      sides: { ...REPORT.sides, providerStates: false },
      providerStates: null,
    };
    const changes = contractChanges(noIndex, BASELINE)!;
    expect(changes.newStates).toEqual([]);
    expect(changes.removedStates).toEqual([]);
  });

  it('identifies an interaction by its sorted states, whatever order the pact wrote them in', () => {
    const reordered: QitsContractsPayload = {
      ...BASELINE,
      pacts: BASELINE.pacts.map((pact) => ({
        ...pact,
        interactions: pact.interactions.map((interaction) => ({
          ...interaction,
          providerStates: [...interaction.providerStates].reverse(),
        })),
      })),
    };
    const changes = contractChanges(reordered, BASELINE)!;
    expect(changes.newInteractions).toEqual([]);
    expect(changes.removedInteractions).toEqual([]);
    expect(changes.changedInteractions).toEqual([]);
  });
});

describe('readContractsPayload', () => {
  it('refuses what is not a contracts payload, and never throws', () => {
    for (const value of [null, undefined, 42, 'x', [], {}, { sides: {} }, { pacts: [] }]) {
      expect(readContractsPayload(value)).toBeNull();
    }
  });

  it('drops entries without names and defaults what is missing', () => {
    const payload = readContractsPayload({
      sides: { consumer: true },
      pacts: [
        { role: 'CONSUMER', consumer: 'a', provider: 'b', interactions: [{ description: 'x' }, 7] },
        { role: 'SOMETHING', consumer: 'a', provider: 'b' },
        { role: 'PROVIDER', consumer: 'a' },
      ],
    });
    expect(payload?.sides).toEqual({ consumer: true, provider: false, providerStates: false });
    expect(payload?.pacts).toHaveLength(1);
    expect(payload?.pacts[0].interactions).toEqual([
      {
        description: 'x',
        providerStates: [],
        type: null,
        method: null,
        path: null,
        status: null,
        contentHash: null,
        verified: null,
      },
    ]);
    expect(payload?.providerStates).toBeNull();
    expect(payload?.skipped).toEqual([]);
    expect(payload?.truncated).toBe(false);
  });
});
