import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

import type { QitsReport, QitsReportContext, QitsReportKind } from './reports';
import { QitsRepositoryRawClient } from './repository-raw';
import {
  diffScreenshots,
  QITS_IMAGE_DECODER,
  screenshotDiffOverlay,
  type QitsImageDataLike,
  type QitsImageSize,
} from './screenshot-diff';
import {
  asScreenshotsPayload,
  QITS_SCREENSHOTS_KIND,
  type QitsScreenshotEntry,
  type QitsScreenshotStatus,
} from './screenshots-report.model';

/** How an open CHANGED screenshot is compared. */
export type QitsScreenshotCompareMode = 'side' | 'diff' | 'onion';

/** One side of a screenshot: which revision it is read at. */
type Side = 'before' | 'after';

/** One image as a row draws it. */
type ImageView =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly url: string }
  | { readonly state: 'failed' };

/** The pixel comparison of an open CHANGED row. */
type DiffView =
  | { readonly state: 'computing' }
  | { readonly state: 'failed' }
  | {
      readonly state: 'ready';
      readonly differing: number;
      readonly compared: number;
      readonly sizeChanged: {
        readonly before: QitsImageSize;
        readonly after: QitsImageSize;
      } | null;
      readonly overlay: QitsImageDataLike;
    };

interface SpecGroup {
  readonly spec: string;
  readonly entries: readonly QitsScreenshotEntry[];
}

interface StatusGroup {
  readonly status: QitsScreenshotStatus;
  readonly title: string;
  readonly count: number;
  readonly specs: readonly SpecGroup[];
}

const GROUPS: readonly {
  status: QitsScreenshotStatus;
  title: string;
  total: 'new' | 'changed' | 'removed';
}[] = [
  { status: 'NEW', title: 'New', total: 'new' },
  { status: 'CHANGED', title: 'Changed', total: 'changed' },
  { status: 'REMOVED', title: 'Removed', total: 'removed' },
];

/**
 * Paints pixels into the canvas it sits on, sized to them; CSS scales it from there. Part of
 * `QitsScreenshotsReport`'s Diff mode.
 */
@Directive({ selector: 'canvas[qitsScreenshotPaint]' })
export class QitsScreenshotPaint {
  /** The pixels to paint. */
  readonly image = input.required<QitsImageDataLike>({ alias: 'qitsScreenshotPaint' });

  constructor() {
    const canvas = inject<ElementRef<HTMLCanvasElement>>(ElementRef).nativeElement;
    effect(() => {
      const image = this.image();
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context || !image.width || !image.height) return;
      const pixels = context.createImageData(image.width, image.height);
      pixels.data.set(image.data);
      context.putImageData(pixels, 0, 0);
    });
  }
}

/**
 * The `screenshots` view (qits-762): which committed screenshot baselines the fold adds, changes
 * and removes against the newest released version — the place a reviewer accepts a visual change.
 *
 * - **The header** names the baseline and the fold, and the totals; a **renderer banner** lists
 *   every fingerprint key that moved, because then every screenshot may differ for that alone.
 * - **New, Changed and Removed**, each with its count, rows grouped by spec. Rows are collapsed,
 *   and **nothing is read until a person opens one** — a real change lists a hundred images.
 * - **An open row** reads its images from qits-githost's raw door through
 *   {@link QitsRepositoryRawClient}: the after image at the fold for NEW; both for CHANGED, side by
 *   side, as a Diff (after dimmed, differing pixels in a solid accent) or as an Onion with an
 *   opacity slider, with the pixel count {@link diffScreenshots} computes in the browser; the
 *   before image for REMOVED, on "Show last image".
 * - Object URLs are revoked when a row closes and when the view is destroyed; the bytes are kept,
 *   so re-opening a row reads nothing.
 *
 * No repository, a failed read and an undecodable image are each one muted line in the row. A
 * payload that is not a screenshots report is said in one line; nothing here throws.
 */
