import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { MatchResult, MatchStreamEvent } from '@mcarena/shared'
import { buildApp } from '../src/server.js'
import { loadConfig } from '../src/config.js'
import { createDataSource } from '../src/services/data-source.js'
import { MatchService, MatchStore, createMatchOrchestrator } from '../src/services/match-service.js'
import {
  ApiErrorBodySchema,
  MatchResultSchema,
  canonicalizeMatch,
  createSilentLogger,
} from '@mcarena/shared'

/**
 * 阶段07 并发/容量异常测试。
 * 覆盖任务矩阵中的「并发挑战」「取消比赛（未知 id）」「无有效方案」（容量淘汰后取不到结果）等场景。
 * 全部使用 mock 数据源 + 真实双 Agent 引擎，不访问任何外部服务。
 */

const testEnv = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '8787',
  LOG_LEVEL: 'error',
  MCD_MCP_MODE: 'mock',
}

async function makeApp(): Promise<FastifyInstance> {
  const config = loadConfig(testEnv)
  const logger = createSilentLogger()
  const dataSource = createDataSource(config, logger)
  const orchestrator = createMatchOrchestrator(logger)
  const matchService = new MatchService({ dataSource, orchestrator, store: new MatchStore(), logger })
  return buildApp({ config, logger, dataSource, matchService })
}

/** 构造一份最小可用的 MatchResult（用于 MatchStore 单元测试，不依赖引擎） */
function makeMatchResult(matchId: string): MatchResult {
  return {
    matchId,
    seed: 1,
    challenge: {
      seed: 1,
      title: '并发测试任务卡',
      brief: '测试',
      constraints: {
        people: 1,
        scene: 'dine-in',
        mustIncludeCodes: [],
        excludedCodes: [],
        requiredTags: [],
        requiredCategories: [],
        preferCoupons: false,
      },
    },
    dataOrigin: 'mock',
    agents: [],
    judge: {
      winner: 'tie',
      headline: '测试',
      verification: [],
      allViolations: [],
      totalMax: 100,
      scores: [],
    },
    warnings: [],
    capturedAt: new Date(0).toISOString(),
  } as unknown as MatchResult
}

