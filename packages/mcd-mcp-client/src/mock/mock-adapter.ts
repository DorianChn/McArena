import {
  ArenaDatasetSchema,
  MOCK_DATA_WARNING,
  createLogger,
} from '@mcarena/shared'
import type { McpInitialized, McpToolDefinition } from '../types.js'
import type { McdMcpAdapter } from '../types.js'
import {
  MOCK_CAMPAIGNS,
  MOCK_COUPONS,
  MOCK_MEAL_DETAILS,
  MOCK_MENU_ITEMS,
  MOCK_NOTICE,
  MOCK_STORE,
} from './fixtures.js'

/**
 * 开发用模拟 MCP 适配器。
 *
 * ⚠️ 明确标注：返回的一切数据均为模拟夹具数据（dataOrigin = 'mock'），
 * 不得伪装为麦当劳官方数据。工具名称与官方对齐，便于联调；
 * 一旦获得真实 Token，改用 HttpMcpAdapter。
 */
export class MockMcpAdapter implements McdMcpAdapter {
  readonly mode = 'mock' as const

  private readonly logger = createLogger({ base: { module: 'mock-mcp-adapter' } })

  initialize(): Promise<McpInitialized> {
    return Promise.resolve({
      protocolVersion: '2025-03-26',
      serverInfo: { name: 'mock-mcd-mcp (development fixture)', version: '0.1.0' },
      instructions: 'MOCK 适配器：开发联调用，非官方服务。',
    })
  }

  listTools(): Promise<McpToolDefinition[]> {
    return Promise.resolve(MOCK_TOOLS)
  }

  call<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    this.logger.debug('mock 工具调用', { tool })
    switch (tool) {
      case 'now-time-info':
        return Promise.resolve({
          iso: new Date().toISOString(),
          timezone: 'Asia/Shanghai',
          daypart: daypartOf(new Date()),
        } as T)
      case 'query-nearby-stores':
        return Promise.resolve({ stores: [MOCK_STORE] } as T)
      case 'query-meals':
        return Promise.resolve({
          categories: [...new Set(MOCK_MENU_ITEMS.map((item) => item.category))],
          items: MOCK_MENU_ITEMS,
        } as T)
      case 'query-meal-detail': {
        const code = typeof args.code === 'string' ? args.code : ''
        const detail = MOCK_MEAL_DETAILS.find((item) => item.code === code)
        if (!detail) {
          return Promise.reject(new Error(`mock query-meal-detail: 未找到餐品 ${code}`))
        }
        return Promise.resolve(detail as T)
      }
      case 'calculate-price': {
        const items = Array.isArray(args.items)
          ? (args.items as Array<{ code: string; qty?: number }>)
          : []
        const couponCodes = Array.isArray(args.couponCodes) ? (args.couponCodes as string[]) : []
        const scene = typeof args.scene === 'string' ? args.scene : 'dine-in'
        return Promise.resolve(calculateMockPrice(items, couponCodes, scene) as T)
      }
      case 'query-store-coupons':
        return Promise.resolve({ coupons: MOCK_COUPONS } as T)
      case 'list-nutrition-foods':
        return Promise.resolve({ foods: MOCK_MENU_ITEMS } as T)
      case 'campaign-calendar':
        return Promise.resolve({ campaigns: MOCK_CAMPAIGNS } as T)
      default:
        return Promise.reject(new Error(`MockMcpAdapter: 未实现的 mock 工具 ${tool}`))
    }
  }

  /** 调用本适配器自身，组装并校验一个 mock 数据集（引擎消费形状） */
  async buildArenaDataset() {
    const [timeInfo, stores, coupons, nutrition] = await Promise.all([
      this.call<{ iso: string; timezone: string; daypart: string }>('now-time-info'),
      this.call<{ stores: Array<typeof MOCK_STORE> }>('query-nearby-stores'),
      this.call<{ coupons: Array<typeof MOCK_COUPONS[number]> }>('query-store-coupons'),
      this.call<{ foods: Array<typeof MOCK_MENU_ITEMS[number]> }>('list-nutrition-foods'),
    ])

    const sampleQuote = calculateMockPrice(
      MOCK_MENU_ITEMS.slice(0, 3).map((item) => ({ code: item.code, qty: 1 })),
      [],
      'dine-in',
    )

    return ArenaDatasetSchema.parse({
      dataOrigin: 'mock',
      sourceRef: 'mock://dev-fixtures',
      capturedAt: new Date().toISOString(),
      toolsInvoked: [
        'now-time-info',
        'query-nearby-stores',
        'query-meals',
        'query-store-coupons',
        'list-nutrition-foods',
      ],
      store: stores.stores[0] ?? null,
      menuItems: mergeNutrition(MOCK_MENU_ITEMS, nutrition.foods),
      priceQuotes: [
        {
          quoteId: 'mock-quote-sample',
          itemCodes: sampleQuote.breakdown.map((b) => b.code),
          subtotalCents: sampleQuote.subtotalCents,
          deliveryFeeCents: 0,
          discountCents: sampleQuote.discountCents,
          totalCents: sampleQuote.totalCents,
          couponCodesApplied: [],
          priceOrigin: 'mock' as const,
        },
      ],
      coupons: coupons.coupons,
      timeInfo,
      sha256: null,
      notice: `${MOCK_NOTICE} ${MOCK_DATA_WARNING}`,
    })
  }
}

