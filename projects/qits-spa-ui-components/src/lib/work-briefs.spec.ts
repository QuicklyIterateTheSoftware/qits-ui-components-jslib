import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { QITS_NAVIGATION, toNavTree } from './navigation';
import {
  provideQitsWorkBriefs,
  QITS_WORK_BRIEFS_MAX_IDS,
  QitsWorkBriefs,
  type QitsWorkBrief,
  type QitsWorkBriefSource,
} from './work-briefs';

function brief(qualifiedId: string, overrides: Partial<QitsWorkBrief> = {}): QitsWorkBrief {
  return {
    id: `uuid-${qualifiedId}`,
    qualifiedId,
    archetype: 'TICKET',
    status: 'REFINED',
    title: `The title of ${qualifiedId}`,
    updatedAt: '2026-11-06T11:29:56.962030Z',
    ...overrides,
  };
}

/** Lets queued microtasks and resolved promises run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('QitsWorkBriefs', () => {
  function withSource(source: QitsWorkBriefSource, platform = 'browser'): QitsWorkBriefs {
    TestBed.configureTestingModule({
      providers: [provideQitsWorkBriefs(source), { provide: PLATFORM_ID, useValue: platform }],
    });
    return TestBed.inject(QitsWorkBriefs);
  }

  it('asks once per project for every id requested in the same tick', async () => {
    const source = vi.fn<QitsWorkBriefSource>(async (_project, ids) =>
      ids.filter((id) => id !== 'qits-3').map((id) => brief(id)),
    );
    const briefs = withSource(source);

    const one = briefs.request('qits', 'qits-1');
    const two = briefs.request('qits', 'qits-2');
    const three = briefs.request('qits', 'qits-3');
    const other = briefs.request('fx', 'fx-1');
    expect(source).not.toHaveBeenCalled();
    expect(one()).toBe('pending');

    await settle();
    expect(source).toHaveBeenCalledTimes(2);
    expect(source).toHaveBeenCalledWith('qits', ['qits-1', 'qits-2', 'qits-3']);
    expect(source).toHaveBeenCalledWith('fx', ['fx-1']);
    expect(one()).toEqual(brief('qits-1'));
    expect(two()).toEqual(brief('qits-2'));
    expect(three()).toBeUndefined();
    expect(other()).toEqual(brief('fx-1'));
  });

  it(`splits a batch at ${QITS_WORK_BRIEFS_MAX_IDS} ids`, async () => {
    const source = vi.fn<QitsWorkBriefSource>(async () => []);
    const briefs = withSource(source);
    for (let i = 1; i <= 450; i++) briefs.request('qits', `qits-${i}`);
    await settle();
    expect(source.mock.calls.map(([, ids]) => ids.length)).toEqual([200, 200, 50]);
    expect(source.mock.calls[2][1][0]).toBe('qits-401');
  });

  it('never asks again for an id it has an answer for, found or missing', async () => {
    const source = vi.fn<QitsWorkBriefSource>(async (_p, ids) =>
      ids.filter((id) => id === 'qits-1').map((id) => brief(id)),
    );
    const briefs = withSource(source);
    const first = briefs.request('qits', 'qits-1');
    briefs.request('qits', 'qits-2');
    await settle();

    expect(briefs.request('qits', 'qits-1')()).toEqual(brief('qits-1'));
    expect(briefs.request('qits', 'qits-2')()).toBeUndefined();
    briefs.request('qits', 'qits-1');
    await settle();
    expect(source).toHaveBeenCalledTimes(1);
    expect(first()).toEqual(brief('qits-1'));
  });

  it('does not ask again while the first read is still in flight', async () => {
    let answer: (briefs: QitsWorkBrief[]) => void = () => undefined;
    const source = vi.fn<QitsWorkBriefSource>(() => new Promise((resolve) => (answer = resolve)));
    const briefs = withSource(source);
    briefs.request('qits', 'qits-1');
    await settle();
    const again = briefs.request('qits', 'qits-1');
    await settle();
    expect(source).toHaveBeenCalledTimes(1);
    expect(again()).toBe('pending');
    answer([brief('qits-1')]);
    await settle();
    expect(again()).toEqual(brief('qits-1'));
  });

  it('marks every id of a failed read missing, a thrown one too', async () => {
    const failing = withSource(async () => {
      throw new Error('503');
    });
    const one = failing.request('qits', 'qits-1');
    await settle();
    expect(one()).toBeUndefined();

    TestBed.resetTestingModule();
    const throwing = withSource(() => {
      throw new Error('sync');
    });
    const two = throwing.request('qits', 'qits-2');
    await settle();
    expect(two()).toBeUndefined();
  });

  it('asks nothing on the server, where every id is plain text', async () => {
    const source = vi.fn<QitsWorkBriefSource>(async () => [brief('qits-1')]);
    const briefs = withSource(source, 'server');
    const one = briefs.request('qits', 'qits-1');
    await settle();
    expect(source).not.toHaveBeenCalled();
    expect(one()).toBeUndefined();
  });
});

describe('QitsWorkBriefs over HTTP', () => {
  it("asks qits-projects' own origin, the ids as one comma-separated `id`", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: QITS_NAVIGATION,
          useValue: {
            tree: signal(
              toNavTree({
                slots: {},
                applications: { 'qits-projects': { origin: 'https://projects.qits.example' } },
              }),
            ),
            failed: signal(false),
          },
        },
      ],
    });
    const briefs = TestBed.inject(QitsWorkBriefs);
    const one = briefs.request('qits', 'qits-1');
    const two = briefs.request('qits', 'qits-2');
    briefs.request('qits', 'odd id/');
    await settle();

    const http = TestBed.inject(HttpTestingController);
    const read = http.expectOne(
      'https://projects.qits.example/projects/api/projects/qits/work/briefs?id=qits-1,qits-2,odd%20id%2F',
    );
    expect(read.request.method).toBe('GET');
    read.flush({ briefs: [brief('qits-2')] });
    await settle();
    expect(one()).toBeUndefined();
    expect(two()).toEqual(brief('qits-2'));
    http.verify();
  });

  it('marks the ids missing when the read fails', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const one = TestBed.inject(QitsWorkBriefs).request('qits', 'qits-1');
    await settle();
    TestBed.inject(HttpTestingController)
      .expectOne('/projects/api/projects/qits/work/briefs?id=qits-1')
      .flush('no', { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(one()).toBeUndefined();
  });
});
