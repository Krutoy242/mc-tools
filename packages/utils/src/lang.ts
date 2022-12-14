import { readFileSync, writeFileSync } from 'fs'
import fast_glob from 'fast-glob'
import { Memoize } from 'typescript-memoize'

export class Lang {
  static defaultLangCode = 'en_us'
  private deleteSet = new Set<string>()

  constructor(public langOwner: string) {

  }

  private langPath(langCode = Lang.defaultLangCode) {
    return `resources/${this.langOwner}/lang/${langCode}.lang`
  }

  @Memoize()
  private getLangFile(langCode = Lang.defaultLangCode): { [key: string]: string } {
    const text = readFileSync(this.langPath(langCode), 'utf8')
    const tuples = text
      .split('\n')
      .filter(l => l && l.trim() && !l.trim().startsWith('#'))
      .map(l => [
        l.substring(0, l.indexOf('=')),
        l.substring(l.indexOf('=') + 1),
      ])
    return Object.fromEntries(tuples)
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
    return this.get(langEntry, langCode).replace(/§./g, '')
  }

  @Memoize()
  public getCodes() {
    return fast_glob.sync(
      '*.lang', { cwd: `resources/${this.langOwner}/lang/` }
    ).map(s => s.replace(/.lang$/, ''))
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
        console.log('Lang code doesnt exist: ', langCode, old)
        continue
      }
      lang[fresh] = lang[old]
      this.deleteSet.add(old)
    }
  }
}
