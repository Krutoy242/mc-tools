/* eslint-disable ts/no-unsafe-return */
/* eslint-disable ts/no-unsafe-argument */
/* eslint-disable ts/no-unsafe-call */

import chalk from 'chalk'
import cliCursor from 'cli-cursor'
import inquirer from 'inquirer'
import CheckboxPlusPrompt from 'inquirer-checkbox-plus-prompt'
import Choices from 'inquirer/lib/objects/choices'
import observe from 'inquirer/lib/utils/events'
import { filter, map, takeUntil } from 'rxjs/operators'

interface CheckboxPlusPromptOptions {
  highlight?: boolean
  onToggle? : (choice: any, isEnable: boolean | undefined) => Promise<string | void> | string | void
}

class CheckboxPlusPromptEx extends CheckboxPlusPrompt {
  async executeSource() {
    const self = this as any
    let sourcePromise: Promise<any>

    // Remove spaces
    self.rl.line = self.rl.line.trim()

    // Same last search query that already loaded
    if (self.rl.line === self.lastQuery) {
      return
    }

    // If the search is enabled
    if (self.opt.searchable) {
      sourcePromise = self.opt.source(self.answers, self.rl.line)
    }
    else {
      sourcePromise = self.opt.source(self.answers, null)
    }

    self.lastQuery = self.rl.line
    self.lastSourcePromise = sourcePromise
    self.searching = true

    void sourcePromise.then((choices: any) => {
      // Is not the last issued promise
      if (self.lastSourcePromise !== sourcePromise) {
        return
      }

      // Reset the searching status
      self.searching = false

      // Save the new choices
      self.choices = new Choices(choices, self.answers)

      // Foreach choice
      self.choices.forEach((choice: any, i: number) => {
        const originalChoice = choices[i]
        if (!originalChoice) return

        const descriptor = Object.getOwnPropertyDescriptor(originalChoice, 'name')

        // force-rewrite name if its a getter or a function that should act like a getter
        if (descriptor && typeof descriptor.get === 'function') {
          Object.defineProperty(choice, 'name', {
            get         : descriptor.get.bind(originalChoice),
            configurable: true,
            enumerable  : true,
          })
        }
        else if (typeof originalChoice.name === 'function') {
          Object.defineProperty(choice, 'name', {
            get         : originalChoice.name.bind(originalChoice),
            configurable: true,
            enumerable  : true,
          })
        }

        // Is the current choice included in the current checked choices
        if (self.value.includes(choice.value)) {
          self.toggleChoice(choice, true, true)
        }
        else {
          self.toggleChoice(choice, false, true)
        }

        // The default is not applied yet
        if (self.default) {
          // Is the current choice included in the default values
          if (self.default.includes(choice.value)) {
            self.toggleChoice(choice, true, true)
          }
        }
      })

      // Reset the pointer to select the first choice
      self.pointer = 0
      self.render()
      self.default = null
      self.firstSourceLoading = false
    })

    return sourcePromise
  }

  _run(callback: (value: any) => void) {
    (this as any).done = callback

    void this.executeSource().then(() => {
      const events = observe((this as any).rl)

      const validation = (this as any).handleSubmitEvents(
        events.line.pipe(map((this as any).getCurrentValue.bind(this)))
      )
      validation.success.forEach((this as any).onEnd.bind(this))
      validation.error.forEach((this as any).onError.bind(this))

      void events.normalizedUpKey
        .pipe(takeUntil(validation.success))
        .forEach((this as any).onUpKey.bind(this))
      void events.normalizedDownKey
        .pipe(takeUntil(validation.success))
        .forEach((this as any).onDownKey.bind(this))
      void events.keypress
        .pipe(
          takeUntil(validation.success),
          filter((e: any) => {
            const { key } = e
            if (key.name === 'space')
              return false

            const isCtrlA = key.name === 'a' && key.ctrl && !key.shift && !key.meta
            const isCtrlR = key.name === 'r' && key.ctrl && !key.shift && !key.meta
            if (isCtrlA || isCtrlR)
              return false

            return true
          })
        )
        .forEach((this as any).onKeypress.bind(this))
      void events.spaceKey
        .pipe(takeUntil(validation.success))
        .forEach(this.onSpaceKey.bind(this) as any)

      const ctrlAKey = events.keypress.pipe(filter((e: any) => e.key.name === 'a' && e.key.ctrl && !e.key.shift && !e.key.meta))
      const ctrlRKey = events.keypress.pipe(filter((e: any) => e.key.name === 'r' && e.key.ctrl && !e.key.shift && !e.key.meta))

      void ctrlAKey.pipe(takeUntil(validation.success)).forEach(this.onEnableAllKey.bind(this) as any)
      void ctrlRKey.pipe(takeUntil(validation.success)).forEach(this.onResetKey.bind(this) as any)

      // If the search is not enabled (the original had a bug here)
      if (!((this as any).opt as { searchable?: boolean }).searchable) {
        void events.numberKey.pipe(takeUntil(validation.success)).forEach((this as any).onNumberKey.bind(this))

        const aKey = events.keypress.pipe(filter((e: any) => e.key.name === 'a' && !e.key.ctrl && !e.key.shift && !e.key.meta))
        void aKey.pipe(takeUntil(validation.success)).forEach((this as any).onAllKey.bind(this))

        void events.iKey.pipe(takeUntil(validation.success)).forEach((this as any).onInverseKey.bind(this))
      }

      if ((this as any).rl.line)
        (this as any).onKeypress()

      cliCursor.hide()
      ;(this as any).render()
    })

    return this
  }

