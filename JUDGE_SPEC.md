# JUDGE_SPEC.md — McArena 独立智能裁判系统规范（阶段04）

> 版本：judge-rules/1.1.0 ｜ 引擎：`rule-based@1.0.0`（arena-core `RuleBasedJudge`）
> 定位：Judge Engine 是两个竞技 Agent **之外的独立第三方**。它不参与决策，只做验证与裁决。

---

## 1. 设计原则（不可违反）

| # | 原则 | 实现 |
|---|------|------|
| P1 | **裁判不信任 Agent 自己报告的任何成绩** | 全部评分输入来自 `verifyAgentProposal()` 的独立重算，不读 `proposal.constraintChecks`、不采信 `proposal.totalCents` 作为裁决依据 |
| P2 | 约束满足是硬性条件 | 出现任一 `fatal` 违规即 `eligible=false`，不能获胜（§5） |
| P3 | 无效方案不能凭低价取胜 | 胜负判定顺序中「资格」先于「成本」；低成本只在有效方案之间比较 |
| P4 | 优先比较经过验证的真实成本 | 官方 `calculate-price` 记录 > 裁判按数据集重算 > Agent 自述 |
| P5 | 无法完成官方核价 → 标注 **NOT_VERIFIED** | `priceStatus='not-verified'`，`price-not-verifiable` warning；不视为通过 |
| P6 | 同成本比营养/用户目标，速度为次级维度 | 字典序判定（§5） |
| P7 | 输入与数据版本一致才可比 | `experimentId` 由 (规则版本, 种子, 数据集指纹, 引擎版本, 验证结果) 派生（§7） |
| P8 | 确定性 | 纯函数、固定顺序、无随机源；同输入 → 同 `experimentId` 与同判定（实测耗时除外） |
| P9 | 可解释 | 每个分数带公式与证据引用；每条违规带 severity、message 与 evidenceRef |

---

## 2. 独立验证清单（verifyAgentProposal）

对每个 Agent 的提案逐项重算：

1. **提案存在性**：空提案 → `empty-proposal`（fatal）
2. **餐品真实性**：编码必须存在于当前数据集且 `available=true`
   - 不存在 → `unknown-item`（fatal）；不在售 → `unavailable-item`（fatal）
3. **数量合法性**：`qty` 必须为正整数 → `invalid-qty`（fatal）
4. **重复检测**：同一编码出现多行 → `duplicate-items`（fatal），数量口径不可信
5. **数据卫生**：数据集单价异常 → `invalid-price`（fatal）；Agent 申报单价与数据集不一致 → `invalid-price`（warning），**以数据集为准**
6. **成本独立重算**：小计 = Σ(数据集单价 × qty)（不采信 Agent 小计）
7. **配送费**：`scene='delivery'` 计 ¥5（`SCENE_DELIVERY_FEE_CENTS`，与 Agent 侧同源）
8. **优惠券逐张验证**（仅计入通过验证的券）：
   - 不存在 → `coupon-not-found`（fatal）
   - 满减券门槛未达 → `coupon-threshold-not-met`（fatal）
   - 商品券适用标签不匹配 → `coupon-not-applicable`（fatal）
   - 暂不支持的类型（percent-off / delivery-fee-off）→ `coupon-unsupported-type`（warning），不计入
   - 重复申报 → warning，仅计一次
   - 优惠金额用共享 `applyCoupons()` 引擎重算；与申报不一致 → `discount-mismatch`（warning），以重算值为准
9. **官方核价（优先）**：调用价格预言机（命中数据集内 `calculate-price` 记录）
   - 申报应付 == 官方 → `verified`
   - 不一致 → `mismatch`（warning），**以官方值为准**
   - 无记录/无预言机 → `not-verified` + `price-not-verifiable`（warning）→ 前端显式展示 **NOT_VERIFIED**
10. **硬约束**（任一不满足即 fatal）：
    - 人数覆盖：Σqty ≥ `people` → `people-not-covered`
    - 预算：裁决成本 ≤ `budgetCents` → `budget-exceeded`
    - 种类上限：distinct ≤ `maxDistinctItems` → `distinct-items-exceeded`
    - 必选餐品/标签/类别缺失 → `missing-required-code` / `missing-required-tag` / `missing-required-category`
