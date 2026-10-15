import { pathToFileURL } from 'node:url'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import {
  HealthResponseSchema,
  MatchResultSchema,
  SnapshotInfoResponseSchema,
  StartMatchRequestSchema,
  createLogger,
  isMcArenaError,
} from '@mcarena/shared'
import type { Logger } from '@mcarena/shared'
import { MatchService, MatchStore, createMatchOrchestrator } from './services/match-service.js'
import { loadConfig } from './config.js'
import type { ApiConfig } from './config.js'
import { createDataSource } from './services/data-source.js'
import type { ArenaDataSource } from './services/data-source.js'

export const SERVICE_NAME = 'mcarena-api'
export const SERVICE_VERSION = '0.1.0'

export interface BuildAppOptions {
  config: ApiConfig
  logger?: Logger
  dataSource: ArenaDataSource
  matchService: MatchService
}

/** 构建 Fastify 应用（不监听端口，便于测试） */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, dataSource, matchService } = options
  const logger = options.logger ?? createLogger({ level: config.logLevel, base: { module: 'api' } })
  const startedAt = Date.now()

  const app = Fastify({
    logger: false, // 使用项目统一 logger，避免与控制台耦合
    genReqId: () => `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  })

  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin })

  // ---- 统一错误处理：McArenaError → 状态码 + 契约错误体；其余 → 500 ----
  app.setErrorHandler((error, request, reply) => {
    if (isMcArenaError(error)) {
      logger.warn('请求失败', {
        reqId: request.id,
        url: request.url,
        code: error.code,
        message: error.message,
      })
      reply.status(error.httpStatus).send(error.toJSON())
      return
    }
    logger.error('未处理异常', {
      reqId: request.id,
      url: request.url,
      err: {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
      },
    })
    reply.status(500).send({ code: 'INTERNAL', message: '服务内部错误' })
  })

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ code: 'NOT_FOUND', message: `路由不存在：${request.method} ${request.url}` })
  })

  // ---- 健康检查 ----
  app.get('/api/healthz', () => {
    return HealthResponseSchema.parse({
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      dataMode: config.dataMode,
      dataOrigin: dataSource.describe().dataOrigin,
      mcp: {
        configured: Boolean(config.mcp.token),
        url: config.mcp.url,
        allowWrite: config.mcp.allowWrite,
      },
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      time: new Date().toISOString(),
    })
  })

  // ---- 数据源信息 ----
  app.get('/api/snapshot', async () => {
    const dataset = await dataSource.load()
    return SnapshotInfoResponseSchema.parse({
      dataOrigin: dataset.dataOrigin,
      sourceRef: dataset.sourceRef,
      snapshotId: dataset.snapshotId,
      capturedAt: dataset.capturedAt,
      sha256: dataset.sha256,
      notice: dataset.notice,
      menuItemCount: dataset.menuItems.length,
      couponCount: dataset.coupons.length,
      toolsInvoked: dataset.toolsInvoked,
    })
  })

  // ---- 发起比赛 ----
  app.post('/api/match', async (request, reply) => {
    const parsed = StartMatchRequestSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: `请求体校验失败：${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      })
      return
    }
    const result = await matchService.startMatch(parsed.data)
    return MatchResultSchema.parse(result)
  })

  // ---- 查询比赛结果 ----
  app.get<{ Params: { id: string } }>('/api/match/:id', (request) => {
    return MatchResultSchema.parse(matchService.getMatch(request.params.id))
  })

  // ---- SSE：回放比赛事件序列 ----
  app.get<{ Params: { id: string } }>('/api/match/:id/stream', async (request, reply) => {
    const events = matchService.getEvents(request.params.id)
    // 与 GET /api/match/:id 保持一致：未知/已淘汰的 matchId 一律 404，
    // 不返回 200 空流（前端不依赖该路由的 200 行为）
    if (!matchService.getMatch(request.params.id)) {
      reply.status(404).send({
        code: 'NOT_FOUND',
        message: `比赛 ${request.params.id} 不存在或已过期`,
      })
      return
    }
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    for (const event of events) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    reply.raw.write('event: end\ndata: {}\n\n')
    reply.raw.end()
  })

  return app
}

/** 启动入口：读取配置 → 组装依赖 → 监听端口 */
export async function startServer(): Promise<FastifyInstance> {
  const config = loadConfig()
  const logger = createLogger({ level: config.logLevel, base: { module: 'api' } })
  const dataSource = createDataSource(config, logger)
  // 阶段03：真实双 Agent（极速猎手 / 深度优化师）+ 规则裁判，失败自动降级恢复
  const orchestrator = createMatchOrchestrator(logger)
  const matchService = new MatchService({
    dataSource,
    orchestrator,
    store: new MatchStore(),
    logger,
    agentRecovery: 'recover',
  })

  const app = await buildApp({ config, logger, dataSource, matchService })
  await app.listen({ host: config.host, port: config.port })
  logger.info('McArena API 已启动', {
    host: config.host,
    port: config.port,
    dataMode: config.dataMode,
    mockWarning: config.dataMode === 'mock' ? '当前为模拟数据模式，界面将明确标注' : undefined,
  })
  return app
}

// 直接执行（tsx watch src/server.ts / node dist/server.js）时启动
const invokedAs = process.argv[1]
const isMain =
  typeof invokedAs === 'string' && import.meta.url === pathToFileURL(invokedAs).href
if (isMain) {
  startServer().catch((error: unknown) => {
    const body = isMcArenaError(error)
      ? error.toJSON()
      : { code: 'INTERNAL' as const, message: error instanceof Error ? error.message : String(error) }
    process.stderr.write(`${JSON.stringify(body)}\n`)
    process.exit(1)
  })
}
