import {
  ApiErrorBodySchema,
  HealthResponseSchema,
  MatchResultSchema,
  SnapshotInfoResponseSchema,
  StartMatchRequestSchema,
} from '@mcarena/shared'
import type {
  ApiErrorBody,
  StartMatchRequest,
} from '@mcarena/shared'

/**
 * API 客户端：所有响应都经过 shared zod schema 校验后才交给 UI，
 * 校验失败视为数据契约破坏（对外部数据零信任）。
 */

export class ApiClientError extends Error {
  readonly body: ApiErrorBody

  constructor(body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiClientError'
    this.body = body
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function request<T>(
  path: string,
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }
  },
  init?: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch (error) {
    throw new ApiClientError({
      code: 'MCP_UNAVAILABLE',
      message: `无法连接 API 服务：${error instanceof Error ? error.message : String(error)}`,
    })
  }

  const text = await response.text()
  const payload: unknown = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    const parsed = ApiErrorBodySchema.safeParse(payload)
    throw new ApiClientError(
      parsed.success ? parsed.data : { code: 'INTERNAL', message: `HTTP ${response.status}` },
    )
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ApiClientError({
      code: 'VALIDATION_ERROR',
      message: `API 响应不符合数据契约：${result.error.issues.map((issue) => issue.message).join('; ')}`,
    })
  }
  return result.data
}

export const api = {
  health: () => request('/api/healthz', HealthResponseSchema),
  snapshotInfo: () => request('/api/snapshot', SnapshotInfoResponseSchema),
  startMatch: (body: StartMatchRequest = StartMatchRequestSchema.parse({})) =>
    request('/api/match', MatchResultSchema, { method: 'POST', body: JSON.stringify(body) }),
}
