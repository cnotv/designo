// Adapted from cnotv/generative-art: the same functional, naming and complexity rules,
// without that repository's Three.js-specific local rules.
import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import functional from 'eslint-plugin-functional'
import jsdoc from 'eslint-plugin-jsdoc'
import unicorn from 'eslint-plugin-unicorn'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default [
  // The docs site is a separate Docusaurus project with its own dependencies, which CI does not
  // install for the workspace; its own build in github-pages.yml checks it.
  {
    ignores: [
      'documentation/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '.claude/worktrees/**'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  {
    files: ['**/*.{js,mjs,ts,mts,vue}'],
    plugins: { functional, unicorn },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      'functional/no-classes': 'error',
      'functional/no-loop-statements': 'error',
      'functional/no-let': ['error', { allowInForLoopInit: false, allowInFunctions: true }],
      'functional/immutable-data': [
        'error',
        { ignoreAccessorPattern: ['**.value', 'response.**', 'canvas.width', 'canvas.height'] }
      ],

      'unicorn/prevent-abbreviations': [
        'error',
        {
          allowList: {
            args: true,
            db: true,
            dir: true,
            e: true,
            env: true,
            fn: true,
            i: true,
            id: true,
            params: true,
            props: true,
            ref: true,
            refs: true,
            src: true,
            url: true,
            ctx: true,
            x: true,
            y: true,
            dev: true,
            max: true,
            min: true
          }
        }
      ],
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/better-regex': 'error',

      complexity: ['error', { max: 10 }],
      'max-depth': ['error', { max: 4 }],
      'max-lines-per-function': [
        'error',
        { max: 100, skipBlankLines: true, skipComments: true, IIFEs: true }
      ],
      'max-params': ['error', { max: 5 }],
      'no-magic-numbers': [
        'warn',
        {
          ignore: [0, 1, -1, 2, 3, 4, 5, 10, 100, 180, 200, 1000],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          enforceConst: true,
          detectObjects: false
        }
      ],

      'prefer-const': 'error',
      'no-var': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'consistent-return': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'vue/multi-word-component-names': 'off'
    }
  },

  {
    files: ['**/*.{ts,mts}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    }
  },

  // Vue files are type-checked by vue-tsc rather than typed linting.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' }
    },
    rules: { 'functional/immutable-data': 'off' }
  },

  {
    files: ['**/*.{js,mjs}'],
    rules: { 'functional/immutable-data': 'off' }
  },

  // Canvas 2D drawing is an imperative API: setting fillStyle and friends is how it works.
  {
    files: ['packages/editor/src/rendering/**/*.ts'],
    rules: { 'functional/immutable-data': 'off' }
  },

  {
    files: ['**/*.test.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'no-magic-numbers': 'off',
      'functional/no-let': 'off',
      'functional/immutable-data': 'off'
    }
  },

  {
    files: ['*.config.{js,ts,mjs}', '**/vite.config.ts', 'scripts/**/*.{js,mjs}'],
    rules: {
      'no-magic-numbers': 'off',
      'no-console': 'off',
      'unicorn/prevent-abbreviations': 'off'
    }
  },

  // Every exported function says what it is for and documents its arguments and result.
  {
    files: ['**/*.{ts,mts,vue}'],
    ignores: ['**/*.test.ts', '**/*.d.ts', '**/*.config.ts'],
    ...jsdoc.configs['flat/recommended-typescript-error'],
    rules: {
      ...jsdoc.configs['flat/recommended-typescript-error'].rules,
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true
          }
        }
      ],
      'jsdoc/require-param': ['error', { checkDestructuredRoots: false }],
      'jsdoc/check-param-names': ['error', { checkDestructured: false }],
      'jsdoc/require-description': 'error'
    }
  },

  prettierConfig
]
