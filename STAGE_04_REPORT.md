# STAGE_04_REPORT.md — 阶段04：独立智能裁判系统

> 执行时间：2026-10-14 ｜ 引擎：`rule-based@1.0.0` ｜ 规则版本：`judge-rules/1.1.0`
> 前置阶段成果（阶段01–03）未破坏：测试、类型检查、Lint、构建、API 冒烟全部通过。

---

## 1. 交付物清单

| 文件 | 说明 |
|------|------|
| `packages/arena-core/src/engine/verifier.ts` | **新建**：独立验证器 `verifyAgentProposal()`，裁判不信任 Agent 自述，全部重算 |
| `packages/arena-core/src/engine/judge.ts` | **重写**：`RuleBasedJudge` 阶段04 版（独立验证 → 五维评分 → 字典序判定 → 可解释输出） |
| `packages/shared/src/contracts/match.ts` | 契约扩展：`Violation` / `Check` / `PriceVerificationStatus` / `AgentVerification` / `CostBasis`；`JudgeResult` 新增 `rulesVersion/experimentId/costBasis/verification/allViolations`；`canonicalizeMatch` 同步 |
| `packages/arena-core/test/verifier.test.ts` | **新建**：35 项验证器用例 |
| `packages/arena-core/test/judge.test.ts` | **新建**：31 项裁判规则用例 |
| `packages/arena-core/src/mock/mock-engines.ts` | `MockJudgeEngine` 补齐阶段04 契约字段（明确标注为脚手架） |
| `packages/arena-core/src/cli/demo.ts` | 战报新增「独立验证」摘要（资格/核价状态/三方成本对比/实验 ID） |
| `apps/web/src/components/JudgePanel.tsx` | 前端新增独立验证报告卡片（NOT_VERIFIED 高亮、违规与证据引用、三方成本对比） |
| `JUDGE_SPEC.md` | **新建**：裁判系统规范 |
| `STAGE_04_REPORT.md` | 本文件 |

---

## 2. 十项必须实现 → 实现映射

| # | 要求 | 实现 |
|---|------|------|
| 1 | 检验推荐商品真实存在于当前有效数据 | `unknown-item` / `unavailable-item`（fatal）+ 「餐品存在且在售」check |
| 2 | 检验预算限制 | 以**裁决成本**（官方 > 重算）判定，`budget-exceeded`（fatal） |
| 3 | 检验人数与商品数量 | Σqty ≥ people → `people-not-covered`（fatal）；`invalid-qty` |
| 4 | 检验营养约束 | 热量0.4/蛋白0.4/钠0.2 加权达成率（按人数缩放），数据缺失标 warning |
| 5 | 检验优惠券使用条件 | 逐张验券：存在/门槛/适用标签/类型，`verifyCoupons()` |
| 6 | 优先官方 calculate-price 验证实际应付价 | 价格预言机 → `verified` / `mismatch`（以官方值为准） |
| 7 | 无法官方核价 → 标注 NOT_VERIFIED | `priceStatus='not-verified'` + `price-not-verifiable` warning + 前端红色高亮 |
| 8 | 计算有效性/成本/综合得分 | `eligible`；`official/claimed/recomputed/effective` 四方成本；五维百分制 |
| 9 | 计算实际响应时间 | `responseMs` = `AgentExecution.durationMs`（真实测量，不写入复现指纹） |
| 10 | 自动判定赢家或平局 | 字典序判定（资格→官方成本→重算成本→营养→速度→平局） |

评分机制 6 条全部落地：约束硬性（fatal 失格）｜无效方案不能低价赢（资格先于成本）｜优先已验证真实成本｜同成本比营养/目标｜速度次级｜输入数据版本一致（experimentId 绑定数据集指纹）。

---

## 3. 真实验证结果

### 3.1 测试（全部真实执行，未伪造）

```
Test Files  10 passed (10)
     Tests  132 passed (132)
```

- 阶段04 新增：**66 项**（verifier 35 + judge 31），满足「不少于 50 个有效自动化测试用例」
- 阶段01–03 既有：66 项，全部保持通过（无回归）
- 覆盖用户指定场景：空结果 ✓ 异常价格 ✓ 重复商品 ✓ 预算超支 ✓ 优惠失效（不存在/门槛/标签/不支持类型/重复申报）✓ 数据缺失（营养/官方核价）✓ 平局 ✓ 无效参数 ✓ 确定性 ✓

### 3.2 类型检查 / Lint / 构建

```
typecheck：0 错误（5 个 workspace 全部通过）
lint：0 错误 / 26 warning（均为既有代码的历史 warning，阶段04 新增代码 0 warning）
build：shared → mcd-mcp-client → arena-core → api → web 全部成功（web 产物 226.96 kB / gzip 66.83 kB）
```

### 3.3 CLI 真实战报（`npx tsx src/cli/demo.ts match 7`）

