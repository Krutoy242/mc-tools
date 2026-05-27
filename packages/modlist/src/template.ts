import { readFileSync } from 'node:fs'
import Handlebars from 'handlebars'
import { SANITIZE_MARKDOWN_REGEX, SANITIZE_NEWLINES_REGEX } from './utils/misc.js'
import { relative } from './utils/path.js'

export function registerHelpers(): void {
  Handlebars.registerHelper('sanitize', (str: string) =>
    String(str).replace(SANITIZE_NEWLINES_REGEX, ' ').replace(SANITIZE_MARKDOWN_REGEX, '\\$1').trim())
  Handlebars.registerHelper('replace', (str: string, from: string, to: string) => String(str).replace(from, to))
  Handlebars.registerHelper('padEnd', (str: string, pad: number, options: { hash: { pre?: string, post?: string } }) =>
    ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padEnd(pad))
  Handlebars.registerHelper('padStart', (str: string, pad: number, options: { hash: { pre?: string, post?: string } }) =>
    ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padStart(pad))
  Handlebars.registerHelper('stripNewlines', (str: string) => String(str).replace(/[\r\n]+/g, ' '))
}

export function compileTemplate(template?: string): HandlebarsTemplateDelegate {
  const source = template ?? readFileSync(relative('../default.hbs'), 'utf8')
  return Handlebars.compile(source)
}
