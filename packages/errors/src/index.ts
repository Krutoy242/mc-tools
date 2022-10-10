export async function findErrors(debugLogText: string, ignore: RegExp[]): Promise<string[]> {
  // Remove all errors start when client load world
  const serverThreadStart = debugLogText.indexOf('[Server thread/')
  if (serverThreadStart !== -1)
    debugLogText = debugLogText.substring(0, serverThreadStart)

  const result: string[] = []

  const allErrors = [...debugLogText.matchAll(/^.*\W(error|WARN)\W.*$/gim)]

  for (const match of allErrors) {
    if (ignore.some(r => r.test(match[0]))) continue
    const line = match[0].replace(/^\[[\d:]+\] /, '') // Remove timestamp
    result.push(line)
  }

  return result
}

