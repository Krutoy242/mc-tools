const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function getTimestamp() {
  const d = new Date()
  const pad = n => n.toString().padStart(2, '0')
  // Date format: YY-MM-DD-HH-mm-SS
  return `${d.getFullYear().toString().slice(-2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

const configDir = path.join(process.cwd(), 'config', 'cofh', 'world')
const logFile = path.join(process.cwd(), 'logs', 'debug.log')

if (!fs.existsSync(logFile)) {
  console.error(`Error: logs/debug.log not found.`)
  process.exit(1)
}

if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true })
}

const timestamp = getTimestamp()
const newLogName = `~cofh-worldgen-${timestamp}.log`
const newLogPath = path.join(configDir, newLogName)

try {
  // Command from user: grep -oP '\[CoFH World\]: \K.*' logs/debug.log
  // We'll run it and redirect output to newLogPath.
  // Using Git Bash grep since it's available.
  const command = `grep -oP '\\[CoFH World\\]: \\K.*' "${logFile}" > "${newLogPath}"`
  execSync(command, { shell: 'powershell.exe' })

  // Find previous result
  const files = fs.readdirSync(configDir)
    .filter(f => f.startsWith('~cofh-worldgen-') && f.endsWith('.log') && f !== newLogName)
    .sort((a, b) => {
      // Sort by file stats mtime
      return fs.statSync(path.join(configDir, b)).mtimeMs - fs.statSync(path.join(configDir, a)).mtimeMs
    })

  if (files.length > 0) {
    const prevLogName = files[0]
    const prevLogPath = path.join(configDir, prevLogName)

    console.log(`Comparing with previous log: ${prevLogName}`)

    try {
      // Simple diff
      execSync(`diff "${prevLogPath}" "${newLogPath}"`, { stdio: 'inherit', shell: 'powershell.exe' })
      console.log('No differences found.')
    }
    catch (e) {
      // diff returns exit code 1 if there are differences.
      // Output is already printed by stdio: inherit.
      if (e.status !== 1) {
        console.error(`Diff error: ${e.message}`)
      }
    }
  }
  else {
    console.log('No previous logs found for comparison.')
  }

  console.log(`New integrity log saved to: ${newLogPath}`)
}
catch (error) {
  console.error(`An error occurred: ${error.message}`)
  process.exit(1)
}
