import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  InjectionToken,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { QitsExit, type ExitOutcome, type PathParams } from '@qits/angular';

import { QitsAppLinks } from './app-links';
import { QitsBadge, type QitsBadgeTone } from './badge';
import { QitsWorkBriefs, type QitsWorkBrief } from './work-briefs';

/**
 * An in-app work link: an exit the application declares with `@qits/angular`'s `outcomes()`, and
 * the params its path takes. `<qits-work-ref>` renders it through `QitsExit`, so the link has a
 * real `href`, a plain click records the outcome and navigates through the router, and the app's
 * outcomes check and lint see where the reference leads. {@link qitsWorkExit} builds one and checks
 * the params against the exit's path.
 */
export interface QitsWorkExitLink<P extends string = string> {
  readonly exit: ExitOutcome<P>;
  readonly params: PathParams<P>;
}

/**
 * Where a work reference leads:
 *
 * - `{ href }` — a full-document link, to another application (the default: the landing app).
 * - `{ exit, params }` — a page of the application rendering the reference, as an exit it declares
 *   ({@link QitsWorkExitLink}).
 * - `{ routerLink }` — **deprecated**, and removed by qits-2042: a router link the outcomes model
 *   cannot see. An in-app link hands back an exit its app declares instead.
 */
export type QitsWorkLink =
  | { readonly href: string }
  | QitsWorkExitLink
  | {
      /**
       * @deprecated Invisible to the app's outcomes; removed by qits-2042. Hand back an exit the
       * app declares with `outcomes()` instead: `{ exit, params }`.
       */
      readonly routerLink: string | readonly unknown[];
    };

/** An exit link, its params checked against the exit's path: `qitsWorkExit(refs.opened, { slug, id })`. */
export function qitsWorkExit<P extends string>(
  exit: ExitOutcome<P>,
  params: PathParams<P>,
): QitsWorkExitLink<P> {
  return { exit, params };
}

/** Maps an item — its project as the reference was given it, and its qualified id — to its link. */
export type QitsWorkLinkFactory = (project: string, qualifiedId: string) => QitsWorkLink;

/** `/projects/<slug>/work/detail/<qualifiedId>`: a work item's page, as the landing app routes it. */
export function qitsWorkDetailPath(project: string, qualifiedId: string): string {
  return `/projects/${encodeURIComponent(project)}/work/detail/${encodeURIComponent(qualifiedId)}`;
}

/**
 * The default link: the item's page on the **landing app**, the apex host that serves
 * `/projects/<slug>/work/…`. Its origin is the navigation's `applications.qits-landing.origin`
 * (`QitsAppLinks.origin`); an edge that does not state one falls back to the environment origin —
 * which on the platform *is* the apex — and with no navigation at all the path is relative. The
 * factory runs inside a `computed`, so the link follows the navigation's answer when it lands.
 */
function landingWorkLink(): QitsWorkLinkFactory {
  const links = inject(QitsAppLinks);
  return (project, qualifiedId) => {
    const origin = links.origin('qits-landing') ?? links.environmentOrigin() ?? '';
    return { href: `${origin.replace(/\/+$/, '')}${qitsWorkDetailPath(project, qualifiedId)}` };
  };
}

/**
 * Where `<qits-work-ref>` links to. Override it where the work pages are this application's own,
 * with an exit the application declares — `outcomes()` runs in the factory's injection context:
 *
 * ```ts
 * {
 *   provide: QITS_WORK_LINK,
 *   useFactory: (): QitsWorkLinkFactory => {
 *     const refs = outcomes('open-work-ref', { opened: exit('projects/:slug/work/detail/:id') });
 *     return (slug, id) => qitsWorkExit(refs.opened, { slug, id });
 *   },
 * }
 * ```
 */
export const QITS_WORK_LINK = new InjectionToken<QitsWorkLinkFactory>('QITS_WORK_LINK', {
  providedIn: 'root',
  factory: landingWorkLink,
});

/** The shared entity status palette — qits-projects-frontend's `STATUS_TONES` — neutral otherwise. */
const STATUS_TONES: Readonly<Record<string, QitsBadgeTone>> = {
  REPORTED: 'neutral',
  REFINED: 'highlight',
  READY_FOR_DEV: 'highlight',
  IMPLEMENTING: 'info',
  IMPLEMENTED: 'info',
  VERIFYING: 'info',
  VERIFIED: 'warning',
  DONE: 'success',
  DROPPED: 'neutral',
};

