import { z } from 'zod'

/** 全项目统一错误码（前后端共用，属于对外 API 契约） */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'AUTH_ERROR',
  'RATE_LIMIT',
  'MCP_UNAVAILABLE',
  'MCP_PROTOCOL',
  'CONFIG_ERROR',
  'NOT_IMPLEMENTED',
  'NOT_FOUND',
  'TIMEOUT',
  'CANCELLED',
  'INTERNAL',
] as const

export const ErrorCodeSchema = z.enum(ERROR_CODES)
export type ErrorCode = z.infer<typeof ErrorCodeSchema>

export const ApiErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
})
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>

const DEFAULT_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTH_ERROR: 401,
  RATE_LIMIT: 429,
  MCP_UNAVAILABLE: 503,
  MCP_PROTOCOL: 502,
  CONFIG_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  NOT_FOUND: 404,
  TIMEOUT: 504,
  CANCELLED: 409,
  INTERNAL: 500,
}

export interface McArenaErrorOptions {
  httpStatus?: number
  cause?: unknown
  details?: unknown
}

/** 项目内所有预期错误的基类；HTTP 层据此映射状态码 */
export class McArenaError extends Error {
  readonly code: ErrorCode
  readonly httpStatus: number
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, options: McArenaErrorOptions = {}) {
    super(message)
    this.name = 'McArenaError'
    this.code = code
    this.details = options.details
    this.httpStatus = options.httpStatus ?? DEFAULT_HTTP_STATUS[code]
    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }

  toJSON(): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message }
    if (this.details !== undefined) {
      body.details = this.details
    }
    return body
  }
}

export function isMcArenaError(error: unknown): error is McArenaError {
  return error instanceof McArenaError
}

export class ValidationError extends McArenaError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, { details })
    this.name = 'ValidationError'
  }
}

export class AuthError extends McArenaError {
  constructor(message = '麦当劳 MCP Token 无效、已过期或未提供（401）', details?: unknown) {
    super('AUTH_ERROR', message, { details })
    this.name = 'AuthError'
  }
}

export class RateLimitError extends McArenaError {
  readonly retryAfterMs?: number

  constructor(message = '触发限流（429）', options: { retryAfterMs?: number; details?: unknown } = {}) {
    super('RATE_LIMIT', message, { details: options.details })
    this.name = 'RateLimitError'
    this.retryAfterMs = options.retryAfterMs
  }
}

export class McpUnavailableError extends McArenaError {
  constructor(message = '麦当劳 MCP Server 暂不可用', options: McArenaErrorOptions = {}) {
    super('MCP_UNAVAILABLE', message, options)
    this.name = 'McpUnavailableError'
  }
}

export class McpProtocolError extends McArenaError {
  constructor(message = 'MCP 协议错误：响应不符合 JSON-RPC 规范', options: McArenaErrorOptions = {}) {
    super('MCP_PROTOCOL', message, options)
    this.name = 'McpProtocolError'
  }
}

export class ConfigError extends McArenaError {
  constructor(message: string, details?: unknown) {
    super('CONFIG_ERROR', message, { details })
    this.name = 'ConfigError'
  }
}

export class NotImplementedError extends McArenaError {
  constructor(message: string, details?: unknown) {
    super('NOT_IMPLEMENTED', message, { details })
    this.name = 'NotImplementedError'
  }
}

export class NotFoundError extends McArenaError {
  constructor(message = '资源不存在', details?: unknown) {
    super('NOT_FOUND', message, { details })
    this.name = 'NotFoundError'
  }
}

export class InternalError extends McArenaError {
  constructor(message = '服务内部错误', options: McArenaErrorOptions = {}) {
    super('INTERNAL', message, options)
    this.name = 'InternalError'
  }
}
