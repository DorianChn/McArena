/**
 * 轻量结构化日志器（前后端共用，零依赖）。
 * - 输出单行 JSON，便于聚合与审计；
 * - 内置敏感字段脱敏：任何形如 token/authorization/secret/password 的键一律替换为 [REDACTED]；
 * - 浏览器环境安全（无 process 时静默）。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const SENSITIVE_KEY_RE = /token|authorization|secret|password|passwd|cookie|credential|api[-_]?key|bearer/i
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi

export type LogContext = Record<string, unknown>

export interface LogRecord {
  time: string
  level: LogLevel
  msg: string
  ctx?: LogContext
}

export interface Logger {
  debug(msg: string, ctx?: LogContext): void
  info(msg: string, ctx?: LogContext): void
  warn(msg: string, ctx?: LogContext): void
  error(msg: string, ctx?: LogContext): void
  child(ctx: LogContext): Logger
  readonly level: LogLevel
}

/** 深拷贝并脱敏（敏感键 → '[REDACTED]'，Bearer 串 → 'Bearer [REDACTED]'） */
export function redactSensitive<T>(value: T): T {
  return redactValue(value) as T
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(BEARER_RE, 'Bearer [REDACTED]')
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : redactValue(item)
    }
    return out
  }
  return value
}

function defaultSink(line: string): void {
  if (typeof process !== 'undefined' && typeof process.stdout?.write === 'function') {
    process.stdout.write(`${line}\n`)
  }
}

export interface CreateLoggerOptions {
  level?: LogLevel
  base?: LogContext
  sink?: (line: string) => void
  now?: () => Date
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? 'info'
  const sink = options.sink ?? defaultSink
  const now = options.now ?? (() => new Date())
  const base = options.base ?? {}

  function write(logLevel: LogLevel, msg: string, ctx?: LogContext): void {
    if (LOG_LEVELS[logLevel] < LOG_LEVELS[level]) {
      return
    }
    const record: LogRecord = {
      time: now().toISOString(),
      level: logLevel,
      msg,
      ...(ctx || Object.keys(base).length > 0 ? { ctx: redactSensitive({ ...base, ...ctx }) } : {}),
    }
    sink(JSON.stringify(record))
  }

  const logger: Logger = {
    level,
    debug: (msg, ctx) => write('debug', msg, ctx),
    info: (msg, ctx) => write('info', msg, ctx),
    warn: (msg, ctx) => write('warn', msg, ctx),
    error: (msg, ctx) => write('error', msg, ctx),
    child: (ctx) => createLogger({ level, sink, now, base: { ...base, ...ctx } }),
  }
  return logger
}

/** 静默日志器（测试用） */
export function createSilentLogger(): Logger {
  return createLogger({ level: 'error', sink: () => {} })
}
