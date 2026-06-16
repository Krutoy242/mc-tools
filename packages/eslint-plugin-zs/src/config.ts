import type { Linter } from 'eslint'

import antfu from '@antfu/eslint-config'

import { defineConfig as defineZsConfig } from './index.js'
import { ruleFactories } from './rules/index.js'

export interface MctoolsConfigOptions {
  /**
   * Path to the `tsconfig.json` used for type-aware linting. Relative to the
   * directory ESLint runs in. Defaults to `'tsconfig.json'`.
   */
  tsconfigPath?: string
  /**
   * Extra ignore globs merged on top of the shared defaults. Use this for
   * repo-specific noise (generated files, asset dirs, …).
   */
  ignores?     : string[]
  /**
   * Extra rule overrides merged last, after the shared personal-style rules.
   */
  rules?       : Linter.RulesRecord
}

// Type-aware rules disabled for ZS-derived TS (it has no real tsconfig project).
// Keep this list in sync with the ZenScript revert preamble — see
// packages/format/src/markers.ts.
const TYPE_AWARE_TS_RULES = [
  'await-thenable',
  'consistent-return',
  'consistent-type-exports',
  'dot-notation',
  'naming-convention',
  'no-array-delete',
  'no-base-to-string',
  'no-confusing-void-expression',
  'no-deprecated',
  'no-duplicate-type-constituents',
  'no-floating-promises',
  'no-for-in-array',
  'no-implied-eval',
  'no-meaningless-void-operator',
  'no-misused-promises',
  'no-misused-spread',
  'no-mixed-enums',
  'no-redundant-type-constituents',
  'no-unnecessary-boolean-literal-compare',
  'no-unnecessary-condition',
  'no-unnecessary-qualifier',
  'no-unnecessary-template-expression',
  'no-unnecessary-type-arguments',
  'no-unnecessary-type-assertion',
  'no-unnecessary-type-conversion',
  'no-unnecessary-type-parameters',
  'no-unsafe-argument',
  'no-unsafe-assignment',
  'no-unsafe-call',
  'no-unsafe-enum-comparison',
  'no-unsafe-member-access',
  'no-unsafe-return',
  'no-unsafe-type-assertion',
  'no-unsafe-unary-minus',
  'no-useless-default-assignment',
  'non-nullable-type-assertion-style',
  'only-throw-error',
  'prefer-destructuring',
  'prefer-find',
  'prefer-includes',
  'prefer-nullish-coalescing',
  'prefer-optional-chain',
  'prefer-promise-reject-errors',
  'prefer-readonly',
  'prefer-readonly-parameter-types',
  'prefer-reduce-type-parameter',
  'prefer-regexp-exec',
  'prefer-return-this-type',
  'prefer-string-starts-ends-with',
  'promise-function-async',
  'related-getter-setter-pairs',
  'require-array-sort-compare',
  'require-await',
  'restrict-plus-operands',
  'restrict-template-expressions',
  'return-await',
  'strict-boolean-expressions',
  'strict-void-return',
  'switch-exhaustiveness-check',
  'unbound-method',
  'use-unknown-in-catch-callback-variable',
]

/**
 * The single source of truth for the `@antfu`-based code style shared between
 * the `Enigmatica2Expert-Extended` modpack repo and the `mc-tools` monorepo.
 * Both repositories' `eslint.config.js` should be a thin wrapper around this so
 * there is exactly one config and one style.
 *
 * ```js
 * // eslint.config.js
 * import { defineMctoolsConfig } from '@mctools/eslint-plugin-zs/config'
 * export default await defineMctoolsConfig({ ignores: ['dumps/**'] })
 * ```
 */
export async function defineMctoolsConfig(
  options: MctoolsConfigOptions = {}
): Promise<Linter.Config[]> {
  const {
    tsconfigPath = 'tsconfig.json',
    ignores = [],
    rules = {},
  } = options

  const tsConfig = await antfu({
    typescript: { tsconfigPath },
    gitignore : false,
    ignores   : [
      '.git/**',
      '**/*.log',
      '**/dist/**',
      'node_modules/**',
      ...ignores,
    ],
    rules: {
      'ts/strict-boolean-expressions'     : 'off',
      'markdown/no-reversed-media-syntax' : 'off',
      'style/jsx-wrap-multilines'         : 'off',
      'style/jsx-closing-tag-location'    : 'off',
      'style/jsx-closing-bracket-location': 'off',
      'style/indent-binary-ops'           : 'off',

      // Override @antfu rules to personal preferences
      'style/key-spacing'            : ['error', { align: 'colon' }],
      'style/no-extra-parens'        : ['error', 'all', { nestedBinaryExpressions: false, nestedConditionalExpressions: false }],
      'style/no-multi-spaces'        : 'off',
      'style/type-annotation-spacing': 'off',
      'antfu/if-newline'             : 'off',
      'style/comma-dangle'           : [
        'error',
        {
          functions: 'never',
          imports  : 'always-multiline',
          exports  : 'always-multiline',
          arrays   : 'always-multiline',
          objects  : 'always-multiline',
        },
      ],

      ...rules,
    },
  }, {
    files  : ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.md/**'],
    rules  : { 'ts/no-floating-promises': 'error' },
  }, {
    files: ['**/*.md'],
    rules: {
      'style/no-trailing-spaces': 'off',
    },
  })

  const typeAwareTsRulesOff = Object.fromEntries(
    TYPE_AWARE_TS_RULES.map(r => [`ts/${r}`, 'off'] as const)
  )

  // Shared overrides for ZS-derived TS: plugin's virtual files + CLI's *.zs.ts
  // output. To move a rule out of DEBRIS_PREAMBLE (packages/format/src/markers.ts),
  // drop it there and add it here. Round-trip-critical rules must stay in the preamble.
  const zsOverrides = {
    languageOptions: { parserOptions: { program: null, project: false, projectService: false } },
    rules          : {
      ...typeAwareTsRulesOff,
      'style/comma-spacing'       : 'off',
      'style/key-spacing'         : 'off',
      'style/no-multi-spaces'     : 'off',
      'style/type-generic-spacing': 'off',
      // ZS preserves user-chosen key quoting (`'A'` stays `'A'`, `A` stays `A`).
      'style/quote-props'         : 'off',
    },
  }

  const zsTsConfig = [
    ...tsConfig,
    { files: ['**/*.ts', '**/*.tsx'], ...zsOverrides },
  ] as Linter.Config[]

  const tsConfigWithZs: Linter.Config[] = [
    ...tsConfig,
    {
      files  : ['**/*.ts', '**/*.tsx'],
      plugins: {
        '@mctools/zs': {
          meta : { name: '@mctools/eslint-plugin-zs', version: '0.0.0' },
          rules: {
            'no-redundant-return-cast': ruleFactories['no-redundant-return-cast']({}),
          },
        },
      },
      rules: { '@mctools/zs/no-redundant-return-cast': 'warn' },
    },
  ]

  return [
    ...tsConfigWithZs,
    ...defineZsConfig({ tsConfig: zsTsConfig }),
    // Real *.zs.ts files emitted by the mctools-format CLI.
    { files: ['**/*.zs.ts'], ...zsOverrides },
  ]
}

export default defineMctoolsConfig
