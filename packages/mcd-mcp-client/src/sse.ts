/**
 * MCP Streamable HTTP 响应解析：
 * 服务端可能返回 `application/json`（单个 JSON 或数组）或 `text/event-stream`（SSE 帧）。
 */

/** 从 SSE 文本中提取全部 data: 载荷 */
export function parseSseFrames(text: string): string[] {
  const frames: string[] = []
  const lines = text.split(/\r?\n/)
  let dataLines: string[] = []

  const flush = (): void => {
    if (dataLines.length > 0) {
      frames.push(dataLines.join('\n'))
      dataLines = []
    }
  }

  for (const line of lines) {
    if (line === '') {
      flush()
      continue
    }
    if (line.startsWith(':')) {
      continue // 注释/心跳
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
    // event:/id:/retry: 字段对本场景无意义，忽略
  }
  flush()
  return frames
}

/** 判断内容类型是否为 SSE */
export function isEventStream(contentType: string | null): boolean {
  return typeof contentType === 'string' && contentType.includes('text/event-stream')
}

/**
 * 从 HTTP 响应体提取 JSON-RPC 消息数组。
 * - SSE：每个 data 帧应为完整 JSON-RPC 消息；
 * - JSON：单个消息或消息数组。
 */
export function extractJsonRpcMessages(raw: string, contentType: string | null): unknown[] {
  if (isEventStream(contentType)) {
    return parseSseFrames(raw)
      .map((frame) => frame.trim())
      .filter((frame) => frame.length > 0)
      .map((frame) => {
        try {
          return JSON.parse(frame) as unknown
        } catch {
          return null
        }
      })
      .filter((msg): msg is Record<string, unknown> => msg !== null && typeof msg === 'object')
  }
  const parsed: unknown = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : [parsed]
}
