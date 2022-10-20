import type { ExecaReturnValue } from 'execa'
import { execaCommand } from 'execa'

export type ProcessCallback = (s: unknown) => void

export function execute(command: string, onOut: ProcessCallback, onErr: ProcessCallback) {
  return new Promise<ExecaReturnValue<string>>((resolve) => {
    const process = execaCommand(command)

    process.stdout?.on('data', onOut)
    process.stderr?.on('data', onErr)
    process.on('close', resolve)
    // process.on('exit', resolve)
    // process.then(res => resolve(res))
    // process.catch((err) => {
    //   onErr(err.stderr.replace(/^[\s\S\n]+?\n\s*Error: /m, 'Error: '))
    // })
  })
}
