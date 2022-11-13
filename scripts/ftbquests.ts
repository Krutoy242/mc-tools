import { readFileSync, renameSync, writeFileSync } from 'fs'
import { parse as csvParseSync } from 'csv-parse/sync'
import levenshtein from 'fast-levenshtein'
import sanitize from 'sanitize-filename'
import type { Byte, Short } from 'ftbq-nbt'
import { Int, parse } from 'ftbq-nbt'
import fast_glob from 'fast-glob'
import { Lang } from '../packages/utils/src/lang'
import type { ChapterConfig, Item, QuestUid } from '../packages/utils/src/mods/ftbquests'
import { getChapter, getChapters, getItem, getLangKey, getRewardFile, isLangKey, saveChapter, saveQuest, saveReward, tagItemToCT, uidGenerator } from '../packages/utils/src/mods/ftbquests'
import { parseFtbqSNbt, stringifyFTBQSNbt } from '../packages/utils/src/snbt'
import { naturalSort } from '../packages/utils/src'

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

// writeFileSync('~rewardTables.zs', [
//   '30509f47',
//   '15309327',
//   '4178342e',
//   '86454b68',
//   '37ab1338',
// ].map(printRewardTable).join('\n\n'))

export function renameChapters() {
  const lang = new Lang('ftbquests')
  const chapPath = 'config/ftbquests/normal/chapters'

  const indexPath = `${chapPath}/index.snbt`
  const text = readFileSync(indexPath, 'utf8')
  const index = (parseFtbqSNbt(text) as any)
  const uid = uidGenerator()

  ;(index.index as string[]).forEach((hash, i) => {
    let chap: ChapterConfig
    try {
      chap = getChapter(hash)
    }
    catch (e: any) {
      return console.error(`cant get chapter ${hash}: ${e.message}`)
    }
    const localized = lang.getClear(getLangKey(chap.title))
    const newName = uid(sanitize(`${String(i + 1).padStart(2, '0')} ${localized}`))

    const oldPath = `${chapPath}/${hash}`
    const newPath = `${chapPath}/${newName}`
    console.log('renaming :>> ', hash, ' to ', newName)
    try {
      renameSync(oldPath, newPath)
    }
    catch (e) {
      console.error('cant rename!')
    }

    index.index[i] = newName
  })

  writeFileSync(indexPath, stringifyFTBQSNbt(index))
}

export const getCSV = (filename: string) =>
  csvParseSync(readFileSync(filename, 'utf8'), { columns: true }) as Record<string, string>[]

function getItemNames() {
  const csv = getCSV('config/tellme/items-csv.csv')
  return csv.reduce(
    (result, o) => {
      (result[o['Registry name']] ??= {})[o['Meta/dmg']] = o['Display name']
      return result
    },
    {} as Record<string, Record<string, string>>
  )
}
const names = getItemNames()
const getItemName = (i?: Item) =>
  i === undefined
    ? undefined
    : (names[i.id]?.[String(i.Damage?.value ?? 0)] ?? names[i.id]?.[0]).replace(/§./g, '')

function getQuestTaskItem(q: QuestUid) {
  const firstTask = q?.tasks?.[0]?.items?.[0]
  if (!firstTask) return undefined
  const taskItem = getItem((firstTask as any)?.item ?? firstTask)
  if (taskItem) return taskItem
  console.log('Cant define:', firstTask)
}

function getTaskName(q: QuestUid) {
  return getItemName(getQuestTaskItem(q)) ?? q?.tasks?.[0]?.title
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
        const questLangKey = getLangKey(q.title)
        const nameOfTask = getItemName(taskItem)?.toLocaleLowerCase()
        const nameOfQuest = lang.get(questLangKey)?.toLocaleLowerCase()
        if (!nameOfTask) console.error(`Cant find name: ${taskItem.id}:${taskItem.Damage?.value}`)
        if (!nameOfQuest) console.error(`Cant find name: ${questLangKey}`)
        if (nameOfTask === nameOfQuest || levenshtein.get(nameOfTask, nameOfQuest) <= 5) {
          delete q.title
          dirty = true
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

  const rename = (obj: any, key: string | number, fresh: string) => {
    const old: string | undefined = obj?.[key]
    if (!old || !isLangKey(old)) return false
    lang.rename(getLangKey(old), fresh)
    usedLangs.add(fresh)
    obj[key] = `{${fresh}}`
    return true
  }

  // Rename Entries
  const uidChap = uidGenerator(20, '')
  const trim = (s: string) => s.toLocaleLowerCase().replace(/[^\d\w]+/g, '_')
  const toKey = (s: string) => trim(lang.getClear(getLangKey(s)))

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
  id: string
  Count: Byte
  tag?: any
  Damage: Short
}

function injectLatestLine() {
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
        : (l.Damage && l.Damage.value !== 0)
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

injectLatestLine()
