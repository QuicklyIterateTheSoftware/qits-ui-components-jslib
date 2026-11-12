/**
 * The library's colours for an app that never loads `@qits/ui-components/theme.css` — most of
 * today's frontends have no Tailwind to load it with, and a maintenance bump only moves their pin.
 * One `@property` registration per semantic token of theme.css, with the token's light value as
 * its initial value: a `var(--color-<token>)` nobody has set then resolves to exactly the colour
 * the component painted before it had tokens, so those apps see no change. An app that does load
 * the theme sets the tokens on `:root`, and that wins over an initial value.
 *
 * Every coloured component lists it first in its `styles`. Angular's emulated encapsulation scopes
 * selectors, never an at-rule's name, so the registrations reach the document as written, and the
 * same rule from several components is the same registration. `<color>` throughout, the shadows
 * included: theirs are colours too, and a typed registration is what makes an initial value apply.
 *
 * One literal, not a list mapped to rules: the compiler reads `styles` statically and cannot run a
 * `map`. theme.spec.ts fails when a name or a value here differs from theme.css's `@theme` block.
 */
export const QITS_THEME_DEFAULTS = `
@property --color-surface { syntax: '<color>'; inherits: true; initial-value: #ffffff; }
@property --color-surface-subtle { syntax: '<color>'; inherits: true; initial-value: #f9fafb; }
@property --color-surface-muted { syntax: '<color>'; inherits: true; initial-value: #f3f4f6; }
@property --color-surface-active { syntax: '<color>'; inherits: true; initial-value: #e5e7eb; }
@property --color-surface-inverse { syntax: '<color>'; inherits: true; initial-value: #1f2937; }
@property --color-surface-inverse-hover { syntax: '<color>'; inherits: true; initial-value: #374151; }
@property --color-surface-tint { syntax: '<color>'; inherits: true; initial-value: rgba(31, 41, 55, 0.08); }
@property --color-fg { syntax: '<color>'; inherits: true; initial-value: #111827; }
@property --color-fg-soft { syntax: '<color>'; inherits: true; initial-value: #374151; }
@property --color-fg-muted { syntax: '<color>'; inherits: true; initial-value: #6b7280; }
@property --color-fg-faint { syntax: '<color>'; inherits: true; initial-value: #9ca3af; }
@property --color-fg-control { syntax: '<color>'; inherits: true; initial-value: #1f2937; }
@property --color-fg-on-accent { syntax: '<color>'; inherits: true; initial-value: #ffffff; }
@property --color-fg-on-inverse { syntax: '<color>'; inherits: true; initial-value: #f9fafb; }
@property --color-line { syntax: '<color>'; inherits: true; initial-value: #e5e7eb; }
@property --color-line-subtle { syntax: '<color>'; inherits: true; initial-value: #f3f4f6; }
@property --color-line-strong { syntax: '<color>'; inherits: true; initial-value: #d1d5db; }
@property --color-accent { syntax: '<color>'; inherits: true; initial-value: #1d4ed8; }
@property --color-accent-soft { syntax: '<color>'; inherits: true; initial-value: #eff6ff; }
@property --color-accent-line { syntax: '<color>'; inherits: true; initial-value: #bfdbfe; }
@property --color-accent-muted { syntax: '<color>'; inherits: true; initial-value: #93a3c8; }
@property --color-focus-ring { syntax: '<color>'; inherits: true; initial-value: #3b82f6; }
@property --color-danger { syntax: '<color>'; inherits: true; initial-value: #b91c1c; }
@property --color-danger-soft { syntax: '<color>'; inherits: true; initial-value: #fef2f2; }
@property --color-danger-line { syntax: '<color>'; inherits: true; initial-value: #fecaca; }
@property --color-danger-strong { syntax: '<color>'; inherits: true; initial-value: #991b1b; }
@property --color-warning { syntax: '<color>'; inherits: true; initial-value: #b45309; }
@property --color-warning-soft { syntax: '<color>'; inherits: true; initial-value: #fffbeb; }
@property --color-warning-line { syntax: '<color>'; inherits: true; initial-value: #fde68a; }
@property --color-warning-strong { syntax: '<color>'; inherits: true; initial-value: #92400e; }
@property --color-warning-fill { syntax: '<color>'; inherits: true; initial-value: #d97706; }
@property --color-success { syntax: '<color>'; inherits: true; initial-value: #047857; }
@property --color-success-soft { syntax: '<color>'; inherits: true; initial-value: #ecfdf5; }
@property --color-success-line { syntax: '<color>'; inherits: true; initial-value: #a7f3d0; }
@property --color-success-strong { syntax: '<color>'; inherits: true; initial-value: #065f46; }
@property --color-special { syntax: '<color>'; inherits: true; initial-value: #6d28d9; }
@property --color-special-soft { syntax: '<color>'; inherits: true; initial-value: #f5f3ff; }
@property --color-special-line { syntax: '<color>'; inherits: true; initial-value: #ddd6fe; }
@property --color-code-keyword { syntax: '<color>'; inherits: true; initial-value: #7c3aed; }
@property --color-code-string { syntax: '<color>'; inherits: true; initial-value: #047857; }
@property --color-code-number { syntax: '<color>'; inherits: true; initial-value: #b45309; }
@property --color-code-annotation { syntax: '<color>'; inherits: true; initial-value: #be185d; }
@property --color-code-type { syntax: '<color>'; inherits: true; initial-value: #1d4ed8; }
@property --color-code-punctuation { syntax: '<color>'; inherits: true; initial-value: #4b5563; }
@property --color-shadow { syntax: '<color>'; inherits: true; initial-value: rgb(17 24 39 / 12%); }
@property --color-shadow-near { syntax: '<color>'; inherits: true; initial-value: rgba(0, 0, 0, 0.12); }
@property --color-shadow-far { syntax: '<color>'; inherits: true; initial-value: rgba(0, 0, 0, 0.08); }
`;
