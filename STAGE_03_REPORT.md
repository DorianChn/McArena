# 阶段03 报告：双 Agent 竞技引擎

> 项目：McArena（麦门 AI 竞技场）
> 阶段：P2 — 双 Agent 竞技引擎
> 完成时间：2026-10-14
> 验收状态：**全部通过**（8 个官方测试场景 + 状态机 + 可复现性 + 结构化校验）

---

## 1. 本阶段交付内容

| # | 交付物 | 位置 | 状态 |
|---|--------|------|------|
| 1 | Agent A「极速猎手」（Speed Agent） | `packages/arena-core/src/engine/agents/speed-agent.ts` | ✅ |
| 2 | Agent B「深度优化师」（Optimizer Agent） | `packages/arena-core/src/engine/agents/optimizer-agent.ts` | ✅ |
| 3 | Agent 执行状态机（取消/超时/恢复/校验） | `packages/arena-core/src/engine/agent-runner.ts` | ✅ |
| 4 | 共享决策基础设施（证据/收尾/兜底） | `packages/arena-core/src/engine/agent-utils.ts` | ✅ |
| 5 | 8 个官方测试场景 + 基准对比 | `packages/arena-core/src/engine/scenarios.ts` | ✅ |
| 6 | 中文 CLI（match/bench/timeout/cancel） | `packages/arena-core/src/cli/demo.ts` | ✅ |
| 7 | 契约扩展（指标/类别约束/SSE 决策事件） | `packages/shared/src/contracts/*` | ✅ |
| 8 | API 接线（真实引擎 + 降级恢复策略） | `apps/api/src/services/*`、`apps/api/src/server.ts` | ✅ |
| 9 | 前端决策过程展示 | `apps/web/src/components/AgentCard.tsx` | ✅ |
| 10 | 测试套件（66 项） | `packages/arena-core/test/{agents,agent-runner,benchmark}.test.ts` | ✅ |

---

## 2. 双 Agent 设计：真实不同的决策算法

两个 Agent 接收**完全相同的挑战与数据集**，但使用**实质不同的决策算法**，均为算法型 Agent（未配置大模型，已在引擎标识与阶段轨迹中明确标注「算法型 Agent，未调用大模型」）。

| 维度 | Agent α「极速猎手」 | Agent β「深度优化师」 |
|------|--------------------|----------------------|
| 引擎标识 | `speed-greedy@1.0.0` | `optimizer-search@1.0.0` |
| 算法 | 单遍贪心构造 | 束搜索 + 多候选组合比较 |
| 复杂度 | O(n log n) | O(轮数 × 束宽 × n)，轮数 = 人数 + 2 |
| 目标 | 硬约束满足下应付总价最小 | 约束满足率 → 营养偏差 → 价格的字典序最优 |
| 候选评估数 | **恒为 1** | 实际统计（实测 46–288 个） |
| 工具调用 | 1 次（对自己唯一的购物车计价） | 对预筛出的前 6 个候选逐一真实计价 |
| 约束处理 | 构造时逐条安置 | 渐进式剪枝 + 构造后修复（必选项/标签/类别/人数） |
| 结果特征 | 便宜、即时、可预测 | 营养更均衡、更会用券、通常更贵 |

**公平性保证**：两个 Agent 共用同一套优惠券引擎（`applyCoupons`）、同一套提案收尾流程（`finalizeProposal`）、同一套约束自检（`buildConstraintChecks`）、同一个价格预言机接口；裁判对两者使用同一套五维公式。差异只来自决策算法本身。

**没有硬编码赢家**：胜负完全由 `RuleBasedJudge` 的五维打分（需求满足 30 / 预算控制 25 / 营养均衡 20 / 优惠利用 15 / 可解释性 10）实时计算得出。基准测试中 α 胜 2 场、β 胜 3 场、平 3 场，证明结果随场景变化而非固定。

---

## 3. 8 个官方测试场景实测结果

数据来源：`scenario://stage03-fixtures`（10 项测试餐品 + 2 张券的模拟数据集），种子 1，命令 `npm run bench`。所有数值均为一次真实执行的实测值，无估算。

### 3.1 逐场景对比

