type Level = 'info' | 'warn' | 'error' | 'debug'

const COLORS: Record<Level, string> = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
}
const RESET = '\x1b[0m'

export const log = (level: Level, msg: string, data?: Record<string, unknown>) => {
  const ts = new Date().toISOString().slice(11, 23)
  const head = `${COLORS[level]}${ts} ${level.toUpperCase()}${RESET}`
  if (data) console.log(`${head} ${msg}`, data)
  else console.log(`${head} ${msg}`)
}