@Component({
  selector: 'qits-screenshots-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, QitsScreenshotPaint],
  template: `
    <ng-template #picture let-view let-label="label">
      @switch (view?.state) {
        @case ('ready') {
          <img class="shot" [src]="view.url" [alt]="label" />
        }
        @case ('failed') {
          <p class="muted read-failed">Could not read this image from the git host.</p>
        }
        @default {
          <p class="muted loading">Loading…</p>
        }
      }
    </ng-template>

    @if (payload(); as p) {
      <header class="head">
        @if (p.baseline; as base) {
          <p class="against">
            against <span class="code">{{ base.version }}</span> (<span class="code">{{
              short(base.commitSha)
            }}</span
            >) → fold <span class="code">{{ short(p.headSha) }}</span>
          </p>
        } @else {
          <p class="against muted">No baseline to compare</p>
        }
        <p class="totals">{{ totalsLine() }}</p>
      </header>

      @if (p.renderer?.changed) {
        <div class="renderer" role="note">
          <p class="renderer-title">
            The renderer changed (<span class="code">{{ p.renderer?.path }}</span
            >):
          </p>
          <ul>
            @for (change of p.renderer?.entries ?? []; track change.key) {
              <li class="renderer-entry">
                <span class="code">{{ change.key }}</span
                >: {{ change.before ?? '(absent)' }} → {{ change.after ?? '(absent)' }}
              </li>
            }
          </ul>
          <p>Every screenshot may differ for this reason alone.</p>
        </div>
      }

      @if (p.truncated) {
        <p class="muted truncated">
          Only the first {{ p.entries.length }} of {{ listable() }} are listed.
        </p>
      }

      @for (group of groups(); track group.status) {
        <section class="group" [attr.data-status]="group.status">
          <h4 class="group-title">
            {{ group.title }} <span class="count">{{ group.count }}</span>
          </h4>
          @for (spec of group.specs; track spec.spec) {
            <div class="spec-group">
              <p class="code spec">{{ spec.spec }}</p>
              <ul class="rows">
                @for (entry of spec.entries; track entry.path) {
                  <li class="row" [attr.data-path]="entry.path">
                    <button
                      type="button"
                      class="row-toggle"
                      [attr.aria-expanded]="isOpen(entry.path)"
                      (click)="toggle(entry)"
                    >
                      <span class="caret" aria-hidden="true">{{
                        isOpen(entry.path) ? '▾' : '▸'
                      }}</span>
                      &ngsp;<span class="name">{{ nameOf(entry) }}</span>
                      @if (targetOf(entry); as target) {
                        &ngsp;<span class="muted target">{{ target }}</span>
                      }
                      @if (bytesOf(entry); as bytes) {
                        &ngsp;<span class="muted bytes">{{ bytes }}</span>
                      }
                    </button>
                    @if (entry.movedFrom) {
                      <p class="muted move">
                        same image as removed <span class="code">{{ entry.movedFrom }}</span>
                      </p>
                    }
                    @if (entry.movedTo) {
                      <p class="muted move">
                        moved to <span class="code">{{ entry.movedTo }}</span>
                      </p>
                    }

                    @if (isOpen(entry.path)) {
                      <div class="body">
                        @if (!p.repositoryId) {
                          <p class="muted unavailable">
                            Images unavailable: the report names no repository
                          </p>
                        } @else {
                          @switch (entry.status) {
                            @case ('NEW') {
                              <figure class="side after">
                                <figcaption>After · fold {{ short(p.headSha) }}</figcaption>
                                <ng-container
                                  [ngTemplateOutlet]="picture"
                                  [ngTemplateOutletContext]="{
                                    $implicit: imageOf('after', entry.path),
                                    label: nameOf(entry) + ', new',
                                  }"
                                />
                              </figure>
                            }
                            @case ('REMOVED') {
                              <p class="code removed-path">{{ entry.path }}</p>
                              @if (isShowingLast(entry.path)) {
                                <figure class="side before">
                                  <figcaption>Before · {{ p.baseline?.version }}</figcaption>
                                  <ng-container
                                    [ngTemplateOutlet]="picture"
                                    [ngTemplateOutletContext]="{
                                      $implicit: imageOf('before', entry.path),
                                      label: nameOf(entry) + ', last image',
                                    }"
                                  />
                                </figure>
                              } @else {
                                <button type="button" class="show-last" (click)="showLast(entry)">
                                  Show last image
                                </button>
                              }
                            }
                            @default {
                              <div class="modes" role="group" aria-label="Compare">
                                @for (option of modes; track option.mode) {
                                  <button
                                    type="button"
                                    class="mode"
                                    [attr.data-mode]="option.mode"
                                    [class.selected]="modeOf(entry.path) === option.mode"
                                    [attr.aria-pressed]="modeOf(entry.path) === option.mode"
                                    [disabled]="option.mode === 'diff' && diffFailed(entry.path)"
                                    (click)="setMode(entry.path, option.mode)"
                                  >
                                    {{ option.label }}
                                  </button>
                                }
                              </div>
                              @let diff = diffOf(entry.path);
                              @switch (diff?.state) {
                                @case ('ready') {
                                  @for (line of statsOf(entry.path); track $index) {
                                    <p class="stats">{{ line }}</p>
                                  }
                                }
                                @case ('failed') {
                                  <p class="muted diff-unavailable">diff unavailable</p>
                                }
                                @case ('computing') {
                                  <p class="muted stats-pending">Comparing pixels…</p>
                                }
                              }
                              @switch (modeOf(entry.path)) {
                                @case ('diff') {
                                  @if (overlayOf(entry.path); as overlay) {
                                    <figure class="side diff">
                                      <figcaption>Differing pixels over the after image</figcaption>
                                      <canvas
                                        class="shot"
                                        role="img"
                                        [attr.aria-label]="nameOf(entry) + ', differing pixels'"
                                        [qitsScreenshotPaint]="overlay"
                                      ></canvas>
                                    </figure>
                                  } @else {
                                    <p class="muted loading">Loading…</p>
                                  }
                                }
                                @case ('onion') {
                                  @let before = imageOf('before', entry.path);
                                  @let after = imageOf('after', entry.path);
                                  @if (before?.state === 'ready' && after?.state === 'ready') {
                                    <div class="onion">
                                      <img
                                        class="shot"
                                        [src]="$any(before).url"
                                        [alt]="nameOf(entry) + ', before'"
                                      />
                                      <img
                                        class="shot over"
                                        [src]="$any(after).url"
                                        [alt]="nameOf(entry) + ', after'"
                                        [style.opacity]="opacityOf(entry.path) / 100"
                                      />
                                    </div>
                                  } @else if (
                                    before?.state === 'failed' || after?.state === 'failed'
                                  ) {
                                    <p class="muted read-failed">
                                      Could not read this image from the git host.
                                    </p>
                                  } @else {
                                    <p class="muted loading">Loading…</p>
                                  }
                                  <label class="opacity">
                                    After
                                    <input
                                      class="onion-opacity"
                                      type="range"
                                      min="0"
                                      max="100"
                                      [value]="opacityOf(entry.path)"
                                      (input)="setOpacity(entry.path, $event)"
                                    />
                                    {{ opacityOf(entry.path) }} %
                                  </label>
                                }
                                @default {
                                  <div class="pair">
                                    <figure class="side before">
                                      <figcaption>Before · {{ p.baseline?.version }}</figcaption>
                                      <ng-container
                                        [ngTemplateOutlet]="picture"
                                        [ngTemplateOutletContext]="{
                                          $implicit: imageOf('before', entry.path),
                                          label: nameOf(entry) + ', before',
                                        }"
                                      />
                                    </figure>
                                    <figure class="side after">
                                      <figcaption>After · fold {{ short(p.headSha) }}</figcaption>
                                      <ng-container
                                        [ngTemplateOutlet]="picture"
                                        [ngTemplateOutletContext]="{
                                          $implicit: imageOf('after', entry.path),
                                          label: nameOf(entry) + ', after',
                                        }"
                                      />
                                    </figure>
                                  </div>
                                }
                              }
                            }
                          }
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            </div>
          }
        </section>
      }
    } @else {
      <p class="muted unreadable">This screenshots report could not be read.</p>
    }
  `,
  styles: `
    :host {
      display: block;
      font-size: 0.875rem;
      color: #111827;
    }
    p {
      margin: 0.25rem 0;
    }
    ul {
      margin: 0.25rem 0;
      padding-left: 0;
      list-style: none;
    }
    .muted {
      color: #6b7280;
    }
    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      overflow-wrap: anywhere;
    }
    .totals {
      font-weight: 600;
    }
    .renderer {
      margin: 0.5rem 0;
      padding: 0.5rem 0.75rem;
      color: #92400e;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
    }
    .renderer ul {
      padding-left: 1rem;
    }
    .renderer-title {
      font-weight: 600;
    }
    .group {
      margin-top: 0.75rem;
    }
    .group + .group {
      padding-top: 0.75rem;
      border-top: 1px solid #e5e7eb;
    }
    .group-title {
      margin: 0 0 0.25rem;
      font-size: 0.875rem;
      font-weight: 600;
    }
    .count {
      display: inline-block;
      min-width: 1.5em;
      padding: 0 0.4em;
      font-size: 0.75rem;
      text-align: center;
      color: #374151;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 999px;
    }
    .group[data-status='NEW'] .count,
    .group[data-status='CHANGED'] .count {
      color: #b45309;
      background: #fffbeb;
      border-color: #fde68a;
    }
    .group[data-status='REMOVED'] .count {
      color: #b91c1c;
      background: #fef2f2;
      border-color: #fecaca;
    }
    .spec-group {
      margin: 0.5rem 0 0;
    }
    .spec {
      color: #374151;
    }
    .rows {
      padding-left: 0.75rem;
    }
    .row {
      margin: 0.15rem 0;
    }
    .row-toggle {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.5rem;
      font: inherit;
      text-align: left;
      color: inherit;
      background: none;
      border: 0;
      padding: 0.1rem 0;
      cursor: pointer;
    }
    .row-toggle:hover .name {
      color: #1d4ed8;
    }
    .caret {
      display: inline-block;
      width: 1ch;
      color: #6b7280;
    }
    .move {
      padding-left: 1.5rem;
      font-size: 0.8rem;
    }
    .body {
      margin: 0.25rem 0 0.75rem 1.5rem;
    }
    .modes {
      display: inline-flex;
      margin: 0.25rem 0;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      overflow: hidden;
    }
    .mode {
      font: inherit;
      font-size: 0.8rem;
      padding: 0.15rem 0.75rem;
      color: #374151;
      background: #fff;
      border: 0;
      cursor: pointer;
    }
    .mode + .mode {
      border-left: 1px solid #d1d5db;
    }
    .mode.selected {
      color: #fff;
      background: #1d4ed8;
    }
    .mode:disabled {
      color: #9ca3af;
      cursor: not-allowed;
    }
    .show-last {
      font: inherit;
      color: #1d4ed8;
      background: none;
      border: 0;
      padding: 0;
      margin: 0.25rem 0;
      cursor: pointer;
    }
    .pair {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
    .side {
      margin: 0.5rem 0 0;
      min-width: 0;
    }
    figcaption {
      margin-bottom: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #374151;
    }
    .shot {
      display: block;
      max-width: 100%;
      height: auto;
      border: 1px solid #e5e7eb;
      background-color: #fff;
      background-image:
        linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
        linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
        linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
      background-size: 16px 16px;
      background-position:
        0 0,
        0 8px,
        8px -8px,
        -8px 0;
    }
    .onion {
      display: grid;
      justify-items: start;
      margin-top: 0.5rem;
    }
    .onion > .shot {
      grid-area: 1 / 1;
    }
    .onion > .over {
      background: none;
      border-color: transparent;
    }
    .opacity {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.25rem;
      font-size: 0.8rem;
      color: #374151;
    }
  `,
})
export class QitsScreenshotsReport {
  /** The `screenshots` report, payload included. */
  readonly report = input.required<QitsReport>();
  /**
   * The baseline run's report of the same kind. Unused: the CLI diffed the committed baselines
   * against the baseline tag itself. Declared because every kind component takes it.
   */
  readonly baseline = input<QitsReport | null>(null);
  /** The run. Unused: the payload names the repository and both revisions itself. */
  readonly context = input<QitsReportContext | null>(null);

