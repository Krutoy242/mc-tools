/**
 * Sanitize HTML by removing scripts, styles and event handlers.
 * Keeps safe HTML tags for rendering inside markdown tables.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
}

/**
 * Convert simple markdown to HTML for embedding in markdown tables.
 * Converts bold, italic, links, lists, horizontal rules and newlines.
 */
function mergeListItemContinuations(md: string): string {
  const lines = md.split('\n')
  const result: string[] = []
  let inListItem = false

  for (const line of lines) {
    if (/^[*-] /.test(line)) {
      inListItem = true
      result.push(line)
    }
    else if (inListItem && /^\s{2,}/.test(line) && line.trim().length > 0) {
      // Append continuation line to previous list item (with a space)
      result[result.length - 1] += ` ${line.trim()}`
    }
    else {
      inListItem = false
      result.push(line)
    }
  }

  return result.join('\n')
}

export function markdownToHtml(md: string): string {
  if (!md) return ''

  // Pre-process: merge continuation lines into list items
  const merged = mergeListItemContinuations(md)

  let html = merged
    // Convert headers: first separate inline headers with newlines, then convert
    .replace(/([\s<>])(#{1,6}\s)/g, '$1\n$2')
    .replace(/^#{1,6}\s.*$/gm, (match: string) => {
      const level = match.match(/^#+/)![0].length
      const title = match.slice(level).trim()
      return `<h${level}>${title}</h${level}>`
    })
    // Convert horizontal rules
    .replace(/^-{3,}$/gm, '<hr/>')
    // Convert bold
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    // Convert italic (avoid matching list markers at line start)
    .replace(/(^|[^-*])\*([^*]+)\*(?!\*)/g, '$1<i>$2</i>')
    // Convert links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Convert list items
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    // Convert newlines to <br>
    .replace(/\n/g, '<br>')

  // Wrap consecutive li in ul
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$1</ul>')

  // Collapse multiple consecutive <br> tags
  html = html.replace(/(?:<br>\s*){2,}/g, '<br>')

  return html
}
