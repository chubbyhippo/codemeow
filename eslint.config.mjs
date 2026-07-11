// eslint flat config: js + typescript-eslint type-checked recommended, plus
// the project's audited naming conventions. `npm run lint` runs it; prettier
// stays the formatter (no stylistic rules here).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // node:test idiom — describe()/it() return promises nobody awaits — and
    // the Fake* port implementations satisfy async EditorPort signatures
    // with synchronous bodies
    files: ['src/test/**'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    rules: {
      // `_`-prefix is the project's own ignored-binding convention
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/naming-convention': [
        'warn',
        // camelCase everywhere by default; PascalCase module-namespace
        // consts (Rc, Words, Things) and UPPER module consts both exist
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        { selector: 'import', format: null },
        // rc lines, command ids ('meow-next-word'), key names: never renamed
        { selector: 'objectLiteralProperty', format: null },
      ],
    },
  },
);
