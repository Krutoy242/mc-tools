// @ts-check

module.exports = {
  rules: {
    /** @type {import('eslint').Rule.RuleModule} */
    'zs-preprocessor': {
      meta: {
        type: 'layout',
        docs: {
          description: 'move // #preprocessor comments to the first line after other comments',
          category   : 'Stylistic Issues',
          recommended: false,
        },
        fixable: 'code',
      },
      create(context) {
        return {
          Program() {
            const allComments = context.sourceCode.getAllComments()
            let lastCommentEnd = 0

            // Find the end position of the last comment at the top of the file
            allComments.forEach((comment) => {
              console.log('comment.loc?.start.line', comment.loc?.start.line, '===', comment.value.trim())
              if (comment.loc?.start.line === 1 || comment.loc?.start.line === lastCommentEnd + 1)
                lastCommentEnd = comment.loc?.end.line
            })

            allComments.forEach((comment) => {
              if (comment.value.trim().startsWith('#preprocessor')) {
                const commentLine = context.sourceCode.getText(comment)

                context.report({
                  node   : comment,
                  message: '// #preprocessor comment should be after the initial comments.',
                  fix(fixer) {
                    // Create a fix to remove the original comment
                    const removeOriginalComment = fixer.remove(comment)

                    // Find the position after the last comment
                    const positionAfterLastComment = context.sourceCode.getIndexFromLoc({ line: lastCommentEnd + 1, column: 0 })

                    // Create a fix to insert the comment after the last comment
                    const insertCommentAfterLastComment = fixer.insertTextAfterRange([positionAfterLastComment, positionAfterLastComment], `${commentLine}\n`)

                    // Return an array of fixes to be applied in order
                    return [removeOriginalComment, insertCommentAfterLastComment]
                  },
                })
              }
            })
          },
        }
      },
    },
  },
}
