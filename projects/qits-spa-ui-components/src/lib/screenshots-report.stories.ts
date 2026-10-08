import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';

import {
  EVERY_STATUS,
  NO_BASELINE,
  NO_REPOSITORY,
  RENDERER_CHANGED,
  SCREENSHOTS_HEAD_SHA,
  TRUNCATED,
} from './fixtures/screenshots/screenshots-states';
import { QitsRepositoryRawClient } from './repository-raw';
import { QitsScreenshotsReport } from './screenshots-report';

/**
 * A page screenshot, painted on a canvas: a header bar, a card and a button. The after side (the
 * fold) moves the button and recolours the header; `narrow-open` also grows taller after; and
 * `work-item-narrow-expanded` is the same pixels on both sides — a re-encode.
 */
async function paint(rev: string, path: string): Promise<Blob> {
  const after = rev === SCREENSHOTS_HEAD_SHA;
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/-chromium-linux\.png$/, '');
  const reencoded = name.startsWith('work-item');
  const changed = after && !reencoded;
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = name === 'narrow-open' && after ? 360 : 300;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas context');
  context.fillStyle = '#f9fafb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = changed ? '#1e3a8a' : '#1d4ed8';
  context.fillRect(0, 0, canvas.width, 48);
  context.fillStyle = '#ffffff';
  context.font = '16px sans-serif';
  context.fillText(name, 16, 30);
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#e5e7eb';
  context.fillRect(24, 72, 432, 168);
  context.strokeRect(24, 72, 432, 168);
  context.fillStyle = '#111827';
  context.fillText(reencoded ? 'Same pixels, new encoding' : 'Release request', 40, 104);
  context.fillStyle = '#6b7280';
  context.fillText(changed ? 'Scheduled for 14:00' : 'Not scheduled', 40, 132);
  context.fillStyle = '#047857';
  context.fillRect(changed ? 328 : 40, 184, 112, 36);
  context.fillStyle = '#ffffff';
  context.fillText('Approve', changed ? 352 : 64, 208);
  if (name === 'narrow-open' && after) {
    context.fillStyle = '#fef3c7';
    context.fillRect(24, 260, 432, 80);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no PNG'))), 'image/png'),
  );
}

/** Stands in for qits-githost: PNGs painted in the browser, and a failed read for `old`. */
const FAKE_RAW: Pick<QitsRepositoryRawClient, 'raw'> = {
  raw: (_repositoryId, rev, path) =>
    path.includes('/old-') ? Promise.reject(new Error('503')) : paint(rev, path),
};

const meta: Meta<QitsScreenshotsReport> = {
  title: 'Reports/Screenshots',
  component: QitsScreenshotsReport,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({ providers: [{ provide: QitsRepositoryRawClient, useValue: FAKE_RAW }] }),
  ],
  args: { ...EVERY_STATUS },
};

export default meta;
type Story = StoryObj<QitsScreenshotsReport>;

/**
 * New, changed and removed, with a renamed spec's image as an exact move. Open a changed row for
 * Side by side, Diff and Onion; `narrow-open` also changed size, `work-item-narrow-expanded` is
 * pixel-identical, and the removed `old` shows a failed read.
 */
export const EveryStatus: Story = { name: 'New, changed, removed and a move' };

/** The renderer fingerprint moved: the banner names the keys. */
export const RendererChanged: Story = {
  name: 'Renderer changed',
  args: { ...RENDERER_CHANGED },
};

/** A first release: no baseline, every screenshot new. */
export const NoBaseline: Story = { name: 'No baseline', args: { ...NO_BASELINE } };

/** More than 1000 entries: the list is cut, the totals are not. */
export const Truncated: Story = { name: 'Truncated', args: { ...TRUNCATED } };

/** The report names no repository: paths are listed, images cannot be read. */
export const NoRepository: Story = { name: 'No repository', args: { ...NO_REPOSITORY } };
