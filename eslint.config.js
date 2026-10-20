import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const domGlobals = [
  'window',
  'document',
  'localStorage',
  'performance',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'globalThis',
  'self',
  'location',
  'navigator',
  'addEventListener',
].map((name) => ({
  name,
  message:
    'Pure modules have no DOM or timer access; only main.ts, render.ts and input-dom.ts may use it.',
}));

const determinismMessage =
  'Deterministic by construction: use the game Rng and the tick counter; only main.ts may read the wall clock or Math.random.';

export default defineConfig(
  {
    ignores: [
      'dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '.awos/',
      '.claude/',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true },
      ],
    },
  },
  {
    // The project service only discovers tsconfig.json (src/). Tests, e2e and
    // config files belong to tsconfig.node.json, so point them at it directly.
    files: ['tests/**/*.ts', 'e2e/**/*.ts', '*.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.node.json',
      },
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/**'],
    ignores: ['src/main.ts', 'src/render.ts', 'src/input-dom.ts'],
    rules: {
      'no-restricted-globals': ['error', ...domGlobals],
    },
  },
  {
    files: ['src/**'],
    ignores: ['src/main.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: determinismMessage },
        { object: 'Date', property: 'now', message: determinismMessage },
        { object: 'performance', property: 'now', message: determinismMessage },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: determinismMessage,
        },
      ],
    },
  },
  prettier,
);
