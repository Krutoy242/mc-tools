import type { Byte, TagMap } from 'ftbq-nbt'

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import fast_glob from 'fast-glob'
import { Int, parse, stringify } from 'ftbq-nbt'

import { getItemNames } from './tellme'

/*
████████╗██╗   ██╗██████╗ ███████╗███████╗
╚══██╔══╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔════╝
   ██║    ╚████╔╝ ██████╔╝█████╗  ███████╗
   ██║     ╚██╔╝  ██╔═══╝ ██╔══╝  ╚════██║
   ██║      ██║   ██║     ███████╗███████║
   ╚═╝      ╚═╝   ╚═╝     ╚══════╝╚══════╝
*/

export interface Item {
  Count? : Int
  Damage?: Int
  id     : string
  tag?   : TagMap
}

export interface RewardItem {
  count? : Int
  item   : Item | string
  weight?: Int
}

export interface Reward {
  loot_crate?: {
    color: Int
    drops: {
      boss   : Int
      monster: Int
      passive: Int
    }
    item_name: string
    string_id: string
  }
  loot_size: number
  rewards  : RewardItem[]
  title    : string
}

export interface ChapterConfig {
  always_invisible   : boolean
  default_quest_shape: string
  description        : string[]
  group              : number
  icon               : string
  title              : string
}

export type ChapterConfigUid = ChapterConfig & { uid: string }

export interface QuestReward {
  auto?   : string
  command?: string
  item    : Item | string
  type    : string
  uid     : string
}

export interface ItemQuestTask {
  ignore_nbt?: Byte
  items      : ({ item: string } | Item)[]
  type       : 'item'
}

export interface FluidQuestTask {
  fluid: string
  type : 'fluid'
}

export type QuestTask = (FluidQuestTask | ItemQuestTask) & {
  title?: string
  uid   : string
}

export interface Quest {
  dependencies?: string[]
  icon?        : Item | string
  rewards      : QuestReward[]
  tasks        : QuestTask[]
  text?        : string[]
  title?       : string
  x            : number
  y            : number
}

export type QuestUid = Quest & { uid: string }

export type Chapter = ChapterConfigUid & { quests: QuestUid[] }

export function parseFtbqSNbt(sNbt: string) {
  const replaced = sNbt
    .replace(/(\[[BIL];(\s*-?\d+(\.\d+)?[BIL]\b,?)+\s*\])/gi, (m, r) => {
      return r.replace(/(\d+)[BIL]\b/gi, '$1')
    }) // Remove list types
  try {
    return parse(replaced, { useBoolean: true })
  }
  catch (error) {
    console.log('error parsing this :>> ', replaced, error)
  }
}

export function stringifyFTBQSNbt(tag: object) {
  return `${stringify(tag as any, {
    pretty      : true,
    breakLength : 0,
    useBoolean  : true,
    tab         : '\t',
    noTagListTab: true,
    arrayPostfix: { B: 'b', L: 'l' },
    typePostfix : { L: 'L', D: 'd' },
  })}\n`
}

function getFile<T>(subPath: string, mc = './'): T {
  const text = readFileSync(resolve(mc,    `config/ftbquests/normal/${subPath}.snbt`),  'utf8')
  return parseFtbqSNbt(text) as unknown as T
}

export function getRewardFile(questHash: string, mc = './'): Reward {
  return getFile(`reward_tables/${questHash}`, mc)
}

export function getChapter(chapterHash: string, mc = './'): ChapterConfigUid {
  return {
    ...getFile(`chapters/${chapterHash}/chapter`, mc) as ChapterConfig,
    uid: chapterHash,
  }
}

export function getQuest(chapUid: string, questUid: string, mc = './'): QuestUid {
  return {
    ...getFile(`chapters/${chapUid}/${questUid}`, mc) as Quest,
    uid: questUid,
  }
}

function saveFile(obj: object, filePath: string, mc = './') {
  const p = resolve(mc, `config/ftbquests/normal/${filePath}.snbt`)
  writeFileSync(p, stringifyFTBQSNbt(obj))
}

export function saveQuest(chapUid: string, quest: QuestUid, mc = './') {
  const cleanQuest = { ...quest, uid: undefined } as Quest
  return saveFile(cleanQuest, `chapters/${chapUid}/${quest.uid}`, mc)
}

