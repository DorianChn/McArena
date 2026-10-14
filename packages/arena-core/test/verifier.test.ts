import { describe, expect, it } from 'vitest'
import {
  AgentExecutionSchema,
  ArenaDatasetSchema,
  ChallengeSchema,
  EvidenceRecordSchema,
} from '@mcarena/shared'
import type { AgentExecution, ArenaDataset, Challenge, MealProposal } from '@mcarena/shared'
import { verifyAgentProposal } from '../src/engine/verifier.js'
import type { PriceOracle } from '../src/types.js'

// ---------------------------------------------------------------- 测试夹具

const TS = '2026-10-14T05:00:00.000Z'

function buildMenu(): ArenaDataset {
  return ArenaDatasetSchema.parse({
    dataOrigin: 'mock',
    sourceRef: 'judge-fixture://verifier',
    capturedAt: TS,
    toolsInvoked: ['query-meals', 'query-store-coupons'],
    store: null,
    menuItems: [
      {
        code: 'burger',
        name: '测试汉堡',
        category: '汉堡',
        priceCents: 1500,
        tags: ['burger', 'beef'],
        available: true,
        nutrition: { kcal: 500, proteinG: 25, sodiumMg: 800 },
      },
      {
        code: 'fries',
        name: '测试薯条',
        category: '小食',
        priceCents: 800,
        tags: ['side'],
        available: true,
        nutrition: { kcal: 300, proteinG: 4, sodiumMg: 250 },
      },
      {
        code: 'cola',
        name: '测试可乐',
        category: '饮品',
        priceCents: 700,
        tags: ['drink'],
        available: true,
        nutrition: { kcal: 180, proteinG: 0, sodiumMg: 20 },
      },
      {
        code: 'soldout',
        name: '已下架汉堡',
        category: '汉堡',
        priceCents: 1200,
        tags: ['burger'],
        available: false,
        nutrition: { kcal: 400, proteinG: 20, sodiumMg: 700 },
      },
      {
        code: 'no-nutrition',
        name: '无营养数据餐品',
        category: '小食',
        priceCents: 600,
        tags: ['side'],
        available: true,
      },
    ],
    priceQuotes: [],
    coupons: [
      {
        code: 'coupon-threshold',
        name: '满 20 减 3 券',
        type: 'threshold-discount',
        valueCents: 300,
        thresholdCents: 2000,
        applicableTags: [],
      },
      {
        code: 'coupon-side',
        name: '小食立减 2 券',
        type: 'item-discount',
        valueCents: 200,
        thresholdCents: 0,
        applicableTags: ['side'],
      },
      {
        code: 'coupon-percent',
        name: '九折券',
        type: 'percent-off',
        percent: 10,
        applicableTags: [],
      },
    ],
    timeInfo: null,
    sha256: null,
    notice: '裁判测试夹具（模拟数据）',
  })
}

function buildChallenge(overrides: Partial<Challenge['constraints']> = {}): Challenge {
  return ChallengeSchema.parse({
    id: 'judge-challenge-1',
    seed: 1,
    constraints: {
      people: 1,
      budgetCents: 3000,
      scene: 'dine-in',
      ...overrides,
    },
    title: '测试任务卡',
    brief: '裁判独立验证用',
    generatedAt: TS,
  })
}

function item(code: string, qty = 1, priceCents = 1500): MealProposal['items'][number] {
  return {
    code,
    name: `餐品 ${code}`,
    qty,
    unitPriceCents: priceCents,
    lineTotalCents: priceCents * qty,
  }
}

function proposal(overrides: Partial<MealProposal> = {}): MealProposal {
  const items = overrides.items ?? [item('burger')]
  const subtotal = items.reduce((sum, entry) => sum + entry.lineTotalCents, 0)
  return {
    items,
    subtotalCents: subtotal,
    deliveryFeeCents: 0,
    discountCents: 0,
    totalCents: subtotal,
    couponCodes: [],
    constraintChecks: [],
    priceOrigin: 'mock',
    ...overrides,
  }
}

