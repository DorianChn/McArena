import type { MenuItem, Coupon, StoreInfo } from '@mcarena/shared'

/**
 * 开发用模拟夹具数据（明确非官方数据）。
 * 命名与数值均为演示用途，禁止在任何对外材料中当作麦当劳真实餐品/价格。
 */

export const MOCK_NOTICE =
  '本数据为开发用模拟夹具（mock），非麦当劳官方数据；仅用于无 Token 的开发联调，不得作为官方数据展示。'

export const MOCK_MENU_ITEMS: MenuItem[] = [
  {
    code: 'mock-burger-classic',
    name: '模拟·经典牛肉堡',
    category: '汉堡',
    priceCents: 1500,
    tags: ['burger', 'beef'],
    available: true,
    nutrition: { kcal: 520, proteinG: 26, fatG: 22, carbG: 45, sodiumMg: 820, calciumMg: 120 },
    description: '模拟数据：经典牛肉汉堡（开发演示）',
  },
  {
    code: 'mock-burger-chicken',
    name: '模拟·香辣鸡腿堡',
    category: '汉堡',
    priceCents: 1700,
    tags: ['burger', 'chicken', 'spicy'],
    available: true,
    nutrition: { kcal: 560, proteinG: 24, fatG: 25, carbG: 48, sodiumMg: 910, calciumMg: 90 },
  },
  {
    code: 'mock-fries-medium',
    name: '模拟·薯条（中）',
    category: '小食',
    priceCents: 800,
    tags: ['side', 'fried'],
    available: true,
    nutrition: { kcal: 320, proteinG: 4, fatG: 15, carbG: 41, sodiumMg: 260 },
  },
  {
    code: 'mock-nuggets-5',
    name: '模拟·鸡块（5 块）',
    category: '小食',
    priceCents: 900,
    tags: ['side', 'chicken'],
    available: true,
    nutrition: { kcal: 230, proteinG: 13, fatG: 14, carbG: 13, sodiumMg: 480 },
  },
  {
    code: 'mock-cola-medium',
    name: '模拟·可乐（中）',
    category: '饮品',
    priceCents: 700,
    tags: ['drink'],
    available: true,
    nutrition: { kcal: 180, proteinG: 0, fatG: 0, carbG: 45, sodiumMg: 20 },
  },
  {
    code: 'mock-salad',
    name: '模拟·蔬菜沙拉',
    category: '轻食',
    priceCents: 1200,
    tags: ['light', 'vegetable'],
    available: true,
    nutrition: { kcal: 150, proteinG: 5, fatG: 7, carbG: 14, sodiumMg: 220, calciumMg: 80 },
  },
  {
    code: 'mock-soup-corn',
    name: '模拟·玉米浓汤',
    category: '汤品',
    priceCents: 600,
    tags: ['soup', 'warm'],
    available: true,
    nutrition: { kcal: 140, proteinG: 3, fatG: 5, carbG: 20, sodiumMg: 480 },
  },
  {
    code: 'mock-sundae',
    name: '模拟·圣代（草莓）',
    category: '甜品',
    priceCents: 650,
    tags: ['dessert', 'cold'],
    available: true,
    nutrition: { kcal: 210, proteinG: 4, fatG: 6, carbG: 34, sodiumMg: 70 },
  },
]

export const MOCK_COUPONS: Coupon[] = [
  {
    code: 'mock-coupon-threshold',
    name: '模拟·满 30 减 5 券',
    type: 'threshold-discount',
    valueCents: 500,
    thresholdCents: 3000,
    applicableTags: [],
  },
  {
    code: 'mock-coupon-item',
    name: '模拟·小食立减 3 元',
    type: 'item-discount',
    valueCents: 300,
    applicableTags: ['side'],
  },
]

export const MOCK_STORE: StoreInfo = {
  storeId: 'mock-store-001',
  name: '模拟门店·开发演示店',
  address: '模拟地址（开发数据，非真实门店）',
  scene: ['dine-in', 'take-away'],
}

export interface MockMealDetail {
  code: string
  name: string
  category: string
  priceCents: number
  description: string
  options: string[]
}

export const MOCK_MEAL_DETAILS: MockMealDetail[] = MOCK_MENU_ITEMS.map((item) => ({
  code: item.code,
  name: item.name,
  category: item.category,
  priceCents: item.priceCents,
  description: `模拟餐品详情（${item.name}）：开发演示用的套餐组成示例。`,
  options: ['升级大份 +3 元（模拟）', '更换饮品（模拟）'],
}))

export const MOCK_CAMPAIGNS = [
  {
    id: 'mock-campaign-1',
    name: '模拟·开发者节主题活动',
    status: 'ongoing',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    summary: '模拟活动日历数据：程序员节主题（开发演示）',
  },
]
