import type { DescriptionService } from '../../descriptionService.js'
import type { JarMetaLoader } from '../../jarMeta.js'
import type { Mod } from '../../Mod.js'
import React from 'react'
import { Mod as ModClass } from '../../Mod.js'
import { ModSelector } from '../components/ModSelector.js'

interface ManualProps {
  mods         : Mod[]
  loader?      : JarMetaLoader
  descriptions?: DescriptionService
  maxSize?     : number
  onDone       : () => void
}

export function Manual({ mods, loader, descriptions, maxSize, onDone }: ManualProps) {
  return (
    <ModSelector
      mods={mods}
      loader={loader}
      descriptions={descriptions}
      maxSize={maxSize}
      title="◆ Manual Toggle"
      initialSelected={mods.filter(m => m.enabled)}
      onToggle={async (mod, nextSel) => {
        // Treat "selected" as "should be enabled".
        if (nextSel === mod.enabled) return { ok: true }
        const r = nextSel
          ? await ModClass.enable([mod])
          : await ModClass.disable([mod])
        if (r.ok > 0 && r.failed.length === 0) return { ok: true }
        return { ok: false, error: r.failed[0]?.error ?? 'rename failed' }
      }}
      onComplete={onDone}
      onCancel={onDone}
    />
  )
}
