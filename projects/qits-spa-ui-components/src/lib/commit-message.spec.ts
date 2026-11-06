import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { qitsCommitMessageRuns, QitsCommitMessage } from './commit-message';
import { QITS_NAVIGATION, toNavTree } from './navigation';
import { provideQitsWorkBriefs, type QitsWorkBrief, type QitsWorkBriefSource } from './work-briefs';
import { QITS_WORK_LINK, qitsRelativeTime, type QitsWorkLinkFactory } from './work-ref';

function brief(qualifiedId: string, overrides: Partial<QitsWorkBrief> = {}): QitsWorkBrief {
  return {
    id: `uuid-${qualifiedId}`,
    qualifiedId,
    archetype: 'TICKET',
    status: 'READY_FOR_DEV',
    title: `The title of ${qualifiedId}`,
    updatedAt: '2026-11-06T11:29:56.962030Z',
    ...overrides,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('qitsCommitMessageRuns', () => {
  const refs = (message: string, project: string | undefined = 'qits') =>
    qitsCommitMessageRuns(message, project)
      .filter((run) => run.kind === 'ref')
      .map((run) => (run.kind === 'ref' ? run.qualifiedId : ''));

  it('splits a subject into text and the ids it names', () => {
    expect(qitsCommitMessageRuns('feat(qits-1897, qits-3): briefs', 'qits')).toEqual([
      { kind: 'text', text: 'feat(' },
      { kind: 'ref', qualifiedId: 'qits-1897' },
      { kind: 'text', text: ', ' },
      { kind: 'ref', qualifiedId: 'qits-3' },
      { kind: 'text', text: '): briefs' },
    ]);
  });

  it('takes an id at either end of the message', () => {
    expect(qitsCommitMessageRuns('qits-1', 'qits')).toEqual([
      { kind: 'ref', qualifiedId: 'qits-1' },
    ]);
    expect(refs('qits-1 and qits-2')).toEqual(['qits-1', 'qits-2']);
  });

  it('takes whole words only', () => {
    expect(refs('fooqits-1')).toEqual([]);
    expect(refs('other-qits-1')).toEqual([]);
    expect(refs('qits_qits-1')).toEqual([]);
    expect(refs('qits-1897x')).toEqual([]);
    expect(refs('qits-1897_x')).toEqual([]);
    expect(refs('qits-ci-service')).toEqual([]);
    expect(refs('qits-')).toEqual([]);
    expect(refs('qits-1897-followup')).toEqual(['qits-1897']);
    expect(refs('(qits-1).')).toEqual(['qits-1']);
    expect(refs('#qits-1/qits-2')).toEqual(['qits-1', 'qits-2']);
  });

  it("matches the project's own slug only, case-sensitively", () => {
    expect(refs('fx-1 qits-2', 'fx')).toEqual(['fx-1']);
    expect(refs('QITS-1 Qits-2 qits-3')).toEqual(['qits-3']);
    expect(refs('qits-qits-4', 'qits-qits')).toEqual(['qits-qits-4']);
    expect(refs('qits-qits-4', 'qits')).toEqual([]);
  });

  it('escapes the slug', () => {
    expect(refs('a-b-1 axb-2', 'a.b')).toEqual([]);
    expect(refs('a.b-1', 'a.b')).toEqual(['a.b-1']);
  });

  it('is plain text without a project, and nothing for an empty message', () => {
    expect(qitsCommitMessageRuns('fix(qits-1): x', undefined)).toEqual([
      { kind: 'text', text: 'fix(qits-1): x' },
    ]);
    expect(qitsCommitMessageRuns('', 'qits')).toEqual([]);
  });
});

describe('qitsRelativeTime', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  it('says how long ago, compactly', () => {
    expect(qitsRelativeTime('2026-11-06T11:59:30Z', now)).toBe('just now');
    expect(qitsRelativeTime('2026-11-06T11:55:00Z', now)).toBe('5m ago');
    expect(qitsRelativeTime('2026-11-06T09:00:00Z', now)).toBe('3h ago');
    expect(qitsRelativeTime('2026-11-02T12:00:00Z', now)).toBe('4d ago');
    expect(qitsRelativeTime('2026-09-01T12:00:00Z', now)).toBe('2mo ago');
    expect(qitsRelativeTime('2025-10-01T12:00:00Z', now)).toBe('1y ago');
    expect(qitsRelativeTime('2026-11-07T00:00:00Z', now)).toBe('just now');
    expect(qitsRelativeTime('soon', now)).toBe('soon');
  });
});

@Component({
  imports: [QitsCommitMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="row" href="/commits/abc" (click)="row($event)"
      ><span class="message"><qits-commit-message [message]="first()" [project]="project()" /></span
    ></a>
    <span class="second"><qits-commit-message [message]="second()" [project]="project()" /></span>
    <button type="button" class="outside">elsewhere</button>
  `,
})
class Host {
  readonly first = signal('feat(qits-1897): work refs in commit messages');
  readonly second = signal('fix(qits-1, qits-404): two more, qits-1897 again');
  readonly project = signal<string | undefined>('qits');
  rowClicks = 0;
  /** Whether the last click reached the row with its default (following the link) intact. */
  rowFollowed = false;

  row(event: MouseEvent): void {
    this.rowClicks++;
    this.rowFollowed = !event.defaultPrevented;
    event.preventDefault(); // jsdom cannot follow it
  }
}

describe('QitsCommitMessage', () => {
  let fixture: ComponentFixture<Host>;
  let source: ReturnType<typeof vi.fn<QitsWorkBriefSource>>;

  async function render(
    providers: unknown[] = [],
    answer: QitsWorkBriefSource = async (_p, ids) =>
      ids.filter((id) => id !== 'qits-404').map((id) => brief(id)),
  ): Promise<void> {
    source = vi.fn<QitsWorkBriefSource>(answer);
    TestBed.configureTestingModule({
      providers: [provideQitsWorkBriefs(source), ...(providers as never[])],
    });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await settle();
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const triggers = () => [...el().querySelectorAll<HTMLElement>('.qits-work-ref')];
  const trigger = (index = 0) => triggers()[index];
  const panel = (index = 0) =>
    el().querySelectorAll<HTMLElement>('.qits-work-ref-panel')[index] as HTMLElement;
  const isOpen = (index = 0) => panel(index).classList.contains('qits-work-ref-panel-open');
  const refHost = (index = 0) => el().querySelectorAll<HTMLElement>('qits-work-ref')[index];

  function pointer(target: Element, type: string, pointerType: string): PointerEvent {
    const Ctor = (globalThis.PointerEvent ?? MouseEvent) as typeof PointerEvent;
    const bubbles = type !== 'pointerenter' && type !== 'pointerleave';
    const event = new Ctor(type, { bubbles, cancelable: true, pointerType } as PointerEventInit);
    if (event.pointerType !== pointerType) {
      Object.defineProperty(event, 'pointerType', { value: pointerType });
    }
    target.dispatchEvent(event);
    return event;
  }

  function click(target: Element): MouseEvent {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  /** A tap: the press, then its click, as a touch screen sends them. */
  async function tap(target: Element): Promise<MouseEvent> {
    pointer(target, 'pointerdown', 'touch');
    const event = click(target);
    await fixture.whenStable();
    return event;
  }

  async function changed(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('asks once for every id of every message in the view, and draws them as references', async () => {
    await render();
    expect(source).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledWith('qits', ['qits-1897', 'qits-1', 'qits-404']);
    expect(triggers().map((t) => t.textContent)).toEqual(['qits-1897', 'qits-1', 'qits-1897']);
    expect(trigger().getAttribute('aria-describedby')).toBe(
      panel().querySelector('[role="tooltip"]')?.id,
    );
  });

  it('keeps the message text exactly, an unknown id as plain text without a wrapper', async () => {
    await render();
    // What reads on the line: the panels are not shown until opened.
    const line = el().querySelector('.message')?.cloneNode(true) as HTMLElement;
    line.querySelectorAll('.qits-work-ref-panel').forEach((panel) => panel.remove());
    expect(line.textContent).toBe('feat(qits-1897): work refs in commit messages');
    const second = el().querySelector('.second qits-commit-message') as HTMLElement;
    const unknown = second.querySelectorAll('qits-work-ref')[1];
    expect(unknown.textContent).toBe('qits-404');
    expect(unknown.querySelector('span, a, [role]')).toBeNull();
  });

  it('is plain text while the briefs are pending, and when the read fails', async () => {
    await render([], () => new Promise(() => undefined));
    expect(triggers()).toHaveLength(0);
    expect(el().querySelector('.message')?.textContent).toBe(
      'feat(qits-1897): work refs in commit messages',
    );
    TestBed.resetTestingModule();

    await render([], async () => {
      throw new Error('503');
    });
    expect(triggers()).toHaveLength(0);
    expect(el().querySelectorAll('.qits-work-ref-panel')).toHaveLength(0);
  });

  it('is plain text and asks nothing without a project', async () => {
    source = vi.fn<QitsWorkBriefSource>(async () => []);
    TestBed.configureTestingModule({ providers: [provideQitsWorkBriefs(source)] });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.project.set(undefined);
    fixture.detectChanges();
    await settle();
    await fixture.whenStable();
    expect(source).not.toHaveBeenCalled();
    expect(el().querySelectorAll('qits-work-ref')).toHaveLength(0);
    expect(el().querySelector('.message')?.textContent).toBe(
      'feat(qits-1897): work refs in commit messages',
    );
  });

  it('shows the id, the status, the age and the title in the panel', async () => {
    await render();
    const box = panel().querySelector('[role="tooltip"]') as HTMLElement;
    expect(box.querySelector('a')?.textContent).toBe('qits-1897');
    expect(box.querySelector('qits-badge')?.textContent?.trim()).toBe('ready for dev');
    const time = box.querySelector('time') as HTMLTimeElement;
    expect(time.getAttribute('datetime')).toBe('2026-11-06T11:29:56.962030Z');
    expect(time.title).toBe('2026-11-06T11:29:56.962030Z');
    expect(time.textContent).toMatch(/ago$|just now/);
    expect(box.textContent).toContain('The title of qits-1897');
  });

  describe('with a fine pointer', () => {
    it('opens on hover and closes when the pointer leaves', async () => {
      await render();
      expect(isOpen()).toBe(false);
      pointer(refHost(), 'pointerenter', 'mouse');
      await changed();
      expect(isOpen()).toBe(true);
      pointer(refHost(), 'pointerleave', 'mouse');
      await changed();
      expect(isOpen()).toBe(false);
    });

    it('leaves a click on the id to the row around it', async () => {
      await render();
      pointer(trigger(), 'pointerdown', 'mouse');
      click(trigger());
      expect(fixture.componentInstance.rowClicks).toBe(1);
      expect(fixture.componentInstance.rowFollowed).toBe(true);
    });

    it('opens on keyboard focus, and Escape closes it until the focus returns', async () => {
      await render();
      trigger().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await changed();
      expect(isOpen()).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await changed();
      expect(isOpen()).toBe(false);

      pointer(refHost(), 'pointerenter', 'mouse');
      await changed();
      expect(isOpen()).toBe(true);
    });

    it('places the panel below the id, inside the window', async () => {
      await render();
      vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue({
        left: 1000,
        right: 1060,
        top: 100,
        bottom: 118,
        width: 60,
        height: 18,
        x: 1000,
        y: 100,
        toJSON: () => ({}),
      });
      Object.defineProperty(panel(), 'offsetWidth', { value: 300 });
      Object.defineProperty(panel(), 'offsetHeight', { value: 60 });
      pointer(refHost(), 'pointerenter', 'mouse');
      await changed();
      expect(panel().style.top).toBe('118px');
      expect(panel().style.left).toBe(`${window.innerWidth - 300 - 8}px`);
    });
  });

  describe('with a coarse pointer', () => {
    it('opens on a tap without following the link around it', async () => {
      await render();
      const event = await tap(trigger());
      expect(event.defaultPrevented).toBe(true);
      expect(fixture.componentInstance.rowClicks).toBe(0);
      expect(isOpen()).toBe(true);
    });

    it('ignores the touch pointer entering, and opens on the tap alone', async () => {
      await render();
      pointer(refHost(), 'pointerenter', 'touch');
      await changed();
      expect(isOpen()).toBe(false);
    });

    it('closes on a second tap on the id', async () => {
      await render();
      await tap(trigger());
      const second = await tap(trigger());
      expect(second.defaultPrevented).toBe(true);
      expect(isOpen()).toBe(false);
      expect(fixture.componentInstance.rowClicks).toBe(0);
    });

    it('closes on a press anywhere outside', async () => {
      await render();
      await tap(trigger());
      pointer(el().querySelector('.outside') as Element, 'pointerdown', 'touch');
      await changed();
      expect(isOpen()).toBe(false);
    });

    it('stays open for a press inside its own panel, whose link navigates', async () => {
      await render();
      await tap(trigger());
      const link = panel().querySelector('a') as HTMLAnchorElement;
      pointer(link, 'pointerdown', 'touch');
      await changed();
      expect(isOpen()).toBe(true);

      link.setAttribute('href', '#work'); // a fragment, which jsdom can follow
      const followed = link.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      expect(followed).toBe(true);
      expect(fixture.componentInstance.rowClicks).toBe(0);
    });

    it('closes on Escape', async () => {
      await render();
      await tap(trigger());
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await changed();
      expect(isOpen()).toBe(false);
    });

    it('treats a click without a press as coarse where the device is', async () => {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query === '(pointer: coarse)',
      })) as unknown as typeof window.matchMedia;
      try {
        await render();
        const event = click(trigger());
        await fixture.whenStable();
        expect(event.defaultPrevented).toBe(true);
        expect(isOpen()).toBe(true);
      } finally {
        window.matchMedia = original;
      }
    });

    it('does nothing to a tap on an id without a brief', async () => {
      await render();
      const unknown = el().querySelectorAll('.second qits-work-ref')[1];
      pointer(unknown, 'pointerdown', 'touch');
      const event = click(unknown);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('the link', () => {
    const href = () => panel().querySelector('a')?.getAttribute('href');

    it("goes to the landing app's work page, from the navigation", async () => {
      await render([
        {
          provide: QITS_NAVIGATION,
          useValue: {
            tree: signal(
              toNavTree({
                origin: 'https://env.example',
                slots: {},
                applications: { 'qits-landing': { origin: 'https://qits.example' } },
              }),
            ),
            failed: signal(false),
          },
        },
      ]);
      expect(href()).toBe('https://qits.example/projects/qits/work/detail/qits-1897');
    });

    it('falls back to the environment origin, then to a relative path', async () => {
      await render([
        {
          provide: QITS_NAVIGATION,
          useValue: {
            tree: signal(toNavTree({ origin: 'https://env.example/', slots: {} })),
            failed: signal(false),
          },
        },
      ]);
      expect(href()).toBe('https://env.example/projects/qits/work/detail/qits-1897');
      TestBed.resetTestingModule();

      await render();
      expect(href()).toBe('/projects/qits/work/detail/qits-1897');
    });

    it('is a router link where the application says so', async () => {
      const inApp: QitsWorkLinkFactory = (project, id) => ({
        routerLink: ['/work', project, id],
      });
      await render([provideRouter([]), { provide: QITS_WORK_LINK, useValue: inApp }]);
      expect(href()).toBe('/work/qits/qits-1897');
    });
  });
});