  protected readonly modes: readonly { mode: QitsScreenshotCompareMode; label: string }[] = [
    { mode: 'side', label: 'Side by side' },
    { mode: 'diff', label: 'Diff' },
    { mode: 'onion', label: 'Onion' },
  ];

  private readonly raw = inject(QitsRepositoryRawClient);
  private readonly decode = inject(QITS_IMAGE_DECODER);

  private readonly openRows = signal<ReadonlySet<string>>(new Set());
  private readonly lastShown = signal<ReadonlySet<string>>(new Set());
  private readonly images = signal<ReadonlyMap<string, ImageView>>(new Map());
  private readonly diffs = signal<ReadonlyMap<string, DiffView>>(new Map());
  private readonly compareModes = signal<ReadonlyMap<string, QitsScreenshotCompareMode>>(new Map());
  private readonly opacities = signal<ReadonlyMap<string, number>>(new Map());

  /** The bytes read so far, kept for the life of the view so a re-opened row reads nothing. */
  private readonly blobs = new Map<string, Blob>();
  private readonly loads = new Map<string, Promise<Blob | null>>();
  /** The object URLs currently drawn, by image key; revoked on close and on destroy. */
  private readonly urls = new Map<string, string>();
  private destroyed = false;

  protected readonly payload = computed(() => asScreenshotsPayload(this.report().payload));

