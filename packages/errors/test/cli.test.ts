/* eslint-disable style/no-tabs */
import { execSync } from 'node:child_process'

import { expect, it } from 'vitest'

function exec(params: string): string {
  return execSync(
    `tsx src/cli.ts --log=test/debug.log ${params}`
  ).toString().trim()
}

it('run app no arguments', async () => {
  const appResult = exec('')

  expect(appResult).toMatchInlineSnapshot(`
    "Found 3 errors
    [main/ERROR] [FML]: Coremod EyeOfDragonsPlugin: Unable to class load the plugin de.curlybracket.eyeofdragons.EyeOfDragonsPlugin
    java.lang.ClassNotFoundException: de.curlybracket.eyeofdragons.EyeOfDragonsPlugin
    	at java.net.URLClassLoader.findClass(URLClassLoader.java:381) ~[?:1.8.0_51]
    	at net.minecraft.launchwrapper.LaunchClassLoader.findClass(LaunchClassLoader.java:117) ~[launchwrapper-1.12.jar:?]
    	at java.lang.ClassLoader.loadClass(ClassLoader.java:424) ~[?:1.8.0_51]
    	at java.lang.ClassLoader.loadClass(ClassLoader.java:357) ~[?:1.8.0_51]
    [Client thread/ERROR] [HadEnoughItems]: Failed to register mod categories: class lykrast.jetif.JETIFPlugin
    [Client thread/ERROR] [FML]: Unidentified mapping from registry minecraft:recipes"
  `)
})

it('run app with file output', async () => {
  expect(exec('--output=test/output.log'))
    .toMatchInlineSnapshot(`"Found 3 errors"`)
})