| 场景 | 期望 | α 有效 | β 有效 | α 费用 | β 费用 | 裁判分（α : β） | 胜者 |
|------|------|--------|--------|--------|--------|-----------------|------|
| 20 元预算 | 有解 | ✅ | ✅ | ¥15.00 | ¥15.00 | 67.5 : 67.5 | 平 |
| 30 元预算 | 有解 | ✅ | ✅ | ¥12.00 | ¥14.00 | 71.0 : 70.3 | α |
| 50 元预算 | 有解 | ✅ | ✅ | ¥24.00 | ¥47.00 | 76.2 : 75.6 | α |
| 双人套餐 | 有解 | ✅ | ✅ | ¥30.00 | ¥33.00 | 75.0 : 75.0 | 平 |
| 指定蛋白质目标 | 有解 | ✅ | ✅ | ¥12.00 | ¥32.00 | 66.8 : 77.0 | β |
| 指定商品类别 | 有解 | ✅ | ✅ | ¥45.00 | ¥29.00 | 65.0 : 68.6 | β |
| 优惠券组合 | 有解 | ✅ | ✅ | ¥31.00 | ¥29.00 | 72.9 : 73.4 | β |
| 没有有效解 | 无解 | ❌（如实） | ❌（如实） | — | — | 42.5 : 42.5 | 平 |

**「没有有效解」场景说明**：必选 ¥15 汉堡 + 预算 ¥5 + 2 人。双方都输出尽力而为的方案并把「预算约束」自检标记为未满足——不伪造可行解（`agents.test.ts` 中断言了这一点）。

### 3.2 汇总指标

| 指标 | Agent α 极速猎手 | Agent β 深度优化师 | 说明 |
|------|------------------|--------------------|------|
| 有效率 | 88%（7/8） | 88%（7/8） | 唯一未生效场景即设计上的无解场景 |
| 平均费用 | ¥24.14 | ¥28.43 | α 的贪心压价策略有效 |
| 约束满足度 | 96.9%（31/32） | 96.9%（31/32） | 唯一未满足项来自无解场景 |
| 平均耗时 | 2.50 ms | 3.00 ms | 真实测量（本数据集规模小，差异尚未拉开） |
| 峰值耗时 | 7 ms | 6 ms | 真实测量 |
| 平均工具调用 | 1.00 次 | 4.75 次 | β 对多个候选逐一计价 |
| 平均候选数 | 1 个 | 134.13 个 | 算法本质差异的直接证据 |
| 胜场 | 2 | 3 | 另有 3 场平局 |

### 3.3 结论

1. **α 赢在成本**：5 个有预算场景中，α 的费用都不高于 β（30/50 元预算场景优势明显），在预算敏感的裁判维度上占优。
2. **β 赢在质量**：蛋白质目标场景蛋白质达成率显著高于 α；商品类别场景找到更便宜的合规方案（¥29 vs ¥45）；优惠券场景用券更充分。
3. **无解场景双方都诚实失败**：没有出现「为了产出方案而违反硬约束并隐瞒」的情况。

---

## 4. 执行状态机（取消 / 超时 / 失败恢复）

实现于 `engine/agent-runner.ts`，独立于编排器，单个 Agent 的生命周期：

```
idle → running → succeeded
                → failed       （异常；propagate 模式原样抛出）
                → timeout     （deadline 到点，即使之后跑完也按超时处理）
                → cancelled   （外部 AbortSignal，不恢复）
```

| 能力 | 实现 | 测试 |
|------|------|------|
| 取消执行 | 外部 `AbortSignal`；已中止信号立即返回 `CANCELLED`；执行中取消由 Agent 安全检查点配合中断 | `agent-runner.test.ts` 2 项 |
| 超时 | deadline 到点 abort；**即使 Agent 之后自行跑完也按超时处理**（截止时间是硬契约） | 2 项 |
| 失败恢复 | `recovery: 'recover'` 时切换确定性降级方案（满足硬约束的最便宜组合），`proposal` 保留、`recovery.used=true`、错误证据入链 | 2 项 |
| 严格模式 | `recovery: 'propagate'`（默认）超时抛 `AgentTimeoutError`、异常原样抛出 | 2 项 |
| 结构化校验 | 所有路径产出均过 `AgentExecutionSchema.parse` | `agents.test.ts` 1 项 |
| 过程事件 | `onEvent` 回调实时上报 `started` / `phase` / `evidence` → SSE | 1 项 |

**恢复结果的诚实标注**：降级恢复的提案在 `AgentExecution.recovery = { used: true, reason }` 中标记，证据链含 `error` 类型记录，裁判结论中也会点名「输出为降级恢复方案，不代表常规策略水平」，前端显示 ⚠ 角标。恢复方案**不会**被伪装成正常推理结果。

---

## 5. 可复现性与可溯源性