function execution(overrides: Partial<AgentExecution> = {}): AgentExecution {
  return AgentExecutionSchema.parse({
    agentId: 'alpha',
    name: '测试 Agent',
    role: '测试',
    engine: 'test-engine',
    engineVersion: '1.0.0',
    status: 'completed',
    dataOrigin: 'mock',
    proposal: proposal(),
    evidence: [
      EvidenceRecordSchema.parse({ id: 'e1', kind: 'data-source', message: '数据', at: TS }),
      EvidenceRecordSchema.parse({ id: 'e2', kind: 'selection', message: '选择', at: TS }),
      EvidenceRecordSchema.parse({ id: 'e3', kind: 'price', message: '计价', at: TS }),
      EvidenceRecordSchema.parse({ id: 'e4', kind: 'constraint-check', message: '约束', at: TS }),
    ],
    startedAt: TS,
    finishedAt: TS,
    durationMs: 12,
    toolCalls: [],
    phases: [],
    recovery: { used: false, reason: '' },
    ...overrides,
  })
}

/** 固定命中官方记录的预言机（用于核价测试） */
function oracleWith(quote: (cart: { items: Array<{ code: string; qty: number }> }) => {
  quoteId: string
  itemCodes: string[]
  subtotalCents: number
  deliveryFeeCents: number
  discountCents: number
  totalCents: number
  couponCodesApplied: string[]
  priceOrigin: 'mock'
} | null): PriceOracle {
  return {
    quote: (cart) =>
      Promise.resolve(
        quote(cart)
          ? {
              ...quote(cart)!,
            }
          : null,
      ),
  }
}

// ---------------------------------------------------------------- 验证器测试

describe('verifyAgentProposal：提案存在性', () => {
  it('proposal 为 null → empty-proposal（fatal），失去资格', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: null }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('empty-proposal')
    expect(result.violations.find((v) => v.code === 'empty-proposal')?.severity).toBe('fatal')
    expect(result.effectiveCostCents).toBeNull()
    expect(result.priceStatus).toBe('not-verified')
  })

  it('提案餐品为空数组 → empty-proposal（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [], subtotalCents: 0, totalCents: 0 }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('empty-proposal')
  })
})

describe('verifyAgentProposal：餐品存在性与数量', () => {
  it('餐品不存在于数据集 → unknown-item（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('ghost-burger', 1, 999)] }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('unknown-item')
    expect(result.verifiedSubtotalCents).toBe(0) // 不存在餐品按 0 计
  })

  it('餐品不在售 → unavailable-item（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('soldout', 1, 1200)] }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('unavailable-item')
  })

  it('申报单价与数据集不一致 → warning，仍保留资格', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger', 1, 9999)] }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(true)
    const warning = result.violations.find((v) => v.code === 'invalid-price')
    expect(warning?.severity).toBe('warning')
    // 裁判以数据集单价重算
    expect(result.verifiedSubtotalCents).toBe(1500)
  })

  it('同一餐品重复出现 → duplicate-items（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({ items: [item('burger'), item('burger')] }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('duplicate-items')
    expect(result.checks.find((c) => c.name === '无重复餐品')?.passed).toBe(false)
  })
})

describe('verifyAgentProposal：硬约束', () => {
  it('裁决成本在预算内 → 通过', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge({ budgetCents: 2000 }),
      dataset: buildMenu(),
    })
    expect(result.checks.find((c) => c.name === '预算限制')?.passed).toBe(true)
    expect(result.eligible).toBe(true)
  })

  it('裁决成本超预算 → budget-exceeded（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger'), item('fries'), item('cola')] }) }),
      challenge: buildChallenge({ budgetCents: 2000 }),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('budget-exceeded')
    expect(result.effectiveCostCents).toBe(3000)
  })

  it('商品总数不足覆盖人数 → people-not-covered（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge({ people: 2 }),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('people-not-covered')
  })

  it('餐品种类超过上限 → distinct-items-exceeded（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger'), item('fries'), item('cola')] }) }),
      challenge: buildChallenge({ maxDistinctItems: 2 }),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('distinct-items-exceeded')
  })

  it('缺少必选餐品 → missing-required-code（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('cola')] }) }),
      challenge: buildChallenge({ mustIncludeCodes: ['burger'] }),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('missing-required-code')
  })

  it('缺少必选标签 → missing-required-tag（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('cola')] }) }),
      challenge: buildChallenge({ requiredTags: ['burger'] }),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('missing-required-tag')
  })

  it('缺少必选类别 → missing-required-category（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('cola')] }) }),
      challenge: buildChallenge({ requiredCategories: ['汉堡'] }),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('missing-required-category')
  })
})

