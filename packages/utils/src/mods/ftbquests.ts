import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import fast_glob from 'fast-glob'
import type { Byte, TagMap } from 'ftbq-nbt'
import { Int, parse, stringify } from 'ftbq-nbt'

export interface Item {
  id: string
  Damage?: Int
  Count?: Int
  tag?: TagMap
}

export interface RewardItem {
  item: string | Item
  weight?: Int
  count?: Int
}

export interface Reward {
  title: string
  loot_size: number
  rewards: RewardItem[]
  loot_crate?: {
    string_id: string
    item_name: string
    color: Int
    drops: {
      passive: Int
      monster: Int
      boss: Int
    }
  }
}

export interface ChapterConfig {
  title: string
  icon: string
  description: string[]
  always_invisible: boolean
  group: number
  default_quest_shape: string
}

export type ChapterConfigUid = ChapterConfig & { uid: string }

export interface QuestReward {
  uid: string
  type: string
  item: string | Item
  auto?: string
  command?: string
}

export interface QuestTask {
  uid: string
  type: string
  items: (Item | { item: string })[]
  ignore_nbt?: Byte
  title?: string
}

export interface Quest {
  title?: string
  icon?: string | Item
  x: number
  y: number
  text?: string[]
  dependencies: string[]
  tasks: QuestTask[]
  rewards: QuestReward[]
}

export type QuestUid = Quest & { uid: string }

export type Chapter = ChapterConfigUid & { quests: QuestUid[] }

export function parseFtbqSNbt(sNbt: string) {
  return parse(sNbt
    .replace(/(\[[BILbil];([\s\n]*\d+(\.\d+)?[BILbil]\b,?)+[\s\n]*\])/gm, (m, r) => {
      return r.replace(/(\d+)[BILbil]\b/gm, '$1')
    }) // Remove list types
  , { useBoolean: true })
}

export function stringifyFTBQSNbt(tag: Object) {
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
  const text = readFileSync(resolve(mc,
    `config/ftbquests/normal/${subPath}.snbt`),
  'utf8')
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

function saveFile(obj: Object, filePath: string, mc = './') {
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
    Damage: meta && meta != '0' ? new Int(Number(meta)) : undefined, // eslint-disable-line eqeqeq
    Count : count && count != '1' ? new Int(Number(count)) : undefined, // eslint-disable-line eqeqeq
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

export function getChapters() {
  const chapCwd = 'config/ftbquests/normal/chapters'
  const chapters = fast_glob.sync('*', { onlyFiles: false, cwd: chapCwd })
    .filter(f => f !== 'index.snbt')
    .map(dir => getChapter(dir.replace('.snbt', ''))) as Chapter[]

  return chapters.map((ch) => {
    ch.quests
      = fast_glob.sync(`${ch.uid}/*.snbt`, { cwd: chapCwd })
        .map(f => f.split(/[\/\\]/)[1].replace(/\.snbt$/, ''))
        .filter(f => f !== 'chapter')
        .map(uid => getQuest(ch.uid, uid))
    return ch
  })
}

/*
██╗      █████╗ ███╗   ██╗ ██████╗
██║     ██╔══██╗████╗  ██║██╔════╝
██║     ███████║██╔██╗ ██║██║  ███╗
██║     ██╔══██║██║╚██╗██║██║   ██║
███████╗██║  ██║██║ ╚████║╚██████╔╝
╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝
*/

export function isLangKey(title?: string): boolean {
  return title !== undefined && title[0] === '{' && title[title.length - 1] === '}'
}

export function getLangKey(title: string): string {
  return isLangKey(title) ? title.substring(1, title.length - 1) : title
}
