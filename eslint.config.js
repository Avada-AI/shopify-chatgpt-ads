import js from '@eslint/js';

export default [
  {ignores: ['node_modules/', 'dist/']},
  js.configs.recommended,
  {
    languageOptions: {ecmaVersion: 2024, sourceType: 'module'},
    rules: {
      // tsc --checkJs reports undefined names with real Node types; ESLint has no globals list here.
      'no-undef': 'off',
      eqeqeq: ['error', 'always', {null: 'ignore'}],
      'no-console': 'error'
    }
  }
];
