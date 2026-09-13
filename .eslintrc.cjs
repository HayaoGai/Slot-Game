/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['node_modules/', 'library/', 'temp/', 'build/', 'tools/output/'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // core/ 必須能在純 Node 環境執行：禁止引用引擎模組
      files: ['assets/scripts/core/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [{ name: 'cc', message: 'core/ 不得依賴 Cocos 引擎模組。' }],
            patterns: [
              { group: ['cc/*', 'cc.*'], message: 'core/ 不得依賴 Cocos 引擎模組。' },
              { group: ['**/view/*', '**/ui/*', '**/audio/*', '**/GameController'], message: 'core/ 不得依賴表現層。' },
            ],
          },
        ],
        'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: '請使用 core/rng.ts 的可注入 RNG。' }],
      },
    },
  ],
};
