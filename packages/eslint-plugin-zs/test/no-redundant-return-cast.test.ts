/* eslint-disable ts/no-unsafe-argument */

import type { Linter } from 'eslint'

import parser from '@typescript-eslint/parser'
import { Linter as LinterCtor } from 'eslint'
import { describe, expect, it } from 'vitest'

import { ruleFactories } from '../src/rules/index.js'

const rule = ruleFactories['no-redundant-return-cast']({} as any)

function lint(source: string, filename = 'test.ts') {
  const linter = new LinterCtor({ configType: 'flat' })

  const config: Linter.Config[] = [
    {
      files          : ['**/*.ts'],
      languageOptions: {
        parser,
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      },
      plugins: {
        '@mctools/zs': {
          meta : { name: '@mctools/eslint-plugin-zs', version: '0.0.0' },
          rules: { 'no-redundant-return-cast': rule },
        },
      },
      rules: { '@mctools/zs/no-redundant-return-cast': 'error' },
    },
  ]

  return linter.verifyAndFix(source, config, { filename })
}

describe('@mctools/zs/no-redundant-return-cast', () => {
  it('removes redundant __as<T>() when T matches function return type', () => {
    const result = lint('function foo(): int { return __as<int>(0.0); }')
    expect(result.messages).toHaveLength(0)
    expect(result.output).toBe('function foo(): int { return 0.0; }')
  })

  it('keeps cast when return types differ', () => {
    const result = lint('function foo(): string { return __as<int>(0.0); }')
    expect(result.messages).toHaveLength(0)
    expect(result.output).toBe('function foo(): string { return __as<int>(0.0); }')
  })

  it('keeps cast when function has no return type', () => {
    const result = lint('function foo() { return __as<int>(0.0); }')
    expect(result.messages).toHaveLength(0)
    expect(result.output).toBe('function foo() { return __as<int>(0.0); }')
  })

  it('handles nested functions correctly', () => {
    const source = `
      function outer(): int {
        function inner(): string {
          return __as<string>("hello");
        }
        return __as<int>(1.0);
      }
    `
    const result = lint(source)
    expect(result.messages).toHaveLength(0)
    expect(result.output).toContain('return "hello";')
    expect(result.output).toContain('return 1.0;')
  })

  it('handles array return types', () => {
    const result = lint('function foo(): Array<string> { return __as<Array<string>>([]); }')
    expect(result.messages).toHaveLength(0)
    expect(result.output).toBe('function foo(): Array<string> { return []; }')
  })

  it('does not touch casts inside binary expressions', () => {
    const result = lint('function foo(): int { return __as<int>(1) + 2; }')
    expect(result.messages).toHaveLength(0)
    expect(result.output).toBe('function foo(): int { return __as<int>(1) + 2; }')
  })

  it('strips /* as */ markers before comparing', () => {
    const source = 'function foo(): /* as */ int { return __as<int>(0.0); }'
    const result = lint(source)
    expect(result.messages).toHaveLength(0)
    expect(result.output).toBe('function foo(): /* as */ int { return 0.0; }')
  })
})
