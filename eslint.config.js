import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'supabase/functions'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 외부 응답은 경계에서 검증 후 신뢰(web-stack.md §1). any 금지.
      '@typescript-eslint/no-explicit-any': 'error',
      // `_` 접두 = 의도적으로 안 쓰는 값(구조분해로 prop 걷어내기 등). 인자·변수 양쪽에 적용.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // 테스트 파일에 vitest 전역 허용
  {
    files: ['**/__tests__/**', '**/*.{test,spec}.{ts,tsx}', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
)
