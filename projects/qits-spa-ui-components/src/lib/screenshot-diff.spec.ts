import {
  diffScreenshots,
  QITS_SCREENSHOT_DIFF_ACCENT,
  screenshotDiffOverlay,
  type QitsImageDataLike,
} from './screenshot-diff';

/** A `width × height` image filled with one RGBA colour. */
function image(
  width: number,
  height: number,
  rgba: readonly number[] = [255, 255, 255, 255],
): QitsImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}

function pixel(source: QitsImageDataLike, x: number, y: number): number[] {
  const at = (y * source.width + x) * 4;
  return [...source.data.subarray(at, at + 4)];
}

function setPixel(source: QitsImageDataLike, x: number, y: number, rgba: readonly number[]): void {
  source.data.set(rgba, (y * source.width + x) * 4);
}

describe('diffScreenshots', () => {
  it('finds nothing in identical buffers, and the mask is clear', () => {
    const diff = diffScreenshots(image(3, 2), image(3, 2));
    expect(diff.differing).toBe(0);
    expect(diff.compared).toBe(6);
    expect(diff.sizeChanged).toBeNull();
    expect(diff.mask.data.every((byte) => byte === 0)).toBe(true);
  });

  it('counts one changed pixel — even an alpha-only change — as one', () => {
    const after = image(3, 2);
    setPixel(after, 2, 1, [255, 255, 255, 254]);
    const diff = diffScreenshots(image(3, 2), after);
    expect(diff.differing).toBe(1);
    expect(diff.compared).toBe(6);
  });

  it('colours only the differing pixels of the mask, in the accent', () => {
    const after = image(3, 2);
    setPixel(after, 1, 0, [0, 0, 0, 255]);
    setPixel(after, 0, 1, [10, 20, 30, 255]);
    const { mask, differing } = diffScreenshots(image(3, 2), after);
    expect(differing).toBe(2);
    expect([mask.width, mask.height]).toEqual([3, 2]);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 3; x++) {
        const changed = (x === 1 && y === 0) || (x === 0 && y === 1);
        expect(pixel(mask, x, y)).toEqual(
          changed ? [...QITS_SCREENSHOT_DIFF_ACCENT] : [0, 0, 0, 0],
        );
      }
  });

  it('compares over the union of both sizes, the area only one side has counting as differing', () => {
    const diff = diffScreenshots(image(4, 2), image(3, 3));
    expect(diff.sizeChanged).toEqual({ before: { w: 4, h: 2 }, after: { w: 3, h: 3 } });
    expect(diff.compared).toBe(12);
    // Column 3 of rows 0–1 (before only), row 2 of columns 0–2 (after only), and (3, 2) in neither.
    expect(diff.differing).toBe(6);
    expect([diff.mask.width, diff.mask.height]).toEqual([4, 3]);
    expect(pixel(diff.mask, 3, 0)).toEqual([...QITS_SCREENSHOT_DIFF_ACCENT]);
    expect(pixel(diff.mask, 0, 2)).toEqual([...QITS_SCREENSHOT_DIFF_ACCENT]);
    expect(pixel(diff.mask, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('screenshotDiffOverlay', () => {
  it('dims the after image to 35 % and paints the mask over it', () => {
    const after = image(2, 1, [100, 150, 200, 200]);
    setPixel(after, 1, 0, [0, 0, 0, 255]);
    const { mask } = diffScreenshots(image(2, 1, [100, 150, 200, 200]), after);
    const overlay = screenshotDiffOverlay(after, mask);
    expect(pixel(overlay, 0, 0)).toEqual([100, 150, 200, 70]);
    expect(pixel(overlay, 1, 0)).toEqual([...QITS_SCREENSHOT_DIFF_ACCENT]);
  });
});
