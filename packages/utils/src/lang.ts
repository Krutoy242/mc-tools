import { readFileSync, writeFileSync } from 'node:fs'

import fast_glob from 'fast-glob'

const SECTION_SIGN_REGEX = /§./g
const LANG_EXT_REGEX = /\.lang$/

export class Lang {
  static defaultLangCode = 'en_us'
  private deleteSet = new Set<string>()
  private langFileCache = new Map<string, { [key: string]: string }>()
  private codesCache: string[] | null = null

  constructor(public langOwner: string) {

  }

  private langPath(langCode = Lang.defaultLangCode) {
    return `resources/${this.langOwner}/lang/${langCode}.lang`
  }

  private getLangFile(langCode = Lang.defaultLangCode): { [key: string]: string } {
    if (this.langFileCache.has(langCode)) {
      return this.langFileCache.get(langCode)!
    }
    const text = readFileSync(this.langPath(langCode), 'utf8')
    const tuples: [string, string][] = text
      .split('\n')
      .filter(l => l && l.trim() && !l.trim().startsWith('#'))
      .map(l => [
        l.substring(0, l.indexOf('=')),
        l.substring(l.indexOf('=') + 1),
      ])
    const result = Object.fromEntries(tuples)
    this.langFileCache.set(langCode, result)
    return result
  }

  public get(langEntry: string, langCode = Lang.defaultLangCode) {
    const f = this.getLangFile(langCode)
    if (!f) throw new Error(`Cant find lang code: ${langCode}`)
    const result = f[langEntry]
    if (!result) return langEntry
    return result
  }

  public set(key: string, text: string | string[]) {
    this.getCodes()
      .forEach(langCode =>
        this.getLangFile(langCode)[key]
          = Array.isArray(text) ? text.join('\\n') : text
      )
  }

  /**
   * Get value for lang key entry without formatting symbols `§`
   */
  public getClear(langEntry: string, langCode = Lang.defaultLangCode) {
    return this.get(langEntry, langCode).replace(SECTION_SIGN_REGEX, '')
  }

  public getCodes() {
    if (this.codesCache !== null) {
      return this.codesCache
    }
    this.codesCache = fast_glob.sync(
      '*.lang',
      { cwd: `resources/${this.langOwner}/lang/` }
    ).map(s => s.replace(LANG_EXT_REGEX, ''))
    return this.codesCache
  }

  public filter(keepSet: Set<string>) {
    for (const langCode of this.getCodes()) {
      const lang = this.getLangFile(langCode)
      for (const key of Object.keys(lang)) {
        if (!keepSet.has(key))
          delete lang[key]
      }
    }
  }

  public save(sortWeight?: (langKey: string) => number) {
    for (const langCode of this.getCodes()) {
      const lang = this.getLangFile(langCode)
      this.deleteSet.forEach(del => delete lang[del])
      const lines = Object.entries(lang)
      if (sortWeight) lines.sort(([a], [b]) => sortWeight(a) - sortWeight(b))

      writeFileSync(
        `resources/${this.langOwner}/lang/${langCode}.lang`,
        `#PARSE_ESCAPES\n${lines.map(([k, v]) => `${k}=${v}`).join('\n')}\n`
      )
    }
  }

  public rename(old: string, fresh: string) {
    for (const langCode of this.getCodes()) {
      const lang = this.getLangFile(langCode)
      if (lang[old] === undefined) {
        console.error('Lang code doesnt exist: ', langCode, old)
        continue
      }
      lang[fresh] = lang[old]
      this.deleteSet.add(old)
    }
  }
}
