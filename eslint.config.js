import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// PRD §15.6：DisplayLayer 是唯一渲染数据源。
// 用 no-restricted-imports 把"渲染层不得直接读 RealState"从纪律落成机制：
// src/render/** 禁止 import 任何 realState 模块，CI 拦截。
export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: false, ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // 渲染层隔离：只允许吃 DisplayState，碰不到真实状态。
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/engine/realState', '**/engine/game', '*/realState', '*/game'],
              message:
                '渲染层禁止直接读 RealState / Game（PRD §15.6）。只能消费 DisplayLayer 产出的 DisplayState。',
            },
          ],
        },
      ],
    },
  },
];
