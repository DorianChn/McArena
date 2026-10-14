import { z } from 'zod'
import { ConfigError, DataModeSchema } from '@mcarena/shared'

/**
 * API 配置：全部经由环境变量读取并用 zod 校验。
 * 任何敏感值（MCD_MCP_TOKEN）不会进入日志；缺失关键配置时抛出带中文指引的 ConfigError。
 */

const booleanFromEnv = z
  .string()
  .default('false')
  .transform((value) => value === 'true' || value === '1')

export const ApiConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  host: z.string().min(1).default('127.0.0.1'),
  port: z.coerce.number().int().positive().default(8787),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  corsOrigin: z.string().default('*'),
  dataMode: DataModeSchema.default('mock'),
  mcp: z.object({
    url: z.string().url().default('https://mcp.mcd.cn'),
    token: z.string().optional(),
    maxRequestsPerMinute: z.coerce.number().int().positive().default(300),
    timeoutMs: z.coerce.number().int().positive().default(15_000),
    allowWrite: booleanFromEnv,
  }),
})
export type ApiConfig = z.infer<typeof ApiConfigSchema>

export function loadConfig(env: Record<string, string | undefined> = process.env): ApiConfig {
  const parsed = ApiConfigSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    host: env.API_HOST,
    port: env.API_PORT,
    logLevel: env.LOG_LEVEL,
    corsOrigin: env.CORS_ORIGIN,
    dataMode: env.MCD_MCP_MODE,
    mcp: {
      url: env.MCD_MCP_URL,
      token: env.MCD_MCP_TOKEN,
      maxRequestsPerMinute: env.MCD_MCP_MAX_RPM,
      timeoutMs: env.MCD_MCP_TIMEOUT_MS,
      allowWrite: env.MCD_ALLOW_WRITE_TOOLS,
    },
  })
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new ConfigError(`配置校验失败：${issues.join('; ')}`, { issues: parsed.error.issues })
  }
  return parsed.data
}
