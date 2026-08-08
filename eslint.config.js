import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist', '**/coverage', '**/node_modules', '**/.claude', 'scripts/*.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['tests/**'],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      // Tests index into arrays they just built; `!` beats optional chains here.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Type fixtures use `async () => value` to produce Promise-typed values.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
