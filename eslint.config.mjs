// @ts-check
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.git/**'],
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      'no-console': 'warn',
      eqeqeq: 'error',
    },
  },
  {
    // CLI 入口：console 输出即产品接口（战报/基准/演示打印），不视为调试输出
    files: ['packages/arena-core/src/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // 允许 Provider 文件同文件导出配套 hook（useTheme / useApp），
      // 这是 React Context 的惯用模式，拆分会泄露内部 Context
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true, allowExportNames: ['useApp', 'useTheme'] }],
    },
  },
)
