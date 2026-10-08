import { InjectionToken } from '@angular/core';

/**
 * The shape of `ImageData` this module needs: RGBA bytes, row-major, four per pixel. A real
 * `ImageData` is one; so is a literal in a spec, where jsdom has no canvas.
 */
export interface QitsImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** A width and a height. */
export interface QitsImageSize {
  readonly w: number;
  readonly h: number;
}

/** What {@link diffScreenshots} found. */
export interface QitsScreenshotDiff {
  /** The union of both sizes: differing pixels in {@link QITS_SCREENSHOT_DIFF_ACCENT}, others clear. */
  readonly mask: QitsImageDataLike;
  /** Pixels whose RGBA differs, counting every pixel present in only one image. */
  readonly differing: number;
  /** Pixels compared: the area of the union of both sizes. */
  readonly compared: number;
  /** Both sizes where they differ; null where they are the same. */
  readonly sizeChanged: { readonly before: QitsImageSize; readonly after: QitsImageSize } | null;
}

/** The solid colour a differing pixel is painted in the mask — RGBA, a magenta no UI uses. */
export const QITS_SCREENSHOT_DIFF_ACCENT: readonly [number, number, number, number] = [
  219, 39, 119, 255,
];

/**
 * Compares two screenshots pixel for pixel: exact RGBA over the union of both sizes, a pixel
 * outside one image counting as differing. There is no anti-aliasing tolerance on purpose — the
 * renderer is pinned, so a difference is real.
 *
 * Pure: no DOM, so it runs anywhere and is tested as arithmetic.
 */
export function diffScreenshots(
  before: QitsImageDataLike,
  after: QitsImageDataLike,
): QitsScreenshotDiff {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const mask = new Uint8ClampedArray(width * height * 4);
  const [r, g, b, a] = QITS_SCREENSHOT_DIFF_ACCENT;
  let differing = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (samePixel(before, after, x, y)) continue;
      differing++;
      const at = (y * width + x) * 4;
      mask[at] = r;
      mask[at + 1] = g;
      mask[at + 2] = b;
      mask[at + 3] = a;
    }
  }
  const sameSize = before.width === after.width && before.height === after.height;
  return {
    mask: { width, height, data: mask },
    differing,
    compared: width * height,
    sizeChanged: sameSize
      ? null
      : {
          before: { w: before.width, h: before.height },
          after: { w: after.width, h: after.height },
        },
  };
}

/**
 * The Diff mode's picture: `after` at `opacity` with the mask painted over it — one buffer, the
 * size of the mask, ready for `putImageData` (which ignores a canvas's own alpha settings).
 */
export function screenshotDiffOverlay(
  after: QitsImageDataLike,
  mask: QitsImageDataLike,
  opacity = 0.35,
): QitsImageDataLike {
  const { width, height } = mask;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      if (mask.data[at + 3]) {
        data.set(mask.data.subarray(at, at + 4), at);
      } else if (x < after.width && y < after.height) {
        const from = (y * after.width + x) * 4;
        data.set(after.data.subarray(from, from + 3), at);
        data[at + 3] = after.data[from + 3] * opacity;
      }
    }
  }
  return { width, height, data };
}

function samePixel(
  before: QitsImageDataLike,
  after: QitsImageDataLike,
  x: number,
  y: number,
): boolean {
  const inBefore = x < before.width && y < before.height;
  const inAfter = x < after.width && y < after.height;
  if (!inBefore || !inAfter) return false;
  const i = (y * before.width + x) * 4;
  const j = (y * after.width + x) * 4;
  return (
    before.data[i] === after.data[j] &&
    before.data[i + 1] === after.data[j + 1] &&
    before.data[i + 2] === after.data[j + 2] &&
    before.data[i + 3] === after.data[j + 3]
  );
}

/** Turns an image's bytes into pixels. */
export type QitsImageDecoder = (blob: Blob) => Promise<QitsImageDataLike>;

/**
 * The browser's decoder: `createImageBitmap`, drawn into a canvas, read back as `ImageData`.
 * Rejects where the bytes are no image this browser can decode.
 */
export async function decodeImage(blob: Blob): Promise<QitsImageDataLike> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d canvas context');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/**
 * The seam the screenshots view decodes through — {@link decodeImage} unless replaced, which a spec
 * does because jsdom has neither `createImageBitmap` nor a canvas.
 */
export const QITS_IMAGE_DECODER = new InjectionToken<QitsImageDecoder>('QITS_IMAGE_DECODER', {
  providedIn: 'root',
  factory: () => decodeImage,
});
