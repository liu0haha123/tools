import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  { files: ['currency-converter/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['tests/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
