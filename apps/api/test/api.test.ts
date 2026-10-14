import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/server.js'
import { loadConfig } from '../src/config.js'
import { createDataSource } from '../src/services/data-source.js'
import { MatchService, MatchStore, createMatchOrchestrator } from '../src/services/match-service.js'
import {
  ApiErrorBodySchema,
  HealthResponseSchema,
  MatchResultSchema,
  SnapshotInfoResponseSchema,
  canonicalizeMatch,
  createLogger,
  createSilentLogger,
} from '@mcarena/shared'

const testEnv = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '8787',
  LOG_LEVEL: 'error',
  MCD_MCP_MODE: 'mock',
}

function makeConfig(overrides: Record<string, string> = {}) {
  return loadConfig({ ...testEnv, ...overrides })
}

async function makeApp(mode: 'mock' | 'replay' = 'mock'): Promise<FastifyInstance> {
  const config = makeConfig({ MCD_MCP_MODE: mode })
  const logger = createSilentLogger()
  const dataSource = createDataSource(config, logger)
  // 阶段03：使用真实双 Agent 引擎（极速猎手 / 深度优化师）+ 规则裁判
  const orchestrator = createMatchOrchestrator(logger)
  const matchService = new MatchService({ dataSource, orchestrator, store: new MatchStore(), logger })
  return buildApp({ config, logger, dataSource, matchService })
}

describe('API 路由（mock 模式）', () => {
  it('GET /api/healthz 返回健康状态与 mock 模式', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/api/healthz' })
    expect(response.statusCode).toBe(200)
    const body = HealthResponseSchema.parse(response.json())
    expect(body.status).toBe('ok')
    expect(body.dataMode).toBe('mock')
    expect(body.dataOrigin).toBe('mock')
    expect(body.mcp.configured).toBe(false)
    await app.close()
  })

  it('GET /api/snapshot 返回模拟数据集元信息', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/api/snapshot' })
    expect(response.statusCode).toBe(200)
    const body = SnapshotInfoResponseSchema.parse(response.json())
    expect(body.dataOrigin).toBe('mock')
    expect(body.menuItemCount).toBeGreaterThan(0)
    expect(body.notice).toContain('非麦当劳官方数据')
    await app.close()
  })

  it('POST /api/match 返回完整比赛结果（契约校验通过）', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'POST', url: '/api/match', payload: { seed: 42 } })
    expect(response.statusCode).toBe(200)
    const body = MatchResultSchema.parse(response.json())
    expect(body.matchId).toBeTruthy()
    expect(body.dataOrigin).toBe('mock')
    expect(body.agents).toHaveLength(2)
    expect(body.judge.totalMax).toBe(100)
    expect(body.warnings.join(' ')).toContain('非麦当劳官方数据')

    // 阶段03 指标：两个 Agent 都记录真实运行时间 / 候选数 / 工具调用
    expect(body.agents[0]?.durationMs).toBeGreaterThanOrEqual(0)
    expect(body.agents[0]?.toolCallCount).toBeGreaterThanOrEqual(0)
    expect(body.agents[0]?.engine).toBe('speed-greedy')
    expect(body.agents[1]?.engine).toBe('optimizer-search')
    // 双 Agent 算法实质不同：α 单遍贪心（1 个候选），β 束搜索（多候选）
    expect(body.agents[0]?.candidateCount).toBe(1)
    expect(body.agents[1]?.candidateCount).toBeGreaterThan(1)

    // 结果可回放
    const replay = await app.inject({ method: 'GET', url: `/api/match/${body.matchId}` })
    expect(replay.statusCode).toBe(200)
    expect(MatchResultSchema.parse(replay.json()).matchId).toBe(body.matchId)
    await app.close()
  })

  it('POST /api/match 相同 seed → 相同复现内容', async () => {
    const app = await makeApp()
    const a = await app.inject({ method: 'POST', url: '/api/match', payload: { seed: 7 } })
    const b = await app.inject({ method: 'POST', url: '/api/match', payload: { seed: 7 } })
    expect(canonicalizeMatch(MatchResultSchema.parse(a.json()))).toBe(
      canonicalizeMatch(MatchResultSchema.parse(b.json())),
    )
    await app.close()
  })

  it('POST /api/match 非法请求体返回 400 + 契约错误体', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'POST', url: '/api/match', payload: { seed: 'not-a-number' } })
    expect(response.statusCode).toBe(400)
    expect(ApiErrorBodySchema.parse(response.json()).code).toBe('VALIDATION_ERROR')
    await app.close()
  })

  it('POST /api/match 支持阶段05 自定义挑战约束', async () => {
    const app = await makeApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/match',
      payload: {
        seed: 11,
        constraints: {
          people: 3,
          budgetCents: 4500,
          scene: 'dine-in',
          mustIncludeCodes: [],
          excludedCodes: [],
          requiredTags: ['burger'],
          requiredCategories: [],
          preferCoupons: true,
        },
      },
    })
    expect(response.statusCode).toBe(200)
    const body = MatchResultSchema.parse(response.json())
    expect(body.challenge.constraints.people).toBe(3)
    expect(body.challenge.constraints.budgetCents).toBe(4500)
    expect(body.challenge.constraints.requiredTags).toEqual(['burger'])
    expect(body.challenge.title).toContain('自定义挑战')
    await app.close()
  })

  it('POST /api/match 自定义约束非法时返回 400（契约拒绝）', async () => {
    const app = await makeApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/match',
      payload: {
        seed: 11,
        constraints: { people: 99, scene: 'dine-in' },
      },
    })
    expect(response.statusCode).toBe(400)
    expect(ApiErrorBodySchema.parse(response.json()).code).toBe('VALIDATION_ERROR')
    await app.close()
  })

  it('GET /api/match/unknown 返回 404', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/api/match/nope' })
    expect(response.statusCode).toBe(404)
    expect(ApiErrorBodySchema.parse(response.json()).code).toBe('NOT_FOUND')
    await app.close()
  })

  it('未知路由返回 404', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/api/unknown' })
    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('SSE 流包含完整事件序列', async () => {
    const app = await makeApp()
    const created = await app.inject({ method: 'POST', url: '/api/match', payload: { seed: 1 } })
    const { matchId } = MatchResultSchema.parse(created.json())
    const stream = await app.inject({ method: 'GET', url: `/api/match/${matchId}/stream` })
    expect(stream.statusCode).toBe(200)
    expect(stream.headers['content-type']).toContain('text/event-stream')
    expect(stream.body).toContain('"type":"match.completed"')
    await app.close()
  })
})

describe('配置与数据源模式', () => {
  it('replay 模式无快照时 /api/snapshot 返回 CONFIG_ERROR', async () => {
    const app = await makeApp('replay')
    const response = await app.inject({ method: 'GET', url: '/api/snapshot' })
    expect(response.statusCode).toBe(500)
    expect(ApiErrorBodySchema.parse(response.json()).code).toBe('CONFIG_ERROR')
    await app.close()
  })

  it('日志器对敏感字段脱敏', () => {
    const lines: string[] = []
    const logger = createLogger({ level: 'info', sink: (line) => lines.push(line) })
    logger.info('测试', { token: 'super-secret', authorization: 'Bearer abc.def.ghi', nested: { password: 'p@ss' } })
    expect(lines[0]).toContain('[REDACTED]')
    expect(lines[0]).not.toContain('super-secret')
    expect(lines[0]).not.toContain('p@ss')
  })
})
