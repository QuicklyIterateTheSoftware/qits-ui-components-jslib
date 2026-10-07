// @ts-check
const { defineConfig } = require('eslint/config');
const rootConfig = require('../../eslint.config.js');

module.exports = defineConfig([
  // Recorded sources the highlighter specs read as text: inputs, not code of this library.
  { ignores: ['**/src/**/fixtures/**'] },
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
  {
    files: ['**/*.html'],
    rules: {},
  },
]);
