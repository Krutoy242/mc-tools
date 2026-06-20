import assert from 'node:assert'
import process from 'node:process'
import { resolve } from 'pathe'
import { $ } from 'zx'

const SCRIPT_PATH = resolve('src/cli.ts')

interface ProcessError {
  stdout : string
  stderr : string
  message: string
}

async function run(args: string[], ...expects: (string | RegExp)[]) {
  let output: string
  try {
    const p = $`npx tsx ${SCRIPT_PATH} ${args}`
    void p.stdio('pipe', 'pipe', 'pipe')
    const { stdout, stderr } = await p
    output = `${stdout}\n${stderr}`
  }
  catch (err) {
    const e = err as ProcessError
    output = `${e.stdout}\n${e.stderr}`
  }

  for (const expect of expects) {
    if (typeof expect === 'string')
      assert(output.includes(expect), `Expected output to include: ${expect}\n--- actual ---\n${output}`)
    else
      assert(expect.test(output), `Expected output to match: ${expect}\n--- actual ---\n${output}`)
  }
}

const tests: [string, () => Promise<void>][] = [
  ['ct class by short name', async () => {
    await run(['IBlockState'], 'zenClass IBlockState extends IBlockProperties', 'ct-dump:')
  }],
  ['native class by short name', async () => {
    await run(['EntityPlayer'], 'native:', 'zenClass EntityPlayer')
  }],
  ['ct class by dotted path', async () => {
    await run(['crafttweaker.item.IItemStack'], '=== ct-dump: crafttweaker/item/IItemStack.dzs ===')
  }],
  ['native class by slashed path', async () => {
    await run(['net/minecraft/entity/player/EntityPlayer'], '=== native: net/minecraft/entity/player/EntityPlayer.dzs ===')
  }],
  ['member signature with expanded types', async () => {
    await run(['crafttweaker.item.IItemStack.withTag'], /tag as crafttweaker\.data\.IData/)
  }],
  ['native member field', async () => {
    await run(['EntityPlayer.gameProfile'], /val gameProfile as native\.com\.mojang\.authlib\.GameProfile/)
  }],
  ['member not found', async () => {
    await run(['IItemStack.nonExistentMethod'], /Member "nonExistentMethod" not found/)
  }],
  ['typo yields suggestions', async () => {
    await run(['IItamStack'], /"IItamStack" not found/, /Did you mean/, /IItemStack/)
  }],
  ['multiple queries in one call', async () => {
    await run(['IBlockState', 'IItamStack'], 'zenClass IBlockState', /Did you mean/, /IItemStack/)
  }],
  ['expansions auto-filtered', async () => {
    await run(['IItemStack'], '=== ct-dump: crafttweaker/item/IItemStack.dzs ===')
  }],
]

async function main() {
  console.warn('Running tests\u2026')
  for (const [name, fn] of tests) {
    process.stdout.write(`  \u2022 ${name} \u2026 `)
    await fn()
    console.warn('ok')
  }
  console.warn('\nAll tests passed!')
}

main().catch((err) => {
  console.warn('FAILED')
  console.error(err)
  process.exit(1)
})