export function saveChapter(chapter: ChapterConfigUid, mc = './') {
  const cleanChapter = { ...chapter, uid: undefined, quests: undefined } as ChapterConfig
  return saveFile(cleanChapter, `chapters/${chapter.uid}/chapter`, mc)
}

export function saveReward(uid: string, obj: Reward, mc = './') {
  return saveFile(obj, `reward_tables/${uid}`, mc)
}

export function getItem(item: Item | string): Item {
  if (typeof item !== 'string') return item

  const [id, count, meta, ...rest] = item.split(' ')

  if (rest.length) throw new Error('Parsing problem - too much spaces')
  // if (meta !== undefined && _count && Number(_count) !== 1) throw new Error('Pseudo-Count not 1, something wrong')

  return {
    id,
    Damage: (meta && meta != '0') ? new Int(Number(meta)) : undefined, // eslint-disable-line eqeqeq
    Count : (count && count != '1') ? new Int(Number(count)) : undefined, // eslint-disable-line eqeqeq
  }
}

export function tagItemToCT(item: Item | string, count = 1): string {
  const it = getItem(item)

  return `<${it.id}${it.Damage ? `:${it.Damage}` : ''}>${
  !it.tag ? '' : `.withTag(sNBT('${stringify(it.tag)}'))`
}${
  // eslint-disable-next-line eqeqeq
  count ? (count != 1 ? ` * ${count}` : '') : (it.Count?.value || '')
}`
}

export function uidGenerator(maxLen = 80, ch = '…') {
  const takenUids = {} as Record<string, number>
  return function get(key: string): string {
    const uid = key.length <= maxLen ? key : `${key.substring(0, maxLen - ch.length - 2)}${ch}`
    if (takenUids[uid]) return get(`${uid}_${takenUids[uid]++}`)
    takenUids[uid] = 1
    return uid
  }
}

export function getChapters(): Chapter[] {
  const chapCwd = 'config/ftbquests/normal/chapters'
  const chaptersUids = getFile<any>('chapters/index').index as string[]
  const chapters = chaptersUids.map(uid => getChapter(uid)) as Chapter[]

  // Add quests to chapters
  chapters.forEach(ch =>
    ch.quests
      = fast_glob.sync(`${ch.uid}/*.snbt`, { cwd: chapCwd })
        .map(f => f.split(/[/\\]/)[1].replace(/\.snbt$/, ''))
        .filter(f => f !== 'chapter')
        .map(uid => getQuest(ch.uid, uid))
  )

  return chapters
}

/*
██╗      █████╗ ███╗   ██╗ ██████╗
██║     ██╔══██╗████╗  ██║██╔════╝
██║     ███████║██╔██╗ ██║██║  ███╗
██║     ██╔══██║██║╚██╗██║██║   ██║
███████╗██║  ██║██║ ╚████║╚██████╔╝
╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝
*/

export function isLangKeyInParenth(title?: string): boolean {
  return title !== undefined && title[0] === '{' && title[title.length - 1] === '}'
}

export function langKeyWithoutParenth(title: string): string {
  return isLangKeyInParenth(title) ? title.substring(1, title.length - 1) : title
}

let names: ReturnType<typeof getItemNames>

/**
 * Get localized name for an Item
 * Clean up all formatting codes `§`
 */
export function getItemName(i?: Item) {
  if (i === undefined) return undefined
  names ??= getItemNames()
  return (names[i.id]?.[String(i.Damage?.value ?? 0)] ?? names[i.id]?.[0])?.replace(/§./g, '')
}

/**
 * Get first item in tasks if any
 */
export function getQuestTaskItem(q: QuestUid) {
  const firstTask = (q?.tasks?.[0] as ItemQuestTask)?.items?.[0]
  if (!firstTask) return undefined
  const taskItem = getItem((firstTask as any)?.item ?? firstTask)
  if (taskItem) return taskItem
  throw new Error(`Cant define quest task item: ${firstTask}`)
}

/**
 * Generate task name based on its first task item
 * OR on the title of quest itself
 */
export function getTaskName(q: QuestUid) {
  return getItemName(getQuestTaskItem(q))
    ?? q?.tasks?.[0]?.title
    ?? (q?.tasks?.[0] as FluidQuestTask)?.fluid
    ?? (q.icon ? getItemName(getItem(q.icon)) : undefined)
}
