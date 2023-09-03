import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import consola from 'consola'

import type { Arguments, Argv, CamelCaseKey, /* InferredOptionType,  */Options } from 'yargs'
import yargs from 'yargs'

type DemandedOption = Options & {
  errorMessage: string | ((value?: string) => string | undefined)
}

export function assertPath(f: string, errorText?: string) {
  if (existsSync(f)) return f
  throw new Error(`${resolve(f)} ${errorText ?? 'doesnt exist. Provide correct path.'}`)
}

// type AddOption<T> = <K extends string, O extends DemandedOption>(key: K, options: O) => ExtendedYargs<T & { [key in K]: InferredOptionType<O> }>

interface ExtendedCommands<T> {
  /** Add option, but check if file exist */
  demandFile<K extends string>(key: K, options: DemandedOption): ExtendedArgv<T & { [key in K]: string }>

  /** Check if file exist only if option provided */
  optionalFile<K extends string>(key: K, options: DemandedOption): ExtendedArgv<T & { [key in K]: string }>

  /** Check if we can create file and write in it */
  demandWrite<K extends string>(key: K, options: DemandedOption): ExtendedArgv<T & { [key in K]: string }>

  /** Same as `yargs.parseSync()` but check demanded files and exit if not fulfill */
  parseWithChecks(): { [key in keyof Arguments<T> as key | CamelCaseKey<key>]: Arguments<T>[key] }
}
/**
 * Obtain the parameters of a function type in a tuple
 */
type Parameters<T extends (...args: any[]) => any> = T extends (...args: infer P) => any ? P : never

type GetArgvT<C extends Argv<any>> = C extends Argv<infer T> ? T : never

type ExtendedArgv<T = {}> = {
  [K in keyof Argv<T>]: Argv<T>[K] extends (...args: any) => Argv<T>
    // @ts-expect-error hard type
    ? (...args: Parameters<Argv<T>[K]>) => ExtendedArgv<GetArgvT<ReturnType<Argv<T>[K]>>>
    : Argv<T>[K]
} & ExtendedCommands<T>

// type ExtendedArgv<T={}> = {
//   [K in keyof Argv<T>]: ExtendedArgv<T>[K]
// } & ExtendedCommands<T>

type CheckFnc = (value: string | number | undefined) => boolean

export function getArgs(): ExtendedArgv {
  const yarg = yargs(process.argv.slice(2))
    .alias('h', 'help') as unknown as ExtendedArgv

  const checks: {
    key: string
    errorMessage?: DemandedOption['errorMessage']
    check: CheckFnc
  }[] = []

  function addCheck(key: string, options: DemandedOption, checkFnc: CheckFnc): any {
    checks.push({
      key,
      errorMessage: options.errorMessage,
      check       : checkFnc,
    })

    // Remove all added fields
    delete (options as any).errorMessage

    return yarg.option({
      [key]: {
        ...options,
        demandOption: options.demandOption ?? true,
      },
    })
  }

  yarg.demandFile = (k, o) => addCheck(k, { ...o, type: 'string' }, v => existsSync(String(v)))
  yarg.optionalFile = (k, o) => addCheck(k, { ...o, type: 'string' }, v => !!v && existsSync(String(v)))

  yarg.parseWithChecks = () => {
    const args = yarg.parseSync()
    for (const check of checks) {
      const value: any = args[check.key]
      if (check.check(value)) continue

      const errorMsg = typeof check.errorMessage === 'function'
        ? check.errorMessage(value)
        : check.errorMessage

      consola.error(new Error(errorMsg))
      process.exit(1)
    }
    return args
  }

  return yarg
}
