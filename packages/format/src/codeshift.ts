import type { API, FileInfo, JSCodeshift } from 'jscodeshift'

import fse from 'fs-extra'
import * as jscodeshift from 'jscodeshift'

const { readFileSync, writeFileSync } = fse

// Create a transformation function
function transform(fileInfo: FileInfo, api: API) {
  const j = (api.jscodeshift.default as JSCodeshift).withParser('ts')

  let root: jscodeshift.Collection<any>
  try {
    root =  j(fileInfo.source, {
      reuseWhitespace: true,
      comments       : true,
    })
  }
  catch (error) {
    console.error(`\nERROR parsing ts file "${fileInfo.path}":\n${error}`)
    return
  }

  // Transform null checks to nullish coalescing operator
  root.find(j.ConditionalExpression).forEach((path) => {
    const { test: cond, consequent, alternate } = path.node
    type ExpressionKind = typeof alternate

    // Match: !isNull(a) ? a : b
    if (
      j.UnaryExpression.check(cond)
      && cond.operator === '!'
      && j.CallExpression.check(cond.argument)
      && j.Identifier.check(cond.argument.callee)
      && cond.argument.callee.name === 'isNull'
      && cond.argument.arguments.length === 1
      && j.Expression.check(consequent)
      && j.Expression.check(alternate)
    ) {
      const arg = cond.argument.arguments[0] as ExpressionKind
      if (j(arg).toSource() === j(consequent).toSource()) {
        const newExpr = j.logicalExpression('??', arg, alternate)
        j(path).replaceWith(newExpr)
      }
    }
  })

  return root.toSource()
}

export function refactor(filePaths: string[]) {
  filePaths.forEach((f) => {
    const source = readFileSync(f, 'utf8')
    const output = transform(
      { source, path: f } as FileInfo,
      { jscodeshift } as any
    )
    if (output !== undefined) writeFileSync(f, output)
  })
}