11. **营养/用户目标达成率**：热量 0.4 / 蛋白质 0.4 / 钠 0.2 加权（按人数缩放）；缺数据 → `nutrition-data-missing`（warning），按已获得数据计算
12. **响应时间**：`responseMs` 直接取自 `AgentExecution.durationMs`（真实测量值）

输出：`AgentVerification`（经 `AgentVerificationSchema` 校验），含 `eligible / priceStatus / official|claimed|recomputed|effective 成本 / targetAchievement / responseMs / checks / violations`。

---

## 3. 五维评分（满分 100）

| 维度 | 满分 | 公式（输入全部为裁判重算值） |
|------|------|------------------------------|
| 需求满足度 | 30 | 裁判校验通过数 / 总校验数 × 30 |
| 预算控制 | 25 | 裁决成本 ≤ 预算：15 + 10×(1 − 成本/预算)；超支 0；无预算 15 |
| 营养均衡 | 20 | 目标达成率 × 20；无目标中性 10 |
| 优惠利用 | 15 | 裁判重算优惠 / 券前应付 × 15（封顶） |
| 可解释性 | 10 | 证据完整度 40% + 校验说明覆盖率 60% |

---

## 4. 成本口径优先级

```
officialCostCents（官方 calculate-price，verified 或 mismatch）
        ↓ 无官方记录
recomputedCostCents（裁判按数据集单价 + 券规则重算）
        ↓ 提案为空
null（无效方案，无成本可言）
```
裁决采用成本 `effectiveCostCents` = 官方值 ?? 重算值。

---

## 5. 胜负判定（字典序，先命中先返回）

```
① 资格：双方均 fatal → tie（无人胜出）；一方 fatal → 另一方胜（无效方案不能凭低价赢）
② 成本：双方均有官方记录 → 比较官方值
       仅一方有官方记录 → 该方胜（优先采信官方口径）
       双方均无 → 比较重算成本（costBasis=claimed-unverified）
③ 营养/用户目标达成率（同成本时，高者胜；无目标按 0 计）
④ 响应速度（真实测量值，最后手段；不写入具体毫秒数以保复现指纹稳定）
⑤ 全部一致 → tie
```

`costBasis`：双方均取得官方记录 → `official-verified`；否则 `claimed-unverified`。

---

## 6. 可解释输出

- `headline`：中文一句话结论，含胜者、比分与判定依据
- `notes`：规则版本、成本依据、NOT_VERIFIED 逐 Agent 说明、资格丧失原因、判定顺序、算法表现、可复现声明
- `verification[2]`：逐 Agent 验证报告（checks + violations + evidenceRef）
- `allViolations`：全部违规扁平汇总（含 agentId）
- `dimensions[5]`：每维公式 + 双方证据

---

## 7. 可复现实验 ID

```
experimentId = "exp_" + stableHash(stableStringify({
  rulesVersion, seed,
  dataset: { sourceRef, snapshotId, sha256, capturedAt },
  judgeEngine, 
  verification: [ Agent 资格/核验状态/各项成本/达成率/校验摘要/违规码 ]
}))
```
- 同 (规则, 种子, 数据集指纹, 引擎, 验证结果) → 同 ID
- `responseMs` 等实测值不参与派生
- 指纹同时进入 `canonicalizeMatch()`，保证整局 JSON 可复现比对

---

## 8. 测试覆盖（vitest，真实执行）

| 套件 | 用例数 | 覆盖 |
|------|--------|------|
| `test/verifier.test.ts` | 35 | 空结果、异常价格、重复商品、预算超支、优惠失效（不存在/门槛/标签/类型/重复申报）、数据缺失、官方核价三种状态、配送费、营养达成、确定性 |
| `test/judge.test.ts` | 31 | 独立验证不采信自述、资格硬门槛、成本三种比较路径、营养/速度次级维度、平局、experimentId 确定性与敏感性、allViolations、五维结构、无效参数、端到端对局 |

合计 **66 项阶段04 新增用例**（全库 132 项，全部通过）。
