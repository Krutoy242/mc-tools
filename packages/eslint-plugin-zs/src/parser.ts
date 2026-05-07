import type { Linter } from 'eslint'

/**
 * Stub parser for `*.zs` files. ESLint requires a parser to produce
 * something AST-shaped — we don't actually parse ZS for AST analysis since
 * `zs-format` is a whole-file rule that reads `context.sourceCode.text`
 * directly. Returning an empty `Program` keeps ESLint happy without the
 * cost of running peggy at every visitor step.
 */
export const zsParser: Linter.Parser = {
  meta: { name: '@mctools/eslint-plugin-zs/parser', version: '0.0.0' },
  parseForESLint(text) {
    return {
      ast: {
        type      : 'Program',
        body      : [],
        sourceType: 'module',
        comments  : [],
        tokens    : [],
        loc       : { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        range     : [0, text.length],
      },
      services   : { isZsStub: true },
      visitorKeys: { Program: [] },
    }
  },
}
