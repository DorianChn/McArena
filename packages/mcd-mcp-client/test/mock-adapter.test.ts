import { describe, expect, it } from 'vitest'
import { MockMcpAdapter, calculateMockPrice } from '../src/mock/mock-adapter.js'

describe('MockMcpAdapter', () => {
  it('模拟数据集明确标注 mock 且菜单非空', async () => {
    const adapter = new MockMcpAdapter()
    const dataset = await adapter.buildArenaDataset()
    expect(dataset.dataOrigin).toBe('mock')
    expect(dataset.menuItems.length).toBeGreaterThan(0)
    expect(dataset.notice).toContain('非麦当劳官方数据')
  })

  it('未知餐品和未知工具失败；详情工具要求有效编码', async () => {
    const adapter = new MockMcpAdapter()
    await expect(adapter.call('query-meal-detail', { code: 'not-real' })).rejects.toThrow('未找到餐品')
    await expect(adapter.call('not-registered')).rejects.toThrow('未实现的 mock 工具')
    await expect(Promise.resolve().then(() => calculateMockPrice([{ code: 'not-real' }], [], 'dine-in'))).rejects.toThrow('未找到餐品')
  })

  it('计价遵循场景配送费、满额优惠和适用标签优惠', () => {
    const delivery = calculateMockPrice([{ code: 'mock-burger-classic', qty: 2 }], ['mock-coupon-threshold'], 'delivery')
    expect(delivery.deliveryFeeCents).toBe(500)
    expect(delivery.couponCodesApplied).toContain('mock-coupon-threshold')
    expect(delivery.discountCents).toBeGreaterThan(0)
    expect(delivery.totalCents).toBe(delivery.subtotalCents + delivery.deliveryFeeCents - delivery.discountCents)

    const sideDiscount = calculateMockPrice([{ code: 'mock-fries-medium', qty: 1 }], ['mock-coupon-item'], 'dine-in')
    expect(sideDiscount.couponCodesApplied).toContain('mock-coupon-item')
    expect(sideDiscount.discountCents).toBeGreaterThan(0)
  })
})