  protected readonly totalsLine = computed(() => {
    const totals = this.payload()?.totals;
    if (!totals) return '';
    const parts = [
      `${totals.new} new`,
      `${totals.changed} changed`,
      `${totals.removed} removed`,
      `${totals.unchanged} unchanged`,
    ];
    return `${totals.screenshots} screenshots: ${parts.join(', ')}`;
  });

  /** How many entries exist to be listed — what `truncated` cut. */
  protected readonly listable = computed(() => {
    const totals = this.payload()?.totals;
    return totals ? totals.new + totals.changed + totals.removed : 0;
  });

  protected readonly groups = computed((): StatusGroup[] => {
    const payload = this.payload();
    if (!payload) return [];
    return GROUPS.flatMap(({ status, title, total }) => {
      const entries = payload.entries.filter((entry) => entry.status === status);
      const count = payload.totals[total];
      if (!count && !entries.length) return [];
      return [{ status, title, count, specs: bySpec(entries) }];
    });
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      for (const url of this.urls.values()) URL.revokeObjectURL(url);
      this.urls.clear();
    });
  }

  protected short(sha: string | null | undefined): string {
    return (sha ?? '').slice(0, 7);
  }

  protected nameOf(entry: QitsScreenshotEntry): string {
    return entry.name ?? entry.path.slice(entry.path.lastIndexOf('/') + 1);
  }

  protected targetOf(entry: QitsScreenshotEntry): string {
    return [entry.browser, entry.platform].filter(Boolean).join(' · ');
  }

  protected bytesOf(entry: QitsScreenshotEntry): string {
    switch (entry.status) {
      case 'NEW':
        return formatBytes(entry.afterBytes);
      case 'REMOVED':
        return formatBytes(entry.beforeBytes);
      default:
        return entry.beforeBytes === null && entry.afterBytes === null
          ? ''
          : `${formatBytes(entry.beforeBytes) || '?'} → ${formatBytes(entry.afterBytes) || '?'}`;
    }
  }

  protected isOpen(path: string): boolean {
    return this.openRows().has(path);
  }

  protected isShowingLast(path: string): boolean {
    return this.lastShown().has(path);
  }

  protected imageOf(side: Side, path: string): ImageView | undefined {
    return this.images().get(imageKey(side, path));
  }

  protected diffOf(path: string): DiffView | undefined {
    return this.diffs().get(path);
  }

  protected diffFailed(path: string): boolean {
    return this.diffOf(path)?.state === 'failed';
  }

  protected overlayOf(path: string): QitsImageDataLike | null {
    const diff = this.diffOf(path);
    return diff?.state === 'ready' ? diff.overlay : null;
  }

  protected statsOf(path: string): string[] {
    const diff = this.diffOf(path);
    if (diff?.state !== 'ready') return [];
    const lines = [
      diff.differing === 0
        ? 'Pixel-identical: only the encoding changed'
        : `${diff.differing.toLocaleString('en-US')} px differ (${percent(diff.differing, diff.compared)} %)`,
    ];
    if (diff.sizeChanged) {
      const { before, after } = diff.sizeChanged;
      lines.push(`Size changed ${before.w}×${before.h} → ${after.w}×${after.h}`);
    }
    return lines;
  }

  /** The mode drawn: what the person picked, except a Diff that cannot be computed. */
  protected modeOf(path: string): QitsScreenshotCompareMode {
    const mode = this.compareModes().get(path) ?? 'side';
    return mode === 'diff' && this.diffFailed(path) ? 'side' : mode;
  }

  protected setMode(path: string, mode: QitsScreenshotCompareMode): void {
    this.compareModes.set(new Map(this.compareModes()).set(path, mode));
  }

  protected opacityOf(path: string): number {
    return this.opacities().get(path) ?? 50;
  }

  protected setOpacity(path: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) this.opacities.set(new Map(this.opacities()).set(path, value));
  }

  protected toggle(entry: QitsScreenshotEntry): void {
    if (this.isOpen(entry.path)) {
      this.close(entry.path);
      return;
    }
    this.openRows.set(new Set(this.openRows()).add(entry.path));
    if (!this.payload()?.repositoryId) return;
    if (entry.status === 'NEW') void this.show('after', entry);
    else if (entry.status === 'CHANGED') void this.compare(entry);
  }

  protected showLast(entry: QitsScreenshotEntry): void {
    this.lastShown.set(new Set(this.lastShown()).add(entry.path));
    void this.show('before', entry);
  }

  private close(path: string): void {
    const open = new Set(this.openRows());
    open.delete(path);
    this.openRows.set(open);
    const last = new Set(this.lastShown());
    last.delete(path);
    this.lastShown.set(last);
    const images = new Map(this.images());
    for (const side of ['before', 'after'] as const) {
      const key = imageKey(side, path);
      const url = this.urls.get(key);
      if (url) URL.revokeObjectURL(url);
      this.urls.delete(key);
      images.delete(key);
    }
    this.images.set(images);
    const diffs = new Map(this.diffs());
    diffs.delete(path);
    this.diffs.set(diffs);
  }

  /** Reads both sides, then compares their pixels. */
  private async compare(entry: QitsScreenshotEntry): Promise<void> {
    const [before, after] = await Promise.all([
      this.show('before', entry),
      this.show('after', entry),
    ]);
    if (!before || !after || !this.live(entry.path) || this.diffOf(entry.path)) return;
    this.setDiff(entry.path, { state: 'computing' });
    let view: DiffView;
    try {
      const [beforePixels, afterPixels] = await Promise.all([
        this.decode(before),
        this.decode(after),
      ]);
      const diff = diffScreenshots(beforePixels, afterPixels);
      view = {
        state: 'ready',
        differing: diff.differing,
        compared: diff.compared,
        sizeChanged: diff.sizeChanged,
        overlay: screenshotDiffOverlay(afterPixels, diff.mask),
      };
    } catch {
      view = { state: 'failed' };
    }
    if (this.live(entry.path)) this.setDiff(entry.path, view);
  }

  /** Draws one side of an open row: its bytes, read once, behind a fresh object URL. */
  private async show(side: Side, entry: QitsScreenshotEntry): Promise<Blob | null> {
    const key = imageKey(side, entry.path);
    if (!this.urls.has(key)) this.setImage(key, { state: 'loading' });
    const blob = await this.read(side, entry);
    if (!this.live(entry.path)) return blob;
    if (!blob) {
      this.setImage(key, { state: 'failed' });
    } else if (!this.urls.has(key)) {
      const url = URL.createObjectURL(blob);
      this.urls.set(key, url);
      this.setImage(key, { state: 'ready', url });
    }
    return blob;
  }

  /** One side's bytes: kept, in flight, or read now. Null for a failed read; never rejects. */
  private read(side: Side, entry: QitsScreenshotEntry): Promise<Blob | null> {
    const key = imageKey(side, entry.path);
    const kept = this.blobs.get(key);
    if (kept) return Promise.resolve(kept);
    const inFlight = this.loads.get(key);
    if (inFlight) return inFlight;
    const payload = this.payload();
    const rev = side === 'before' ? payload?.baseline?.commitSha : payload?.headSha;
    const repositoryId = payload?.repositoryId;
    const load = (
      repositoryId && rev
        ? this.raw.raw(repositoryId, rev, entry.path)
        : Promise.reject(new Error('no revision to read at'))
    )
      .then(
        (blob) => {
          this.blobs.set(key, blob);
          return blob as Blob | null;
        },
        () => null,
      )
      .finally(() => this.loads.delete(key));
    this.loads.set(key, load);
    return load;
  }

  private live(path: string): boolean {
    return !this.destroyed && this.isOpen(path);
  }

  private setImage(key: string, view: ImageView): void {
    this.images.set(new Map(this.images()).set(key, view));
  }

  private setDiff(path: string, view: DiffView): void {
    this.diffs.set(new Map(this.diffs()).set(path, view));
  }
}

function imageKey(side: Side, path: string): string {
  return `${side}\u0000${path}`;
}

function bySpec(entries: readonly QitsScreenshotEntry[]): SpecGroup[] {
  const groups = new Map<string, QitsScreenshotEntry[]>();
  for (const entry of entries) {
    const spec = entry.spec ?? entry.path.slice(0, Math.max(0, entry.path.lastIndexOf('/')));
    const group = groups.get(spec);
    if (group) group.push(entry);
    else groups.set(spec, [entry]);
  }
  return [...groups].map(([spec, list]) => ({ spec, entries: list }));
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function percent(part: number, whole: number): string {
  if (!whole) return '0';
  const value = (part / whole) * 100;
  return value > 0 && value < 0.1 ? '< 0.1' : value.toFixed(1);
}

/** The `screenshots` kind's registration, payload version 1 — part of the standard kinds. */
export const QITS_SCREENSHOTS_REPORT_KIND: QitsReportKind = {
  kind: QITS_SCREENSHOTS_KIND,
  versions: [1],
  title: 'Screenshots',
  component: QitsScreenshotsReport,
};
