import chalk from 'chalk'

import type { QuestUid } from '../packages/utils/src/mods/ftbquests'

import { Lang } from '../packages/utils/src/lang'
import { getChapters, getTaskName, isLangKeyInParenth, langKeyWithoutParenth, saveChapter, saveQuest, uidGenerator } from '../packages/utils/src/mods/ftbquests'

/**
 * Change every text entry in quest book to lang code
 * for easily translate to other languages
 */
export function cleanupLangEntries() {
  const chaps = getChapters()
  const lang = new Lang('ftbquests')

  /** List of lang entries that actually used in quest book */
  const usedLangs = new Map<string, number>()
  const keepLang = (k: string, weight: number) => usedLangs.set(k, weight)

  const questDeps = new Map<QuestUid, number>()
  function getQuestDeph(quest: QuestUid): number {
    if (questDeps.has(quest)) return questDeps.get(quest) as number
    const v = quest.dependencies?.map((uid) => {
      for (const ch of chaps) {
        const found = ch.quests.find(q => q.uid === uid)
        if (found) return getQuestDeph(found) + 1
      }
      throw new Error(`Cant found lang for ${uid}`)
    }).reduce((a, b) => a + b) ?? 0
    questDeps.set(quest, v)
    return v
  }

  /**
   * Replace old text in field to lang code
   * @returns true if replaced
   */
  function langify<T extends Record<string, string | string[]>>(obj: T, key: keyof T, newLangKey: string, sortWeight: number) {
    const text = obj[key]
    if (text === undefined || !text.length) return false // Skip if no desc or already lang key
    const oldKey = Array.isArray(text) ? text[0] : text as string
    if (isLangKeyInParenth(oldKey)) {
      keepLang(langKeyWithoutParenth(oldKey), sortWeight)
      return false
    }
    keepLang(newLangKey, sortWeight)
    lang.set(newLangKey, text)
    const t = `{${newLangKey}}`
    ;(obj as any)[key] = Array.isArray(obj[key]) ? [t] : t
    console.log(`${`${chalk.green('+')} ${chalk.gray(newLangKey)}`} = ${chalk.rgb(10, 10, 10)(JSON.stringify(text).substring(0, 100))}`)
    return true
  }

  const langifyTitle = (obj: { title?: string }, newLangKey: string, sortWeight: number) => {
    return langify(obj, 'title', newLangKey, sortWeight)
  }

  const langifyDesc = (obj: { description?: string[], text?: string[] }, newLangKey: string, sortWeight: number) => {
    return (['description', 'text'] as const).map(k => langify(obj, k, newLangKey, sortWeight)).some(Boolean)
  }

  const uidChap = uidGenerator(20, '')

  /** Make string lang-key compatible */
  const trim = (s: string) => s.toLocaleLowerCase().replace(/\W+/g, '_')
  const toKey = (s: string) => trim(lang.getClear(langKeyWithoutParenth(s)))

  /** Get key that would be used in lang key */
  const titleToName = (s: string) => isLangKeyInParenth(s)
    ? s.split('.').slice(1, -1).pop() as string
    : toKey(s)

  chaps.forEach((ch, chapIndex) => {
    const chapWeight = chapIndex * 1000000
    const chapName = uidChap(titleToName(ch.title))

    if (+langifyTitle(ch, `q.${chapName}.name`, chapWeight)
      + +langifyDesc(ch, `q.${chapName}.desc`, chapWeight)) {
      saveChapter(ch)
    }

    const uidQuest = uidGenerator(20, '')
    ch.quests.forEach((q, questIndex) => {
      const questWeight = chapWeight + getQuestDeph(q) + questIndex / 10000
      const questName = uidQuest(q.title
        ? titleToName(q.title)
        : trim(getTaskName(q) ?? '')
      )

      if (!questName) {
        console.warn(`Quest name identification error: ${JSON.stringify({
          title: q.title,
          icon : q.icon,
          text : q.text,
          uid  : q.uid,
        }, null, 2)}`)
        return
      }

      if (+langifyTitle(q, `q.${chapName}.${questName}.name`, questWeight)
        + +langifyDesc(q, `q.${chapName}.${questName}.desc`, questWeight + 0.000001)) {
        saveQuest(ch.uid, q)
      }
    })
  })

  lang.filter(new Set(usedLangs.keys()))
  lang.save(k => usedLangs.get(k) ?? 0)
}

cleanupLangEntries()
