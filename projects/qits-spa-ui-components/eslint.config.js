// @ts-check
const { defineConfig } = require('eslint/config');
const rootConfig = require('../../eslint.config.js');
// ESM, required synchronously: Node 22.12+ loads an ES module through require().
const qits = require('@qits/angular/eslint').default;

module.exports = defineConfig([
  // Recorded sources the highlighter specs read as text: inputs, not code of this library. And the
  // screenshot freezes the browser specs write: rendered HTML, not templates.
  { ignores: ['**/src/**/fixtures/**', '**/src/testing/browser/freezes/**'] },
  ...rootConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'qits',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'qits',
          style: 'kebab-case',
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Colours come from the library's own theme (src/theme.css, relative to this project's
  // package.json), never a literal: a hex in a component is one a dark page cannot repaint. Only
  // this rule of the plugin — `recommended`'s page, store and pact rules are about apps.
  {
    files: ['**/*.ts'],
    plugins: { qits },
    rules: {
      'qits/theme-colors': ['error', { theme: 'src/theme.css' }],
    },
  },
  {
    files: ['**/*.html'],
    rules: {},
  },
]);