describe('verifyAgentProposal：优惠券验证', () => {
  it('券不存在于数据集 → coupon-not-found（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({ items: [item('burger'), item('fries')], couponCodes: ['coupon-ghost'] }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('coupon-not-found')
    expect(result.validCouponCodes).toEqual([])
  })

  it('满减券门槛未达 → coupon-threshold-not-met（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({ items: [item('cola')], couponCodes: ['coupon-threshold'] }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('coupon-threshold-not-met')
  })

  it('满减券门槛达成 → 计入优惠并重算', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({
          items: [item('burger'), item('fries')],
          couponCodes: ['coupon-threshold'],
          discountCents: 300,
          totalCents: 2000,
        }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(true)
    expect(result.validCouponCodes).toEqual(['coupon-threshold'])
    expect(result.verifiedDiscountCents).toBe(300)
    expect(result.effectiveCostCents).toBe(2000)
  })

  it('商品券适用标签不匹配 → coupon-not-applicable（fatal）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({ items: [item('burger')], couponCodes: ['coupon-side'] }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('coupon-not-applicable')
  })

  it('不支持的券类型 → coupon-unsupported-type（warning），不丧失资格', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({ items: [item('burger'), item('fries')], couponCodes: ['coupon-percent'] }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.eligible).toBe(true)
    expect(result.violations.map((v) => v.code)).toContain('coupon-unsupported-type')
    expect(result.validCouponCodes).toEqual([])
    expect(result.verifiedDiscountCents).toBe(0)
  })

  it('同一张券重复申报 → 仅计入一次（warning）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({
          items: [item('burger'), item('fries')],
          couponCodes: ['coupon-threshold', 'coupon-threshold'],
        }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.validCouponCodes).toEqual(['coupon-threshold'])
    expect(result.violations.map((v) => v.code)).toContain('coupon-not-found')
    expect(result.violations.find((v) => v.message.includes('重复申报'))?.severity).toBe('warning')
  })

  it('申报优惠与裁判重算不一致 → discount-mismatch（warning），以重算值为准', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({
          items: [item('burger'), item('fries')],
          couponCodes: ['coupon-threshold'],
          discountCents: 999,
          totalCents: 1801,
        }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.verifiedDiscountCents).toBe(300)
    expect(result.violations.map((v) => v.code)).toContain('discount-mismatch')
  })
})

describe('verifyAgentProposal：官方核价（calculate-price）', () => {
  it('申报应付与官方记录一致 → verified', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
      priceOracle: oracleWith(() => ({
        quoteId: 'q-1',
        itemCodes: ['burger'],
        subtotalCents: 1500,
        deliveryFeeCents: 0,
        discountCents: 0,
        totalCents: 1500,
        couponCodesApplied: [],
        priceOrigin: 'mock',
      })),
    })
    expect(result.priceStatus).toBe('verified')
    expect(result.officialCostCents).toBe(1500)
    expect(result.effectiveCostCents).toBe(1500)
    expect(result.checks.find((c) => c.name === '官方核价')?.passed).toBe(true)
  })

  it('申报应付与官方记录不一致 → mismatch（warning），以官方值为准', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
      priceOracle: oracleWith(() => ({
        quoteId: 'q-2',
        itemCodes: ['burger'],
        subtotalCents: 1500,
        deliveryFeeCents: 0,
        discountCents: 0,
        totalCents: 1200,
        couponCodesApplied: [],
        priceOrigin: 'mock',
      })),
    })
    expect(result.priceStatus).toBe('mismatch')
    expect(result.officialCostCents).toBe(1200)
    expect(result.effectiveCostCents).toBe(1200)
    expect(result.eligible).toBe(true) // mismatch 仅是 warning
  })

  it('预言机未命中记录 → NOT_VERIFIED（warning，不视为通过）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
      priceOracle: oracleWith(() => null),
    })
    expect(result.priceStatus).toBe('not-verified')
    expect(result.officialCostCents).toBeNull()
    expect(result.effectiveCostCents).toBe(1500) // 退化为裁判重算
    expect(result.violations.map((v) => v.code)).toContain('price-not-verifiable')
    expect(result.checks.find((c) => c.name === '官方核价')?.passed).toBe(false)
  })

  it('未配置预言机 → NOT_VERIFIED', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.priceStatus).toBe('not-verified')
    expect(result.violations.map((v) => v.code)).toContain('price-not-verifiable')
  })
})