  render(error: any) {
    if ((this as any).status === 'answered') {
      const total = (this as any).choices.realLength
      const selected = (this as any).checkedChoices.length
      const message = `${(this as any).getQuestion()} ${chalk.green(selected)} from ${chalk.gray(total)} selected`
      return (this as any).screen.render(message, '')
    }

    return super.render(error)
  }

  /**
   * A callback function for the event:
   * When the user press `Space` key
   */
  async onSpaceKey() {
    const choice = (this as any).choices.getChoice((this as any).pointer)
    // When called no results
    if (!choice) {
      return
    }

    const rl = (this as any).rl

    // Manually remove the space character from the readline buffer and move the cursor back.
    // This is necessary because the keypress event doesn't provide a way to prevent the default action.
    rl.line = rl.line.slice(0, rl.cursor - 1) + rl.line.slice(rl.cursor)
    rl.cursor--

    await this.toggleChoice(choice)
    ;(this as any).render()
  }

  /**
   * A callback function for the event:
   * When the user press `CTRL+A` key
   */
  async onEnableAllKey() {
    for (const choice of (this as any).choices.choices) {
      if (choice.type !== 'separator' && !choice.disabled) {
        await this.toggleChoice(choice, true)
      }
    }
    (this as any).render()
  }

  /**
   * A callback function for the event:
   * When the user press `CTRL+R` key
   */
  async onResetKey() {
    for (const choice of (this as any).choices.choices) {
      if (choice.type !== 'separator' && !choice.disabled) {
        await this.toggleChoice(choice, false)
      }
    }
    (this as any).render()
  }

  /**
   * Toggle (check/uncheck) a specific choice
   *
   * @param {object}  choice
   * @param {boolean} checked if not specified the status will be toggled
   */
  async toggleChoice(choice: any, checked?: boolean, silent = false) {
    const opt = (this as any).opt as CheckboxPlusPromptOptions

    // Call onToggle if it exists
    if (!silent && opt.onToggle) {
      const success = await opt.onToggle(choice, checked)
      if (!success) return
    }

    super.toggleChoice(choice, checked)
  }

  getCheckboxFigure(checked: boolean) {
    return checked ? chalk.green('●') : chalk.gray('○')
  }

  renderChoices(choices: { forEach: (cb: (choice: any, index: number) => void) => void }, pointer: number): string {
    let output = ''
    let separatorOffset = 0

    choices.forEach((choice, index) => {
      if (choice.type === 'separator') {
        separatorOffset++
        output += ` ${choice.toString()}\n`
        return
      }

      const choiceDetails = choice

      if (choiceDetails.disabled) {
        separatorOffset++
        output += `   ${choiceDetails.name}`
        output += '\n'
        return
      }

      if (index - separatorOffset === pointer) {
        output += chalk.cyan('❯')
        output += ((this as any).opt as { highlight?: boolean }).highlight
          ? chalk.bold(choiceDetails.name)
          : choiceDetails.name
      }
      else {
        output += ` ${choiceDetails.name}`
      }

      output += '\n'
    })

    return output.replace(/\n$/, '')
  }
}

inquirer.registerPrompt('checkbox-plus', CheckboxPlusPromptEx as any)