describe('API 并发与容量', () => {
  it('并发 POST /api/match：每个请求得到独立 matchId 且结果可回放', async () => {
    const app = await makeApp()
    const seeds = [101, 202, 303, 404, 505, 606]
    const responses = await Promise.all(
      seeds.map((seed) => app.inject({ method: 'POST', url: '/api/match', payload: { seed } })),
    )

    const matchIds: string[] = []
    for (const response of responses) {
      expect(response.statusCode).toBe(200)
      const body = MatchResultSchema.parse(response.json())
      matchIds.push(body.matchId)
    }
    // 并发下 matchId 必须互不相同（底层依赖 Id 生成，不允许串局）
    expect(new Set(matchIds).size).toBe(seeds.length)

    // 每局都落库且可回放（互不覆盖）
    for (const matchId of matchIds) {
      const replay = await app.inject({ method: 'GET', url: `/api/match/${matchId}` })
      expect(replay.statusCode).toBe(200)
      expect(MatchResultSchema.parse(replay.json()).matchId).toBe(matchId)
    }
    await app.close()
  })

  it('并发 POST 相同 seed：确定性不受并发影响（逐字节一致）', async () => {
    const app = await makeApp()
    const responses = await Promise.all(
      [1, 2, 3].map(() => app.inject({ method: 'POST', url: '/api/match', payload: { seed: 42 } })),
    )
    const canonical = responses.map((response) => canonicalizeMatch(MatchResultSchema.parse(response.json())))
    const [first, second, third] = canonical
    expect(first).toBeDefined()
    expect(second).toBe(first)
    expect(third).toBe(first)
    await app.close()
  })

  it('并发 POST 混合合法/非法请求：错误隔离，合法请求不受影响', async () => {
    const app = await makeApp()
    type PlanEntry = { payload: Record<string, unknown>; expectStatus: number }
    const plan: PlanEntry[] = [
      { payload: { seed: 1 }, expectStatus: 200 },
      { payload: { seed: 'x' }, expectStatus: 400 },
      { payload: { seed: 2 }, expectStatus: 200 },
      { payload: { constraints: { people: 99 } }, expectStatus: 400 },
      { payload: { seed: 3 }, expectStatus: 200 },
    ]
    const responses = await Promise.all(
      plan.map((entry) => app.inject({ method: 'POST', url: '/api/match', payload: entry.payload })),
    )
    responses.forEach((response, index) => {
      const entry = plan[index]
      expect(entry).toBeDefined()
      expect(response.statusCode).toBe(entry?.expectStatus)
      if (response.statusCode === 400) {
        expect(ApiErrorBodySchema.parse(response.json()).code).toBe('VALIDATION_ERROR')
      }
    })
    await app.close()
  })

  it('GET /api/match/<未知>/stream 返回 404（与 GET /api/match/:id 行为一致）', async () => {
    const app = await makeApp()
    const stream = await app.inject({ method: 'GET', url: '/api/match/does-not-exist/stream' })
    expect(stream.statusCode).toBe(404)
    expect(ApiErrorBodySchema.parse(stream.json()).code).toBe('NOT_FOUND')

    // 已淘汰/不存在的 id 也不能通过 SSE 读到内容
    const resultStream = await app.inject({ method: 'GET', url: '/api/match/%20/stream' })
    expect(resultStream.statusCode).toBe(404)
    await app.close()
  })

  it('SSE 流对存在的 matchId 返回完整事件序列', async () => {
    const app = await makeApp()
    const created = await app.inject({ method: 'POST', url: '/api/match', payload: { seed: 8 } })
    const { matchId } = MatchResultSchema.parse(created.json())
    const stream = await app.inject({ method: 'GET', url: `/api/match/${matchId}/stream` })
    expect(stream.statusCode).toBe(200)
    expect(stream.headers['content-type']).toContain('text/event-stream')
    expect(stream.body).toContain('"type":"match.completed"')
    expect(stream.body.endsWith('event: end\ndata: {}\n\n')).toBe(true)
    await app.close()
  })
})

describe('MatchStore 容量与并发', () => {
  it('超出容量时淘汰最旧一局（保留最新）', () => {
    const store = new MatchStore(3)
    store.save(makeMatchResult('m1'), [])
    store.save(makeMatchResult('m2'), [])
    store.save(makeMatchResult('m3'), [])
    store.save(makeMatchResult('m4'), [])

    expect(store.size).toBe(3)
    expect(store.get('m1')).toBeUndefined() // 最旧被淘汰
    expect(store.getEvents('m1')).toEqual([])
    expect(store.get('m2')?.matchId).toBe('m2')
    expect(store.get('m4')?.matchId).toBe('m4') // 最新保留
  })

  it('淘汰后原 id 的 SSE 事件同步不可读', () => {
    const store = new MatchStore(1)
    const events: MatchStreamEvent[] = [{ type: 'match.started', at: new Date(0).toISOString() } as unknown as MatchStreamEvent]
    store.save(makeMatchResult('m1'), events)
    expect(store.getEvents('m1')).toHaveLength(1)
    store.save(makeMatchResult('m2'), [])
    expect(store.get('m1')).toBeUndefined()
    expect(store.getEvents('m1')).toEqual([])
    expect(store.getEvents('m2')).toEqual([])
  })

  it('并发 save/get 不抛错，最终状态自洽', async () => {
    const store = new MatchStore(50)
    const ops = Array.from({ length: 60 }, (_, index) => index)
    await Promise.all(
      ops.map(async (index) => {
        const id = `c${index}`
        // 交错 save 与 get，验证无竞态异常
        store.save(makeMatchResult(id), [])
        store.get(id)
        await Promise.resolve()
        store.get(`c${index - 1}`)
      }),
    )
    expect(store.size).toBeLessThanOrEqual(50)
    expect(store.get('c59')?.matchId).toBe('c59')
    expect(store.get('c0')).toBeUndefined() // 超出容量被淘汰
  })
})