/** A work status's badge tone. */
export function qitsWorkStatusTone(status: string): QitsBadgeTone {
  return STATUS_TONES[status] ?? 'neutral';
}

/**
 * How long ago `instant` was, compactly: `just now`, `5m ago`, `3h ago`, `4d ago`, `2mo ago`,
 * `1y ago`. An instant in the future reads `just now`; one that does not parse, as given.
 */
export function qitsRelativeTime(instant: string, now: number = Date.now()): string {
  const then = Date.parse(instant);
  if (Number.isNaN(then)) return instant;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** The space kept between the panel and the window's edges. */
const EDGE = 8;

let nextPanelId = 0;

type PointerKind = 'mouse' | 'coarse';

/**
 * A work item's qualified id — `qits-1897` — and, once its brief is known, a reference to it with a
 * compact popover: the id as a link to the item's page, its status and when it last changed, then
 * its title.
 *
 * **Without a brief it is the id as plain text and nothing else**: unknown to qits-projects, still
 * pending, a failed read, a server render. No underline, no panel, no wrapper — so the server and
 * the browser render the same markup, and a reference never changes a layout it is dropped into.
 *
 * - A **fine pointer** opens it by hovering, the keyboard by focus; the pointer can move onto the
 *   panel. A click on the id is left alone, so a row or a link around it still does its job.
 * - A **coarse pointer** (touch, pen) opens it with a tap, and that tap is *consumed* —
 *   `preventDefault()` and `stopPropagation()` — so the commit link or clickable row around it is
 *   not followed. A second tap on the id, or a press anywhere outside, closes it; the link inside
 *   the panel navigates.
 * - Escape closes it until the pointer or the focus comes back.
 *
 * The panel goes to the **top layer** (`popover="manual"`) where the browser has the Popover API,
 * and is `position: fixed` either way, placed from the id's `getBoundingClientRect()` when it opens
 * and kept inside the window: an ancestor's `overflow: hidden` — a truncating commit subject —
 * cannot clip it, and the top layer escapes a transformed ancestor and every `z-index` too. It
 * follows the id on scroll and resize while open.
 *
 * `project` is the item's project as the briefs door and the link take it — a slug, for a commit
 * subject. `brief` given is shown as it is and nothing is asked for.
 */
@Component({
  selector: 'qits-work-ref',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsBadge, QitsExit, RouterLink],
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointercancel)': 'pressing = undefined',
    '(pointerenter)': 'onPointerEnter($event)',
    '(pointerleave)': 'onPointerLeave($event)',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
    '(click)': 'onClick($event)',
    '(document:keydown.escape)': 'onEscape()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
  template: `@if (shown(); as brief) {
      <span
        #trigger
        class="qits-work-ref"
        tabindex="0"
        [class.qits-work-ref-open]="open()"
        [attr.aria-describedby]="panelId"
        >{{ qualifiedId() }}</span
      ><span
        #panel
        class="qits-work-ref-panel"
        popover="manual"
        [class.qits-work-ref-panel-open]="open()"
      >
        <span [id]="panelId" role="tooltip" class="qits-work-ref-box">
          <span class="qits-work-ref-head">
            @if (exit(); as to) {
              <a class="qits-work-ref-link" [qitsExit]="to.exit" [exitParams]="to.params">{{
                qualifiedId()
              }}</a>
            } @else if (route(); as commands) {
              <a class="qits-work-ref-link" [routerLink]="commands">{{ qualifiedId() }}</a>
            } @else {
              <a class="qits-work-ref-link" [href]="href()">{{ qualifiedId() }}</a>
            }
            <qits-badge [label]="statusLabel()" [tone]="statusTone()" />
            <time
              class="qits-work-ref-time"
              [attr.datetime]="brief.updatedAt"
              [title]="brief.updatedAt"
              >{{ ago() }}</time
            >
          </span>
          <span class="qits-work-ref-title">{{ brief.title }}</span>
        </span>
      </span>
    } @else {
      <ng-container>{{ qualifiedId() }}</ng-container>
    }`,
  styles: `
    :host {
      display: inline;
    }
    .qits-work-ref {
      text-decoration: underline dotted;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
      cursor: help;
      border-radius: 2px;
    }
    .qits-work-ref:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 1px;
    }
    .qits-work-ref-panel {
      display: none;
      position: fixed;
      inset: auto;
      top: 0;
      left: 0;
      z-index: 1000;
      margin: 0;
      border: 0;
      background: transparent;
      overflow: visible;
      color: inherit;
      /* The transparent strip between the id and the box: the pointer crosses it onto the panel. */
      padding: 4px 0 0;
      width: max-content;
      height: auto;
    }
    .qits-work-ref-panel.qits-work-ref-above {
      padding: 0 0 4px;
    }
    .qits-work-ref-panel-open {
      display: block;
    }
    .qits-work-ref-box {
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-sizing: border-box;
      max-width: min(360px, calc(100vw - 16px));
      padding: 8px 10px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgb(17 24 39 / 12%);
      color: #111827;
      font-family: inherit;
      font-size: 13px;
      font-weight: 400;
      font-style: normal;
      line-height: 1.4;
      text-align: left;
      text-decoration: none;
      white-space: normal;
      cursor: auto;
    }
    .qits-work-ref-head {
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }
    .qits-work-ref-link {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: #1d4ed8;
      text-decoration: none;
    }
    .qits-work-ref-link:hover,
    .qits-work-ref-link:focus-visible {
      text-decoration: underline;
    }
    .qits-work-ref-time {
      font-size: 12px;
      color: #6b7280;
    }
    .qits-work-ref-title {
      display: block;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
  `,
})
export class QitsWorkRef {
  /** The item's project: a slug or an id, as the briefs door takes it — a slug for a link. */
  readonly project = input<string | undefined>(undefined);
  /** The item's qualified id, e.g. `qits-1897`; also the text drawn. */
  readonly qualifiedId = input.required<string>();
  /** The brief, when the caller has it already: shown as given, and nothing is asked for. */
  readonly brief = input<QitsWorkBrief | undefined>(undefined);

