import { execSync } from 'node:child_process'
import { watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const srcDir = join(rootDir, 'src')

let timer
let building = false

function build() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (building) {
      build()
      return
    }
    building = true
    const now = new Date().toLocaleTimeString()
    console.log(`[${now}] [watch] Rebuilding extension...`)
    try {
      execSync('pnpm run build', { cwd: rootDir, stdio: 'inherit' })
      console.log(`[${now}] [watch] Build succeeded`)
    }
    catch {
      console.error(`[${now}] [watch] Build failed`)
    }
    finally {
      building = false
    }
  }, 300)
}

console.log('[watch] Watching', srcDir)
watch(srcDir, { recursive: true }, (eventType, filename) => {
  if (filename && filename.includes('node_modules')) return
  build()
})

// Initial build
build()