```
任务卡：1 人外送 · 预算 ¥30
【极速猎手】speed-greedy@1.0.0｜应付 ¥11.00｜有效解：是｜耗时 3ms｜候选 1｜工具调用 1
【深度优化师】optimizer-search@1.0.0｜应付 ¥17.50｜有效解：是｜耗时 20ms｜候选 129｜工具调用 6

裁判结论：极速猎手以 63.6 : 74.5 胜出（满分 100）——双方均无官方核价记录（NOT_VERIFIED），
          按裁判重算成本比较，α更低（¥11.00 : ¥17.50）
独立验证（实验 exp_0978a2a0db5d208f｜成本依据 claimed-unverified）：
  α｜资格 通过｜NOT_VERIFIED｜官方 —｜自述 ¥11.00｜裁决 ¥11.00｜实测 3ms
  β｜资格 通过｜NOT_VERIFIED｜官方 —｜自述 ¥17.50｜裁决 ¥17.50｜实测 20ms
```

### 3.4 8 场景基准（`bench 1`，裁判为阶段04 版）

| 场景 | α 有效/费用 | β 有效/费用 | 裁判（α:β） | 胜者 |
|------|------------|------------|-------------|------|
| 20 元预算 | 是 ¥15.00 | 是 ¥15.00 | 67.5 : 67.5 | β |
| 30 元预算 | 是 ¥12.00 | 是 ¥14.00 | 68.3 : 67.6 | α |
| 50 元预算 | 是 ¥24.00 | 是 ¥47.00 | 58.7 : 72.9 | α |
| 双人套餐 | 是 ¥30.00 | 是 ¥33.00 | 68.2 : 70.1 | α |
| 蛋白质目标 | 是 ¥12.00 | 是 ¥32.00 | 58.9 : 74.3 | α |
| 商品类别 | 是 ¥45.00 | 是 ¥29.00 | 62.5 : 66.1 | β |
| 优惠券组合 | 是 ¥31.00 | 是 ¥29.00 | 70.6 : 71.1 | β |
| 没有有效解 | 否 ¥30.00 | 否 ¥30.00 | 45 : 45 | **平局（双方致命违规）** |

汇总：有效率 α 88%(7/8) / β 88%(7/8)；平均费用 α ¥24.14 / β ¥28.43；约束满足度均 96.9%；
平均耗时 α 2.88ms / β 2.75ms；平均工具调用 α 1 / β 4.75；胜场 α 4 / β 3（平局 1）。

「没有有效解」场景中，旧版裁判会凭分数差宣布胜者；阶段04 裁判识别双方均存在致命违规（预算超支 + 必选餐品负担超限），正确判定平局并说明原因——体现 P2/P3 原则。

### 3.5 确定性复现

- `experimentId` 对相同 (规则, 种子, 数据集指纹, 引擎, 验证结果) 完全一致，数据集 sha256 变化即改变
- `canonicalizeMatch()` 指纹跨两次完整对局一致（API 测试 `相同 seed → 相同复现内容` 通过）
- 实测耗时不进入指纹与实验 ID（speed 破平分支也不写毫秒数）

---

## 4. 遵守的红线

- 裁判不采信 Agent 自述：`proposal.constraintChecks`、`proposal.totalCents` 均只作为「申报值」出现在验证报告中供对照，不作为评分与胜负依据（测试：虚报 Agent 案例）。
- 未虚构任何官方接口：`calculate-price` 仅通过价格预言机读取数据集内已录制记录；无记录即 NOT_VERIFIED，绝不算作通过。
- 未硬编码赢家、未编造推理日志：胜负由 `decideWinner()` 纯函数按固定字典序产生；结论中的比分、成本、达成率全部来自当次重算。
- 无 Token 写入源码；mock 数据全程标注（`MOCK_DATA_WARNING` / `dataOrigin=mock`）。

---

## 5. 已知限制与阻塞项

| # | 事项 | 状态 |
|---|------|------|
| B1 | 麦当劳 MCP Token 未申请，live `calculate-price` 无法实测 | **BLOCKED**（不影响开发：本地快照/模拟数据集上 `verified/mismatch/not-verified` 三条路径均已实现并通过测试） |
| B2 | GitHub 公开仓库未创建 | **BLOCKED**（阶段03 起按要求不上传，待报名截止前统一处理） |
| L1 | `percent-off` / `delivery-fee-off` 类型券暂不自动核验 | 已按 `coupon-unsupported-type`（warning）明确标注，不计入优惠 |
| L2 | 速度破平依赖实测耗时 | 已在规范中声明：仅当全部确定性维度持平时触发；指纹与实验 ID 不受影响 |

---

## 6. 下一步（阶段05 建议）

1. 前端逐项展开裁判 `checks`（证据引用下钻）；
2. 申请 MCP Token 后在 replay/live 模式回归 `verified/mismatch` 路径；
3. 裁判规则版本化管理（`rulesVersion` 变更即新实验）；
4. 可选：裁判自身评分权重的敏感性实验（固定种子下扫描权重组合）。
