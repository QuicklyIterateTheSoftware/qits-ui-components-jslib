import { TestBed } from '@angular/core/testing';
import { mount } from '../testing/browser/mount';
import {
  EVERY_STATUS,
  NO_BASELINE,
  NO_REPOSITORY,
  SCREENSHOTS_HEAD_SHA,
} from './fixtures/screenshots/screenshots-states';
import { QitsRepositoryRawClient } from './repository-raw';
import { QitsScreenshotsReport } from './screenshots-report';

/**
 * Screenshots of the screenshots report: new, changed, removed and a move; no baseline; and no
 * repository to read the images from. The images are painted here, on a canvas, as the story paints
 * them: the "after" side differs from the "before" in its header and its button.
 */
function paint(rev: string, path: string): Promise<Blob> {
  const after = rev === SCREENSHOTS_HEAD_SHA;
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 150;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas context');
  // The pixels of a screenshot under review, not colours of this library.
  context.fillStyle = 'rgb(249 250 251)';
  context.fillRect(0, 0, 240, 150);
  context.fillStyle = after ? 'rgb(30 58 138)' : 'rgb(29 78 216)';
  context.fillRect(0, 0, 240, 24);
  context.fillStyle = 'rgb(4 120 87)';
  context.fillRect(after && !path.includes('work-item') ? 164 : 20, 92, 56, 18);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no PNG'))), 'image/png'),
  );
}

const FAKE_RAW: Pick<QitsRepositoryRawClient, 'raw'> = {
  raw: (_repositoryId, rev, path) =>
    path.includes('/old-') ? Promise.reject(new Error('503')) : paint(rev, path),
};

const STYLE = 'display: block; padding: 8px; width: 760px';

/** The open row has drawn its images (or said why not) and computed its pixel comparison. */
async function painted(host: Element): Promise<void> {
  await expect
    .poll(
      () =>
        !!host.querySelector('.row [aria-expanded="true"]') &&
        host.querySelectorAll('.shot').length > 0 &&
        !host.querySelector('.loading, .stats-pending'),
    )
    .toBe(true);
  const images = [...host.querySelectorAll<HTMLImageElement>('img.shot')];
  await Promise.all(images.map((image) => image.decode()));
}

describe('QitsScreenshotsReport (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: QitsRepositoryRawClient, useValue: FAKE_RAW }],
    });
  });

  it('lists new, changed and removed screenshots, and a move', async () => {
    const { view } = await mount(QitsScreenshotsReport, { ...EVERY_STATUS }, STYLE);
    await expect.element(view()).toMatchScreenshot('every-status', { kind: 'DATA' });
  });

  it('opens a changed screenshot side by side', async () => {
    const { host, view } = await mount(QitsScreenshotsReport, { ...EVERY_STATUS }, STYLE);
    const toggles = [...host.querySelectorAll<HTMLButtonElement>('.row-toggle')];
    toggles.find((toggle) => toggle.textContent?.includes('narrow-open'))?.click();
    await painted(host);
    await expect.element(view()).toMatchScreenshot('changed-open', { kind: 'DATA' });
  });

  it('shows the screenshots without a baseline', async () => {
    const { view } = await mount(QitsScreenshotsReport, { ...NO_BASELINE }, STYLE);
    await expect.element(view()).toMatchScreenshot('no-baseline', { kind: 'DATA' });
  });

  it('lists the screenshots with no repository to read them from', async () => {
    const { view } = await mount(QitsScreenshotsReport, { ...NO_REPOSITORY }, STYLE);
    await expect.element(view()).toMatchScreenshot('no-repository', { kind: 'DATA' });
  });
});
