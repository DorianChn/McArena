import type { Coupon, MenuItem } from '@mcarena/shared'

/**
 * 优惠券应用引擎（纯函数，确定性）。
 * 依据数据集内官方优惠券规则（query-store-coupons）计算可叠加的优惠，
 * 不虚构任何券；未能命中的券不计入。
 */

export interface CouponCartItem {
  code: string
  qty: number
  lineTotalCents: number
}

export interface CouponApplicationResult {
  couponCodes: string[]
  discountCents: number
  skipped: Array<{ code: string; reason: string }>
}

export function applyCoupons(
  coupons: Coupon[],
  items: CouponCartItem[],
  menuByCode: Map<string, MenuItem>,
  subtotalCents: number,
  deliveryFeeCents: number,
): CouponApplicationResult {
  const applied: string[] = []
  const skipped: Array<{ code: string; reason: string }> = []
  let discountCents = 0

  // 确定性顺序：按面值降序、编码升序依次评估
  const ordered = [...coupons].sort((a, b) => {
    const valueDiff = (b.valueCents ?? 0) - (a.valueCents ?? 0)
    return valueDiff !== 0 ? valueDiff : a.code.localeCompare(b.code)
  })

  const itemTags = new Set(
    items.flatMap((item) => menuByCode.get(item.code)?.tags ?? []),
  )

  for (const coupon of ordered) {
    if (coupon.type === 'threshold-discount') {
      const threshold = coupon.thresholdCents ?? 0
      if (subtotalCents < threshold) {
        skipped.push({ code: coupon.code, reason: `未达门槛 ¥${(threshold / 100).toFixed(2)}` })
        continue
      }
      const value = coupon.valueCents ?? 0
      discountCents += value
      applied.push(coupon.code)
      continue
    }
    if (coupon.type === 'item-discount') {
      const matches = (coupon.applicableTags ?? []).filter((tag) => itemTags.has(tag))
      if (matches.length === 0) {
        skipped.push({ code: coupon.code, reason: '购物车无适用标签' })
        continue
      }
      const value = coupon.valueCents ?? 0
      discountCents += value
      applied.push(coupon.code)
      continue
    }
    skipped.push({ code: coupon.code, reason: `暂不支持的券类型 ${coupon.type}` })
  }

  discountCents = Math.min(discountCents, subtotalCents + deliveryFeeCents)
  return { couponCodes: applied, discountCents, skipped }
}