describe('verifyAgentProposal：配送费与营养', () => {
  it('外送场景计入配送费 ¥5', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge({ scene: 'delivery' }),
      dataset: buildMenu(),
    })
    expect(result.verifiedDeliveryCents).toBe(500)
    expect(result.effectiveCostCents).toBe(2000)
  })

  it('堂食场景配送费为 0', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge({ scene: 'dine-in' }),
      dataset: buildMenu(),
    })
    expect(result.verifiedDeliveryCents).toBe(0)
  })

  it('营养目标达成率按人数缩放计算', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger', 2, 1500)] }) }),
      challenge: buildChallenge({ people: 2, nutritionTarget: { kcal: 500, proteinG: 25 } }),
      dataset: buildMenu(),
    })
    // 2 份汉堡：1000 kcal / 50g 蛋白，人均目标 500kcal/25g → 达成率 1
    expect(result.targetAchievement).toBeCloseTo(1, 5)
  })

  it('部分餐品缺营养数据 → nutrition-data-missing（warning）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('no-nutrition', 1, 600)] }) }),
      challenge: buildChallenge({ nutritionTarget: { kcal: 300 } }),
      dataset: buildMenu(),
    })
    expect(result.violations.map((v) => v.code)).toContain('nutrition-data-missing')
    expect(result.targetAchievement).toBe(0)
  })

  it('无营养目标 → targetAchievement 为 null', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.targetAchievement).toBeNull()
  })

  it('钠超标 → 达成率按比例折减（<1）', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger', 1, 1500)] }) }),
      challenge: buildChallenge({ nutritionTarget: { sodiumMgMax: 400 } }),
      dataset: buildMenu(),
    })
    expect(result.targetAchievement).toBeCloseTo(400 / 800, 5)
  })
})

describe('verifyAgentProposal：输出结构与确定性', () => {
  it('responseMs 取自 AgentExecution.durationMs', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ durationMs: 137 }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.responseMs).toBe(137)
  })

  it('durationMs 缺失时记 0', async () => {
    const agent = execution()
    delete (agent as { durationMs?: number }).durationMs
    const result = await verifyAgentProposal({
      agent,
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    expect(result.responseMs).toBe(0)
  })

  it('checks 覆盖存在性/数量/优惠/核价/人数/预算/营养', async () => {
    const result = await verifyAgentProposal({
      agent: execution({ proposal: proposal({ items: [item('burger')] }) }),
      challenge: buildChallenge({ nutritionTarget: { kcal: 500 } }),
      dataset: buildMenu(),
    })
    const names = result.checks.map((check) => check.name)
    expect(names).toContain('提案存在性')
    expect(names).toContain('餐品存在且在售')
    expect(names).toContain('数量合法')
    expect(names).toContain('优惠券条件')
    expect(names).toContain('官方核价')
    expect(names).toContain('人数覆盖')
    expect(names).toContain('预算限制')
    expect(names).toContain('营养目标达成')
  })

  it('相同输入两次验证 → 结果完全一致（确定性）', async () => {
    const input = {
      agent: execution({
        proposal: proposal({
          items: [item('burger'), item('fries')],
          couponCodes: ['coupon-threshold'],
          discountCents: 300,
          totalCents: 2000,
        }),
      }),
      challenge: buildChallenge({ nutritionTarget: { kcal: 600, proteinG: 20 } }),
      dataset: buildMenu(),
    }
    const a = await verifyAgentProposal(input)
    const b = await verifyAgentProposal(input)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('违规均带 severity 与 message；证据引用指向数据集', async () => {
    const result = await verifyAgentProposal({
      agent: execution({
        proposal: proposal({ items: [item('ghost')], couponCodes: ['coupon-ghost'] }),
      }),
      challenge: buildChallenge(),
      dataset: buildMenu(),
    })
    for (const violation of result.violations) {
      expect(['fatal', 'warning']).toContain(violation.severity)
      expect(violation.message.length).toBeGreaterThan(0)
    }
    expect(result.violations.find((v) => v.code === 'unknown-item')?.evidenceRef).toContain(
      'judge-fixture://verifier',
    )
  })
})