- **固定种子可复现**：`RuleEngine.generateTaskCard(seed, dataset)` 生成任务卡；相同 (种子, 数据集, 引擎版本) 的比赛，其 `canonicalizeMatch` 指纹完全一致（测试：`apps/api/test/api.test.ts`、`agents.test.ts`）。
- **指纹剔除易变量**：时间戳与真实耗时（`durationMs`）不进入指纹；候选数、工具调用、提案、证据内容进入指纹。
- **决策过程全链路可溯源**：每个 Agent 记录 `phases`（状态机阶段轨迹）、`evidence`（含数据来源/选择/搜索/评估/价格/约束校验）、`toolCalls`（工具名 + 参数 + 命中与否 + 结果摘要）。价格一律来自数据集内的官方计价记录或按官方单价与券规则折算，并在证据中显式说明走了哪条路径。

---

## 6. 验证结果（全部真实执行）

| 检查项 | 命令 | 结果 |
|--------|------|------|
| 类型检查 | `npm run typecheck` | ✅ 0 错误（6 个工作区） |
| 代码规范 | `npm run lint` | ✅ 0 错误（24 条 warning：CLI 的 console 与既有 zod `any` 告警，均已评估接受） |
| 单元/集成测试 | `npx vitest run` | ✅ **66/66 通过**（8 个测试文件） |
| 构建 | `npm run build` | ✅ tsup + vite 构建成功 |
| CLI 演示 | `npm run demo` / `bench` / `timeout` / `cancel` | ✅ 中文战报、对比表、超时恢复、取消均符合预期 |
| API 冒烟 | `POST /api/match`、`GET /api/snapshot`、SSE 流、404/400 | ✅ 契约校验通过，SSE 输出 25 条 agent.step + 14 条 agent.phase + 2 条 agent.completed |

新增测试分布：

| 测试文件 | 用例数 | 覆盖 |
|----------|--------|------|
| `agents.test.ts` | 14 | 8 场景 × 双 Agent、算法差异、确定性、结构化校验、算法型标注 |
| `agent-runner.test.ts` | 9 | 超时（恢复/propagate/按时完成）、取消（已中止/执行中）、失败恢复、过程事件 |
| `benchmark.test.ts` | 4 | 场景清单完整性、单场景五类指标、汇总统计、中文格式化 |
| `orchestrator.test.ts` | 4 | 既有 mock 引擎联调（保持通过） |
| `apps/api/test/api.test.ts` | 10 | 真实引擎下的 API 契约、复现性、错误路径、SSE |

---

## 7. 数据来源与阻塞项（如实披露）

| 项 | 状态 | 说明 |
|----|------|------|
| MCP Token | **BLOCKED** | `.env` 未配置 `MCD_MCP_TOKEN`，实时官方数据通道未启用 |
| 本阶段数据来源 | 模拟数据 | 场景数据集 `scenario://stage03-fixtures` 为明确标注的模拟夹具（`dataOrigin: 'mock'`），赛事结果与对外材料中均带「非麦当劳官方数据」警示 |
| 官方 MCP 接入 | 已有实现，未启用 | `HttpMcpAdapter`（Streamable HTTP + 只读白名单 + 429 退避 + 限流）就绪；取得 Token 后 `MCD_MCP_MODE=live/replay` 即可在本竞技引擎上跑真实数据 |
| 写操作工具 | 已禁用 | `create-order`/`cancel-order` 等一律拒绝，未发生任何下单/支付/账户操作 |

**取得 Token 后的验收路径（无需改代码）**：`MCD_MCP_MODE=replay` 放入官方快照 → `npm run bench` 即在真实官方数据上复现本报告全部指标。

---

## 8. 下一阶段（P3）接口预留

- `MatchStreamEvent` 已扩展 `agent.started` / `agent.phase` / `agent.failed` / 带指标的 `agent.completed`，前端可直接做实时决策流。
- `AgentExecution` 的 `durationMs` / `candidateCount` / `toolCallCount` / `toolCalls` / `phases` / `recovery` 已进入共享契约，排行榜与回放页面可直接消费。
- `runBenchmark()` 返回结构化 `BenchmarkReport`（含 `AgentBenchmarkSummary`），可作为「算法排行榜」数据源。
- 若后续接入大模型 Agent：实现 `AgentEngine` 接口并保证 `decide()` 产出经过 `AgentExecutionSchema` 校验即可复用全部状态机、裁判与可视化能力；引擎标识需显式声明模型来源。