  /** The panel's id, for the id's `aria-describedby`. */
  protected readonly panelId = `qits-work-ref-${nextPanelId++}`;

  private readonly briefs = inject(QitsWorkBriefs);
  private readonly linkFor = inject(QITS_WORK_LINK);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly doc = inject(DOCUMENT);
  private readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  private readonly hovered = signal(false);
  private readonly focused = signal(false);
  private readonly tapped = signal(false);
  private readonly dismissed = signal(false);
  private readonly now = signal(Date.now());
  /** The kind of the press in progress, from its `pointerdown` until its `click`. */
  protected pressing: PointerKind | undefined;

  /** The project the link names: as given, else the slug the qualified id spells. */
  private readonly linkProject = computed(
    () => this.project() || this.qualifiedId().replace(/-\d+$/, ''),
  );

  private readonly requested = computed(() => {
    if (this.brief()) return undefined;
    const project = this.project();
    return project ? this.briefs.request(project, this.qualifiedId()) : undefined;
  });

  /** The brief to show, or `undefined` for plain text. */
  protected readonly shown = computed<QitsWorkBrief | undefined>(() => {
    const given = this.brief();
    if (given) return given;
    const state = this.requested()?.();
    return state === 'pending' ? undefined : state;
  });

  protected readonly open = computed(
    () =>
      !!this.shown() && !this.dismissed() && (this.hovered() || this.focused() || this.tapped()),
  );

  private readonly link = computed(() => this.linkFor(this.linkProject(), this.qualifiedId()));
  protected readonly exit = computed(() => {
    const link = this.link();
    return 'exit' in link ? link : undefined;
  });
  protected readonly route = computed(() => {
    const link = this.link();
    return 'routerLink' in link ? link.routerLink : undefined;
  });
  protected readonly href = computed(() => {
    const link = this.link();
    return 'href' in link ? link.href : qitsWorkDetailPath(this.linkProject(), this.qualifiedId());
  });
  protected readonly statusLabel = computed(() =>
    (this.shown()?.status ?? '').toLowerCase().replace(/_/g, ' '),
  );
  protected readonly statusTone = computed(() => qitsWorkStatusTone(this.shown()?.status ?? ''));
  protected readonly ago = computed(() =>
    qitsRelativeTime(this.shown()?.updatedAt ?? '', this.now()),
  );

