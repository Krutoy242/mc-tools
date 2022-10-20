import chalk from 'chalk'
import cliTruncate from 'cli-truncate'
import stringWidth from 'string-width'
import { execute } from './execute'

const filter = (s: string) => s
  .replace(/^Debugger listening on ws:.+\n?/gm, '')
  .replace(/^For help, see: https:\/\/nodejs\.org\/en\/docs\/inspector\n?/gm, '')
  .replace(/^Debugger attached.\n?/gm, '')
  .replace(/^Waiting for the debugger to disconnect...\n?/gm, '')

export class Task {
  private stdOut = ''
  private stdErr = ''
  public dirty = false
  private finished = false

  constructor(
    public name: string,
    public command: string
  ) {
  }

  private get nameStyle() {
    return chalk.green
  }

  public execute() {
    const p = execute(this.command,
      (chunk) => { this.dirty = true; this.stdOut += chunk },
      // this.logger(''),
      // this.logger(chalk.red('X'))
      (chunk) => { this.dirty = true; this.stdErr += chunk }
    )
    p.then(() => {
      this.finished = true
      this.dirty = true
    })
    return p
  }

  // private logger(prefix: string) {
  //   return (o: unknown) => {
  //     const s = String(o)
  //     if (/\n\s*$/.test(this.stdOut))
  //       this.stdOut = `${prefix} ${s}`
  //     else this.stdOut += s
  //     this.dirty = true
  //   }
  // }

  public flush(maxNameLen: number, maxBodyWidth: number) {
    const err = this.getError(true)
    const textToFlush = (this.finished && err)
      ? err
      : (this.stdOut.trim().split(/\s*\n\s*/gm).pop() as string).trim()

    const label = this.nameStyle(`${this.name.padStart(maxNameLen)}: `)
    const maxMsgWidth = maxBodyWidth - stringWidth(label)
    const msg = cliTruncate(textToFlush, maxMsgWidth)
    this.dirty = false
    return label + msg
  }

  private getError(joined = false) {
    const x = chalk.bold.red('X ')
    const err = filter(this.stdErr.trim()).trim()
    if (!err) return ''
    if (!joined) {
      return err
    }
    else {
      return x + err
        .split(/\s*\n\s*/gm)
        .map((l, i) => i === 0
          ? l
          : chalk.rgb((128 / i) | 0, (128 / i) | 0, (128 / i) | 0)(l)
        )
        .join(chalk.hex('#221')('⫽'))
    }
  }

  public flushErrors(): string {
    const err = this.getError()
    if (!err) return ''
    const field = ('━').repeat((process.stdout.columns ?? 80 - this.name.length - 2) / 2)
    const head = chalk.gray(`${field} ${this.nameStyle(this.name)} ${field}`)
    return `${head}
${err}
`
  }
}
