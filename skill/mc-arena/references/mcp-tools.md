# 实际使用的麦当劳 MCP 工具（Skill 参考）

来源：官方仓库 M-China/mcd-mcp-server（README 更新至 2026-10-01）。本清单描述被 McArena 引用的只读工具；以仓库实测 schema 快照为准。

| 工具 | 官方描述 | McArena 用途 |
|---|---|---|
| now-time-info | 获取当前时间信息 | 任务卡时间锚 |
| query-nearby-stores | 查询附近可用门店 | 比赛门店选择 |
| query-meals | 查询当前可售卖的餐品列表 | 菜单数据 |
| query-meal-detail | 查询餐品详情 | 套餐组成与替换选项 |
| calculate-price | 商品价格计算 | 唯一计价权威（金额/配送费/优惠/应付总价） |
| query-store-coupons | 查询当前门店可用优惠券列表 | 优惠利用维度 |
| list-nutrition-foods | 餐品营养信息列表 | 营养均衡维度（能量/蛋白质/脂肪/碳水/钠） |
| campaign-calendar | 活动日历查询 | 主题任务卡素材 |

接入：Streamable HTTP，`https://mcp.mcd.cn`，`Authorization: Bearer <token>`；限流 600 次/分钟。
McArena 只使用上表中的**只读**工具，并对写操作（下单、支付、账户变更等）做黑名单拦截。

## 当前接入状态（重要，请勿在解说中美化）

| 项目 | 状态 | 说明 |
|---|---|---|
| MCP 客户端适配器 | ✅ 已实现 | Streamable HTTP + JSON-RPC + SSE 解析 + 限流 + 重试（`packages/mcd-mcp-client`） |
| 官方 Token | ❌ 未申请 | 申请需手机号验证登录 + 人机验证，AI 无法代办；因此 `live` 模式暂不可用 |
| 官方数据快照 | ❌ 仓库暂无 | `snapshots/` 仅有 README，无快照文件；因此 `replay` 不可用 |
| 场景数据集（mock） | ✅ 可用 | `buildScenarioDataset()`，**明确标注「非麦当劳官方数据」** |

因此本技能默认 `--mode auto`：有官方快照时优先使用，否则回退场景数据集，
并在结果中通过 `dataOrigin` 与 `warnings` 显著标注数据来源。
**不得**把 mock 数据描述为官方数据，也不得编造 `verified` 核价状态。

