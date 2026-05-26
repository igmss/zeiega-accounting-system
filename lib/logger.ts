type LogLevel = "debug" | "info" | "warn" | "error"

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = { level, message, timestamp: new Date().toISOString() }
  if (context && Object.keys(context).length > 0) {
    entry.context = context
  }
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log
  if (process.env.NODE_ENV === "development") {
    fn(`[${level.toUpperCase()}] ${message}`, context ?? "")
  } else {
    fn(JSON.stringify(entry))
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
}