/** 与官方 README 对齐的 mock 工具清单 */
export const MOCK_TOOLS: McpToolDefinition[] = [
  { name: 'now-time-info', description: '获取当前时间信息（mock）' },
  { name: 'query-nearby-stores', description: '查询附近可用门店（mock）' },
  { name: 'query-meals', description: '查询当前可售卖的餐品列表（mock）' },
  { name: 'query-meal-detail', description: '查询餐品详情（mock）' },
  { name: 'calculate-price', description: '商品价格计算（mock）' },
  { name: 'query-store-coupons', description: '查询门店可用优惠券（mock）' },
  { name: 'list-nutrition-foods', description: '餐品营养信息列表（mock）' },
  { name: 'campaign-calendar', description: '活动日历查询（mock）' },
]

function daypartOf(date: Date): string {
  const hour = date.getHours()
  if (hour < 10) return 'breakfast'
  if (hour < 14) return 'lunch'
  if (hour < 17) return 'afternoon'
  return 'dinner'
}

interface MockPriceBreakdownItem {
  code: string
  qty: number
  subtotalCents: number
}

/** 确定性 mock 计价逻辑（仅开发演示；真实计价必须走官方 calculate-price） */
export function calculateMockPrice(
  items: Array<{ code: string; qty?: number }>,
  couponCodes: string[],
  scene: string,
): {
  breakdown: MockPriceBreakdownItem[]
  subtotalCents: number
  deliveryFeeCents: number
  discountCents: number
  totalCents: number
  couponCodesApplied: string[]
} {
  const breakdown = items.map((entry) => {
    const item = MOCK_MENU_ITEMS.find((menuItem) => menuItem.code === entry.code)
    if (!item) {
      throw new Error(`mock calculate-price: 未找到餐品 ${entry.code}`)
    }
    const qty = Math.max(1, Number(entry.qty ?? 1))
    return { code: entry.code, qty, subtotalCents: item.priceCents * qty }
  })
  const subtotalCents = breakdown.reduce((sum, entry) => sum + entry.subtotalCents, 0)
  const deliveryFeeCents = scene === 'delivery' ? 500 : 0

  let discountCents = 0
  const applied: string[] = []
  for (const code of couponCodes) {
    const coupon = MOCK_COUPONS.find((entry) => entry.code === code)
    if (!coupon) continue
    if (coupon.type === 'threshold-discount' && subtotalCents >= (coupon.thresholdCents ?? 0)) {
      discountCents += coupon.valueCents ?? 0
      applied.push(coupon.code)
    }
    if (coupon.type === 'item-discount') {
      const codes = new Set(items.map((entry) => entry.code))
      const tags = MOCK_MENU_ITEMS.filter((item) => codes.has(item.code)).flatMap((item) => item.tags)
      if ((coupon.applicableTags ?? []).some((tag) => tags.includes(tag))) {
        discountCents += coupon.valueCents ?? 0
        applied.push(coupon.code)
      }
    }
  }
  discountCents = Math.min(discountCents, subtotalCents + deliveryFeeCents)
  return {
    breakdown,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents: subtotalCents + deliveryFeeCents - discountCents,
    couponCodesApplied: applied,
  }
}

function mergeNutrition(
  menu: typeof MOCK_MENU_ITEMS,
  nutritionList: typeof MOCK_MENU_ITEMS,
): typeof MOCK_MENU_ITEMS {
  const byCode = new Map(nutritionList.map((item) => [item.code, item.nutrition]))
  return menu.map((item) => ({ ...item, nutrition: byCode.get(item.code) ?? item.nutrition }))
}
