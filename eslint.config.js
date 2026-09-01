import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', '.task00-vite-temp']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    files: ['src/game/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'The game layer must remain framework-free.' },
            { name: 'react-dom', message: 'The game layer must remain framework-free.' },
            { name: 'zustand', message: 'The game layer must remain state-library-free.' },
          ],
          patterns: [
            { group: ['@mui/*'], message: 'The game layer must not import UI packages.' },
            {
              group: [
                '**/ui/*',
                '**/application/*',
                '**/infrastructure/*',
                '**/ai/*',
              ],
              message: 'The game layer must not depend on outer architecture layers.',
            },
          ],
        },
      ],
    },
  },
])

