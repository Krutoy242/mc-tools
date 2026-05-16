import type { ModsComparison } from '@mctools/curseforge'
import type * as vscode from 'vscode'
import * as path from 'pathe'
import { globMatch } from '../../util/helpers.js'
import { normalizeConfigName, normalizeJarName } from '../../util/normalize.js'

export interface ModChange {
  addonID       : number
  modName       : string
  normalizedName: string
  jarFileName   : string
  fileID        : { old?: number, new?: number }
  files         : vscode.Uri[]
  type          : 'added' | 'removed' | 'updated' | 'unchanged'
}

export interface DetectorConfig {
  ignoredMappingPatterns: string[]
}

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
}

function getAcronym(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w[0])
    .join('')
}

interface ModProfile {
  change    : ModChange
  normMod   : string
  normJar   : string
  jarAcronym: string
  modAcronym: string
  jarTokens : string[]
  modTokens : string[]
}

function buildProfiles(changes: ModChange[]): ModProfile[] {
  return changes.map((c) => {
    const normMod = normalizeConfigName(c.modName)
    const normJar = normalizeConfigName(c.jarFileName)
    return {
      change    : c,
      normMod,
      normJar,
      jarAcronym: getAcronym(c.jarFileName),
      modAcronym: getAcronym(c.modName),
      jarTokens : tokenize(c.jarFileName),
      modTokens : tokenize(c.modName),
    }
  })
}

function score(profile: ModProfile, fileName: string, dirName: string): number {
  const normFile = normalizeConfigName(fileName)
  const normDir = normalizeConfigName(dirName)

  for (const target of [normFile, normDir]) {
    if (!target) continue

    if (target === profile.normJar || target === profile.normMod) return 100
    if (profile.normJar.includes(target) || target.includes(profile.normJar)) return 90
    if (profile.normMod.includes(target) || target.includes(profile.normMod)) return 85

    if (profile.jarAcronym.length >= 2 && target.includes(profile.jarAcronym)) return 75
    if (profile.modAcronym.length >= 2 && target.includes(profile.modAcronym)) return 70

    const targetTokens = tokenize(target)
    let prefixHits = 0
    for (const tt of targetTokens) {
      for (const mt of [...profile.jarTokens, ...profile.modTokens]) {
        if (mt.startsWith(tt) || tt.startsWith(mt)) {
          prefixHits++
          break
        }
      }
    }
    if (prefixHits > 0 && prefixHits >= targetTokens.length * 0.6) return 65

    const allTokens = new Set([...profile.jarTokens, ...profile.modTokens])
    const shared = targetTokens.filter(tt =>
      profile.jarTokens.some(jt => jt.includes(tt) || tt.includes(jt))
      || profile.modTokens.some(mt => mt.includes(tt) || tt.includes(mt))
    )
    if (allTokens.size > 0 && shared.length / allTokens.size >= 0.5) return 55
  }

  return 0
}

const SCORE_THRESHOLD = 50

function findBestModMatch(fileName: string, dirName: string, profiles: ModProfile[]): ModChange | undefined {
  let best: ModProfile | undefined
  let bestScore = 0

  for (const profile of profiles) {
    const s = score(profile, fileName, dirName)
    if (s > bestScore) {
      bestScore = s
      best = profile
    }
  }

  return best && bestScore >= SCORE_THRESHOLD ? best.change : undefined
}

export function computeModChanges(
  diff: ModsComparison,
  changedFiles: vscode.Uri[],
  workspaceRoot: string,
  config: DetectorConfig
): ModChange[] {
  const changes: ModChange[] = []

  const push = (addon: { addonID: number, name: string, installedFile?: { fileNameOnDisk?: string, id?: number } | null }, type: ModChange['type'], fileID: { old?: number, new?: number }) => {
    const jar = addon.installedFile?.fileNameOnDisk ?? ''
    changes.push({
      addonID       : addon.addonID,
      modName       : addon.name,
      normalizedName: normalizeJarName(jar || addon.name),
      jarFileName   : jar,
      fileID,
      files         : [],
      type,
    })
  }

  for (const addon of diff.added ?? []) push(addon, 'added', { new: addon.installedFile?.id })
  for (const upd of diff.updated ?? []) push(upd.now, 'updated', { old: upd.was.installedFile?.id, new: upd.now.installedFile?.id })
  for (const rem of diff.removed ?? []) push(rem, 'removed', { old: rem.installedFile?.id })
  for (const addon of diff.both ?? []) push(addon, 'unchanged', { old: addon.installedFile?.id, new: addon.installedFile?.id })

  const profiles = buildProfiles(changes)

  for (const uri of changedFiles) {
    const rel = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/')

    if (config.ignoredMappingPatterns.some(p => globMatch(rel, p))) continue

    const fileName = path.basename(rel, path.extname(rel))
    const dirName = path.basename(path.dirname(rel))

    const matched = findBestModMatch(fileName, dirName, profiles)
    if (matched) {
      matched.files.push(uri)
    }
  }

  return changes.filter(c => c.type !== 'unchanged' || c.files.length > 0)
}
