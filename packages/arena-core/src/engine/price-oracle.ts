import type { ArenaDataset, PriceQuote } from '@mcarena/shared'
import type { CartSignature, PriceOracle } from '../types.js'

/** 购物车签名：聚合重复编码后按 编码×数量 升序排列 + 券编码升序 */
export function cartSignatureKey(cart: CartSignature): string {
  const qtyByCode = new Map<string, number>()
  for (const item of cart.items) {
    qtyByCode.set(item.code, (qtyByCode.get(item.code) ?? 0) + item.qty)
  }
  const items = [...qtyByCode.entries()]
    .map(([code, qty]) => `${code}x${qty}`)
    .sort()
    .join(',')
  const coupons = [...cart.couponCodes].sort().join(',')
  return `${items}|${coupons}`
}

/** 将 PriceQuote.itemCodes（可能含重复编码）归一化为 CartSignature */
export function quoteToCart(quote: PriceQuote): CartSignature {
  const qtyByCode = new Map<string, number>()
  for (const code of quote.itemCodes) {
    qtyByCode.set(code, (qtyByCode.get(code) ?? 0) + 1)
  }
  return {
    items: [...qtyByCode.entries()].map(([code, qty]) => ({ code, qty })),
    couponCodes: quote.couponCodesApplied,
  }
}

/**
 * 回放价格预言机：从数据集内已录制的官方 calculate-price 记录中查找。
 * 找不到返回 null（调用方按官方单价折算并在证据链中显式说明）。
 */
export class ReplayPriceOracle implements PriceOracle {
  private readonly index: Map<string, PriceQuote>

  constructor(dataset: ArenaDataset) {
    this.index = new Map(
      dataset.priceQuotes.map((quote) => [cartSignatureKey(quoteToCart(quote)), quote]),
    )
  }

  quote(cart: CartSignature): Promise<PriceQuote | null> {
    return Promise.resolve(this.index.get(cartSignatureKey(cart)) ?? null)
  }
}
