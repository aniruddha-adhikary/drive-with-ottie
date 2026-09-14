// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'apps/web/dist/**',
      'out/**',
      'coverage/**',
      'assets/**',
      'tools/asset_extraction/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'World generation must be seeded; use the injected Rng port instead of Math.random.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use the injected Clock port instead of `new Date()`.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Use the injected Clock port instead of `Date.now()`.',
        },
      ],
    },
  },
  {
    files: ['packages/contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'packages/contracts must stay framework-free.' },
            { name: 'react-dom', message: 'packages/contracts must stay framework-free.' },
            { name: 'three', message: 'packages/contracts must stay framework-free.' },
          ],
          patterns: [
            { group: ['node:*'], message: 'packages/contracts must not depend on Node built-ins.' },
            { group: ['three/*', 'react/*', 'react-dom/*'], message: 'packages/contracts must stay framework-free.' },
            { group: ['@ottie/*'], message: 'packages/contracts is the root of the dependency graph; it cannot import other modules.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.tsx', 'apps/web/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs['recommended-latest'].rules },
  },
  {
    files: ['**/*.js', '**/*.config.ts', 'config/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