  constructor() {
    afterRenderEffect((onCleanup) => {
      const panel = this.panel()?.nativeElement;
      if (!panel) return;
      if (!this.open()) {
        hidePopover(panel);
        return;
      }
      showPopover(panel);
      const place = () => this.place(panel);
      place();
      const view = this.doc.defaultView;
      view?.addEventListener('scroll', place, { capture: true, passive: true });
      view?.addEventListener('resize', place, { passive: true });
      onCleanup(() => {
        view?.removeEventListener('scroll', place, { capture: true });
        view?.removeEventListener('resize', place);
      });
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    this.pressing = event.pointerType === 'mouse' ? 'mouse' : 'coarse';
  }

  protected onPointerEnter(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || !this.shown()) return;
    this.dismissed.set(false);
    this.reveal();
    this.hovered.set(true);
  }

  protected onPointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.hovered.set(false);
  }

  /** Focus opens for the keyboard; focus that a press gave is the press's business. */
  protected onFocusIn(): void {
    if (this.pressing || !this.shown()) return;
    this.dismissed.set(false);
    this.reveal();
    this.focused.set(true);
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) this.focused.set(false);
  }

  protected onClick(event: MouseEvent): void {
    const kind = this.pressing ?? (this.coarseDevice() ? 'coarse' : 'mouse');
    this.pressing = undefined;
    if (!this.shown()) return;
    const target = event.target as Node | null;
    if (target && this.panel()?.nativeElement.contains(target)) {
      // Inside the panel: its link navigates, and the row around the reference must not as well.
      event.stopPropagation();
      if ((target as Element).closest?.('a.qits-work-ref-link')) this.close();
      else event.preventDefault();
      return;
    }
    if (kind !== 'coarse') return;
    event.preventDefault();
    event.stopPropagation();
    if (this.open()) {
      this.close();
    } else {
      this.dismissed.set(false);
      this.reveal();
      this.tapped.set(true);
    }
  }

  protected onEscape(): void {
    if (!this.open()) return;
    this.tapped.set(false);
    this.dismissed.set(true);
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.close();
  }

  private close(): void {
    this.tapped.set(false);
    this.focused.set(false);
    this.hovered.set(false);
  }

  /** The relative time is of the moment the panel opens, not of the moment the page rendered. */
  private reveal(): void {
    if (!this.open()) this.now.set(Date.now());
  }

  private coarseDevice(): boolean {
    return !!this.doc.defaultView?.matchMedia?.('(pointer: coarse)').matches;
  }

  /** Below the id, left edges aligned; above it where below does not fit; inside the window. */
  private place(panel: HTMLElement): void {
    const trigger = this.trigger()?.nativeElement;
    if (!trigger) return;
    const anchor = trigger.getBoundingClientRect();
    const root = this.doc.documentElement;
    const viewWidth = root.clientWidth || this.doc.defaultView?.innerWidth || 0;
    const viewHeight = root.clientHeight || this.doc.defaultView?.innerHeight || 0;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left = Math.max(EDGE, Math.min(anchor.left, viewWidth - width - EDGE));
    const above = anchor.bottom + height > viewHeight - EDGE && anchor.top - height >= EDGE;
    panel.classList.toggle('qits-work-ref-above', above);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(above ? anchor.top - height : anchor.bottom)}px`;
  }
}

/** The Popover API where the browser has it; `position: fixed` alone is the fallback. */
type PopoverElement = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

function showPopover(panel: PopoverElement): void {
  if (typeof panel.showPopover !== 'function' || panel.matches?.(':popover-open')) return;
  try {
    panel.showPopover();
  } catch {
    // Not connected, or the browser refuses: the fixed panel still shows.
  }
}

function hidePopover(panel: PopoverElement): void {
  if (typeof panel.hidePopover !== 'function') return;
  try {
    if (panel.matches(':popover-open')) panel.hidePopover();
  } catch {
    // Nothing to hide.
  }
}
