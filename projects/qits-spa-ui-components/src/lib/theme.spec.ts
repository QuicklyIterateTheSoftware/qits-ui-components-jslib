import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QITS_THEME_DEFAULTS } from './theme-defaults';

const SRC = resolve(process.cwd(), 'projects/qits-spa-ui-components/src');
const THEME = readFileSync(`${SRC}/theme.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the block a prelude opens (the first one when `nth` is 0), braces balanced. */
function block(text: string, prelude: string, nth = 0): string {
  let at = -1;
  for (let i = 0; i <= nth; i++) {
    at = text.indexOf(prelude, at + 1);
    if (at < 0) throw new Error(`theme.css has no block ${prelude} #${nth}`);
  }
  const open = text.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`unbalanced block ${prelude}`);
}

/** `--color-<name>: <value>;` declarations of a block body, as name → value. */
function colours(body: string): Map<string, string> {
  return new Map(
    [...body.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const isStep = (name: string) => /-\d+$/.test(name);
const PALETTE = colours(block(THEME, '@theme', 0));
const LIGHT = colours(block(THEME, '@theme', 1));
const DARK_FORCED = colours(block(THEME, ":root[data-theme='dark']"));
const DARK_OS = colours(block(block(THEME, '@media (prefers-color-scheme: dark)'), ':root'));
const DEFAULTS = new Map(
  [
    ...QITS_THEME_DEFAULTS.matchAll(
      /@property --color-([\w-]+) \{ syntax: '<color>'; inherits: true; initial-value: ([^;]+); \}/g,
    ),
  ].map((m) => [m[1], m[2].trim()]),
);

/** A dark value with its palette reference resolved: `var(--color-ocean-deep-300)` → its oklch. */
function resolved(value: string): string {
  const ref = /^var\(--color-([\w-]+)\)$/.exec(value);
  if (!ref) return value;
  const step = PALETTE.get(ref[1]);
  if (!step) throw new Error(`${value} names no palette step of theme.css`);
  return step;
}

/** sRGB channels (0–1, clamped to the gamut) of `oklch(L% C H)` or `#rrggbb`. */
function srgb(value: string): [number, number, number] {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex) return [hex[1], hex[2], hex[3]].map((h) => parseInt(h, 16) / 255) as never;
  const oklch = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(value);
  if (!oklch) throw new Error(`cannot read ${value} as an opaque colour`);
  const [L, C, h] = [Number(oklch[1]) / 100, Number(oklch[2]), (Number(oklch[3]) * Math.PI) / 180];
  const [a, b] = [C * Math.cos(h), C * Math.sin(h)];
  // Björn Ottosson's OKLab → linear sRGB, then the sRGB transfer function.
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((c) => {
    const v = Math.min(1, Math.max(0, c));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  }) as [number, number, number];
}

/** WCAG 2's relative luminance and contrast ratio. */
function luminance(value: string): number {
  const [r, g, b] = srgb(value).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('theme.css', () => {
  it('declares the palette and the semantic tokens in separate @theme blocks', () => {
    expect(PALETTE.size).toBe(55);
    expect([...PALETTE.keys()].every(isStep)).toBe(true);
    expect(LIGHT.size).toBeGreaterThan(0);
    expect([...LIGHT.keys()].filter(isStep)).toEqual([]);
  });

  it('names every token in kebab-case, without a step and without a Tailwind keyword', () => {
    const keywords = ['inherit', 'current', 'transparent', 'white', 'black'];
    for (const name of LIGHT.keys()) {
      expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(keywords).not.toContain(name);
    }
  });

  it('gives every token a dark value, the same one when forced and when following the OS', () => {
    expect([...DARK_FORCED.keys()]).toEqual([...LIGHT.keys()]);
    expect([...DARK_OS.entries()]).toEqual([...DARK_FORCED.entries()]);
    for (const value of DARK_FORCED.values()) expect(() => resolved(value)).not.toThrow();
  });

  it('says which scheme is on in --qits-color-scheme', () => {
    expect(block(THEME, ':root {')).toMatch(/--qits-color-scheme:\s*light;/);
    expect(block(THEME, ":root[data-theme='dark']")).toMatch(/--qits-color-scheme:\s*dark;/);
    expect(block(block(THEME, '@media (prefers-color-scheme: dark)'), ':root')).toMatch(
      /--qits-color-scheme:\s*dark;/,
    );
  });

  // The pairs WCAG AA asks 4.5:1 of, in dark: text roles over the surfaces they sit on.
  const TEXT = ['fg', 'fg-soft', 'fg-muted', 'accent', 'danger', 'warning', 'success'];
  const SURFACES = ['surface', 'surface-subtle', 'surface-muted'];
  for (const text of TEXT) {
    for (const surface of SURFACES) {
      it(`reaches WCAG AA with ${text} on ${surface} in dark`, () => {
        const ratio = contrast(
          resolved(DARK_FORCED.get(text) ?? ''),
          resolved(DARK_FORCED.get(surface) ?? ''),
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('is measured by a converter that agrees with known values', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#6b7280', '#ffffff')).toBeCloseTo(4.83, 2);
    // oklch(62.8% 0.2577 29.23) is sRGB red, #ff0000.
    expect(srgb('oklch(62.8% 0.2577 29.23)').map((c) => Math.round(c * 255))).toEqual([255, 0, 0]);
  });
});

describe('QITS_THEME_DEFAULTS', () => {
  it("registers exactly theme.css's tokens, each at its light value", () => {
    expect(QITS_THEME_DEFAULTS.trim().split('\n')).toHaveLength(DEFAULTS.size);
    expect([...DEFAULTS.entries()]).toEqual([...LIGHT.entries()]);
  });
});

describe('the components', () => {
  it('paint only with tokens theme.css declares', () => {
    const lib = `${SRC}/lib`;
    const used = new Set<string>();
    const files = readdirSync(lib, { recursive: true, encoding: 'utf8' }).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.includes('fixtures'),
    );
    expect(files).toContain('failures/code-excerpt.ts');
    for (const file of files) {
      for (const m of readFileSync(`${lib}/${file}`, 'utf8').matchAll(/var\(--color-([\w-]+)\)/g)) {
        used.add(m[1]);
      }
    }
    expect([...used].filter((name) => !LIGHT.has(name))).toEqual([]);
  });
});

describe('the READMEs', () => {
  // The token table is the contract a frontend reads; it lists every token with theme.css's values.
  for (const readme of ['README.md', 'projects/qits-spa-ui-components/README.md']) {
    it(`${readme} lists every token with its light and dark value`, () => {
      const rows = new Map(
        readFileSync(resolve(process.cwd(), readme), 'utf8')
          .split('\n')
          .map((line) => line.split('|').map((cell) => cell.trim().replace(/^`|`$/g, '')))
          .filter((cells) => cells.length === 6 && LIGHT.has(cells[1]))
          .map((cells) => [cells[1], [cells[2], cells[3]]]),
      );
      const expected = [...LIGHT.entries()].map(([name, light]) => {
        const dark = DARK_FORCED.get(name) ?? '';
        return [name, [light, /^var\(--color-([\w-]+)\)$/.exec(dark)?.[1] ?? dark]];
      });
      expect([...rows.entries()]).toEqual(expected);
    });
  }
});
