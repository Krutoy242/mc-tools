import * as vscode from 'vscode'

/**
 * Sets a `mc-tools:*` context key.
 *
 * These drive the `when` clauses in package.json — the Mod Changes view stays
 * hidden until a provider is actually registered for it, and the command
 * palette only lists MC Tools commands inside a modpack workspace.
 */
export async function setContext(key: string, value: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', `mc-tools:${key}`, value)
}
