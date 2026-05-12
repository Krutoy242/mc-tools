import type { Rule } from 'eslint'

/* eslint-disable ts/no-unsafe-argument, ts/no-unsafe-assignment, ts/no-unsafe-member-access, ts/no-unsafe-return */

/**
 * Remove redundant `__as<T>()` casts in return statements when the cast type
 * matches the enclosing function's declared return type.
 *
 * ZenScript now auto-casts return values to the function's return type, so
 * explicit casts like `return 0.0 as int` inside `function foo() as int`
 * are unnecessary. In the generated TS this looks like:
 *
 *   function foo() :/\u200B* as *\u200B/ int { return __as<int>(0.0); }
 *
 * This rule strips the `__as<int>()` wrapper when `int` matches the function
 * return type.
 */

const MESSAGE_ID = 'redundantReturnCast'

function normalizeType(raw: string): string {
  // Strip block comments (e.g. /* as */) and collapse whitespace
  return raw
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getTypeArguments(node: any): any[] | undefined {
  if (!node) return undefined
  // @typescript-eslint/parser v8+ uses `typeArguments`, older versions may use
  // `typeParameters`. We check both to stay robust across upgrades.
  const ta = node.typeArguments ?? node.typeParameters
  if (ta && Array.isArray(ta.params)) return ta.params
  return undefined
}

export function makeNoRedundantReturnCastRule(): Rule.RuleModule {
  return {
    meta: {
      type   : 'suggestion',
      fixable: 'code',
      docs   : {
        description:
          'Remove redundant __as<T>() casts in return statements when T '
          + 'matches the function return type',
      },
      schema  : [],
      messages: {
        [MESSAGE_ID]:
          'Redundant return cast __as<{{type}}>() — function already returns '
          + '{{type}}',
      },
    },
    create(context) {
      const source = context.getSourceCode()
      const funcStack: any[] = []

      return {
        // Track nested functions so we always know the current enclosing one
        FunctionDeclaration(node: any) {
          funcStack.push(node)
        },
        FunctionExpression(node: any) {
          funcStack.push(node)
        },
        ArrowFunctionExpression(node: any) {
          funcStack.push(node)
        },
        'FunctionDeclaration:exit': function (node: any) {
          const idx = funcStack.lastIndexOf(node)
          if (idx !== -1) funcStack.splice(idx, 1)
        },
        'FunctionExpression:exit': function (node: any) {
          const idx = funcStack.lastIndexOf(node)
          if (idx !== -1) funcStack.splice(idx, 1)
        },
        'ArrowFunctionExpression:exit': function (node: any) {
          const idx = funcStack.lastIndexOf(node)
          if (idx !== -1) funcStack.splice(idx, 1)
        },

        ReturnStatement(node: any) {
          const argument = node.argument
          if (!argument || argument.type !== 'CallExpression') return

          const callee = argument.callee
          if (!callee || callee.type !== 'Identifier' || callee.name !== '__as')
            return

          const typeParams = getTypeArguments(argument)
          if (!typeParams || typeParams.length !== 1) return

          const castTypeRaw = source.getText(typeParams[0])
          const castType = normalizeType(castTypeRaw)
          if (!castType) return

          const funcNode = funcStack[funcStack.length - 1]
          if (!funcNode) return

          const returnTypeNode = funcNode.returnType
          if (!returnTypeNode) return

          const returnTypeRaw = source.getText(returnTypeNode.typeAnnotation)
          const returnType = normalizeType(returnTypeRaw)
          if (!returnType) return

          if (castType === returnType) {
            const innerExpr = argument.arguments?.[0]
            if (!innerExpr) return

            context.report({
              node     : argument,
              messageId: MESSAGE_ID,
              data     : { type: castType },
              fix(fixer) {
                return fixer.replaceText(
                  argument,
                  source.getText(innerExpr)
                )
              },
            })
          }
        },
      }
    },
  }
}
