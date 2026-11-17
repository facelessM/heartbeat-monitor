import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'android', 'ios', '.expo']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    plugins: {
      '@typescript-eslint': tseslint,
    },
    languageOptions: {
      ecmaVersion: 2020,
      // React Native runtime globals (timers, console, fetch, __DEV__, etc.).
      globals: { ...globals.node, __DEV__: 'readonly' },
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // React Native loads static assets (images, audio) via require().
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
])
