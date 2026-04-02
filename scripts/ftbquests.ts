import type { Byte, Short } from 'ftbq-nbt'

import type { ChapterConfig } from '../packages/utils/src/mods/ftbquests'

import { readFileSync, renameSync } from 'node:fs'
import process from 'node:process'
import fast_glob from 'fast-glob'
import levenshtein from 'fast-levenshtein'
import { Int, parse } from 'ftbq-nbt'

import sanitize from 'sanitize-filename'

import { naturalSort } from '../packages/utils/src'
import { Lang } from '../packages/utils/src/lang'
import { getChapter, getChapters, getIndex, getItem, getItemName, getQuestTaskItem, getRewardFile, getTaskName, isLangKeyInParenth, langKeyWithoutParenth, saveChapter, saveIndex, saveQuest, saveReward, tagItemToCT, uidGenerator } from '../packages/utils/src/mods/ftbquests'

const TRIM_REGEX = /\W+/g

/**
 * Converts FTBQuests reward tables to chests with saved content
 */
export function printRewardTable(tblHash: string) {
  const reward = getRewardFile(tblHash)

  const s_items = reward.rewards.map(item =>
    tagItemToCT(item.item, item.count?.value)
  )

  return `  giveChest(e.player, [\n${
    s_items.sort(naturalSort).map(s => `    ${s},`).join('\n')
  }\n  ]);\n`
}

export function renameChapters() {
  const lang = new Lang('ftbquests')
  const chapPath = 'config/ftbquests/normal/chapters'

  const index = getIndex()
  const uid = uidGenerator()

  index.index.forEach((hash, i) => {
    let chap: ChapterConfig
    try {
      chap = getChapter(hash)
    }
    catch (e: unknown) {
      return console.error(`cant get chapter ${hash}: ${e instanceof Error ? e.message : String(e)}`)
    }
    const localized = lang.getClear(langKeyWithoutParenth(chap.title))
    const newName = uid(sanitize(`${String(i + 1).padStart(2, '0')} ${localized}`))

    const oldPath = `${chapPath}/${hash}`
    const newPath = `${chapPath}/${newName}`
    console.log('renaming :>> ', hash, ' to ', newName)
    try {
      renameSync(oldPath, newPath)
    }
    catch (error: unknown) {
      console.error(`cant rename!\n${error instanceof Error ? error.message : String(error)}`)
    }

    index.index[i] = newName
  })

  saveIndex(index)
}

export function removeNameOfQuests() {
  const chaps = getChapters()
  const lang = new Lang('ftbquests')

  chaps.forEach((ch) => {
    ch.quests.forEach((q) => {
      if (q.tasks?.[0].type !== 'item') return
      const taskItem = getQuestTaskItem(q)
      if (!taskItem) return
      let dirty = false
      if (q.title) {
        const questLangKey = langKeyWithoutParenth(q.title)
        const nameOfTask = getItemName(taskItem)?.toLocaleLowerCase()
        const nameOfQuest = lang.get(questLangKey)?.toLocaleLowerCase()
        if (!nameOfTask) {
          console.error(`Cant find name: ${taskItem.id}:${taskItem.Damage?.value}`)
        }
        else {
          if (!nameOfQuest) console.error(`Cant find name: ${questLangKey}`)
          if (nameOfTask === nameOfQuest || levenshtein.get(nameOfTask, nameOfQuest) <= 5) {
            delete q.title
            dirty = true
          }
        }
      }
      if (q.icon && q.tasks[0].items.length === 1) {
        const icon = getItem(q.icon)
        if (icon.id === taskItem.id && icon.Damage?.value === taskItem.Damage?.value) {
          delete q.icon
          dirty = true
        }
        // console.log(chalk.gray('icons not same :>> '),
        //   `${chalk.green(icon.id)}:${icon.Damage?.value ?? 0}`,
        //   `${chalk.green(taskItem.id)}:${taskItem.Damage?.value ?? 0}`
        // )
      }
      if (dirty)
        saveQuest(ch.uid, q)
    })
  })
}

export function renameQuestsLangs() {
  const chaps = getChapters()
  const lang = new Lang('ftbquests')

  const usedLangs = new Set<string>()

  const rename = (obj: { title?: string } | string[] | undefined, key: 'title' | 0, fresh: string) => {
    if (!obj) return false
    const old = (obj as Record<string | number, string | undefined>)[key]
    if (!old || !isLangKeyInParenth(old)) return false
    lang.rename(langKeyWithoutParenth(old), fresh)
    usedLangs.add(fresh)
    ;(obj as Record<string | number, string>)[key] = `{${fresh}}`
    return true
  }

  // Rename Entries
  const uidChap = uidGenerator(20, '')
  const trim = (s: string) => s.toLocaleLowerCase().replace(TRIM_REGEX, '_')
  const toKey = (s: string) => trim(lang.getClear(langKeyWithoutParenth(s)))

  chaps.forEach((ch) => {
    const chapName = uidChap(toKey(ch.title))

    let a = 0
    a += +rename(ch, 'title', `q.${chapName}.name`)
    a += +rename(ch.description, 0, `q.${chapName}.desc`)
    if (a) saveChapter(ch)

    const uidQuest = uidGenerator(20, '')
    ch.quests.forEach((q) => {
      const questName = uidQuest(q.title
        ? toKey(q.title)
        : trim(getTaskName(q) ?? '')
      )
      if (!questName) {
        console.log('Quest name identification error:', q)
        throw new Error('Quest name identification error')
      }

      let a = 0
      a += +rename(q, 'title', `q.${chapName}.${questName}.name`)
      a += +rename(q.text, 0, `q.${chapName}.${questName}.desc`)
      if (a) saveQuest(ch.uid, q)
    })
  })

  lang.filter(usedLangs)
  lang.save()
}

// const lang = new Lang('ftbquests')
// lang.save()

interface MCItem {
  Count : Byte
  Damage: Short
  id    : string
  tag?  : any
}

export function injectLatestLine() {
  const lastLine = readFileSync('crafttweaker_raw.log', 'utf8')
    .trim()
    .split('\n')
    .pop()

  if (!lastLine) throw new Error('Last line must content something')
  const parsedList = (parse(lastLine) as unknown as MCItem[])
    .filter(o => Object.keys(o).length)
    .map((l) => {
      const item = l.tag
        ? {
            ...{
              id    : '',
              Damage: 0,
            },
            ...l,
            Slot  : undefined,
            Count : undefined,
            Damage: l.Damage.value !== 0 ? l.Damage : undefined,
          }
        : l.Damage && l.Damage.value !== 0
          ? `${l.id} 1 ${l.Damage.value}`
          : l.id

      return {
        item,
        count: l.Count.value > 1 ? new Int(l.Count.value) : undefined,
      }
    })

  const rarity = process.argv[2]
  if (!rarity) throw new Error('Enter rarity first')

  const fileUids = fast_glob
    .sync('*.snbt', { cwd: 'config/ftbquests/normal/reward_tables' })
    .map(f => f.replace('.snbt', ''))
  const fileRewards = fileUids
    .map(f => getRewardFile(f))

  const index = fileRewards.findIndex(r => r.loot_crate?.string_id === rarity)
  const box = fileRewards[index]
  if (!box) throw new Error(`Cant find box with rarity ${rarity}`)

  box.rewards = parsedList
  saveReward(fileUids[index], box)
}

// injectLatestLine()
