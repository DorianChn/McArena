# MCP 集成说明（MCP_INTEGRATION.md）

> 本文档说明 McArena 实际使用的麦当劳 MCP Server、工具、调用流程与业务价值。
> 官方来源：[mcd-mcp-server](https://github.com/M-China/mcd-mcp-server) ｜ 更新于 2026-10-14，工具行为以实测 schema 快照为准（见下文「实测校验」）。

## 1. MCP Server

| 项 | 值 |
|---|---|
| 名称 | 麦当劳中国 MCP Server |
| 接入地址 | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 鉴权 | 请求头 `Authorization: Bearer <MCP_MCP_TOKEN>`（Token 经 [open.mcd.cn/mcp](https://open.mcd.cn/mcp) 手机号登录后申请） |
| 限流 | 每 Token 600 次/分钟；超限返回 429；无效 Token 返回 401 |
| 版本沿革 | 官方仓库记录至 v1.0.9（2026-09-10，新增取消订单、餐具选择、取餐柜二维码） |

项目内配置示例见 [`mcp-config.example.json`](mcp-config.example.json)，仅含 `${MCD_MCP_TOKEN}` 环境变量占位符。

## 2. 实际使用的工具

| 工具名 | 官方描述 | 在 McArena 中的用途 |
|---|---|---|
| `now-time-info` | 获取当前时间信息 | 任务卡生成时锚定「当前时间窗」，保证不同时间点赛事可比 |
| `query-nearby-stores` | 查询附近可用门店 | 选定比赛门店（数据快照的一部分） |
| `query-meals` | 查询当前可售卖的餐品列表 | 菜单数据：分类、餐品编码、标签 |
| `query-meal-detail` | 查询餐品详情 | 套餐组成与可替换选项，Agent 组套餐的依据 |
| `calculate-price` | 商品价格计算 | **唯一的计价权威**：商品金额、配送费、优惠、应付总价；两个 Agent 均不得自估价格 |
| `query-store-coupons` | 查询当前门店可用的优惠券列表 | 优惠利用维度的数据来源 |
| `list-nutrition-foods` | 餐品营养信息列表 | 营养均衡维度：能量、蛋白质、脂肪、碳水、钠 |
| `campaign-calendar` | 活动日历查询 | 任务卡的「场景彩蛋」：结合当月活动生成主题约束 |

### 不使用（及原因）

| 工具 | 原因 |
|---|---|
| `create-order` / `cancel-order` / `mall-create-order` / `party-order-create` | **写操作，会产生真实业务副作用**；McArena 定位为决策竞技与演示，三重黑名单默认拦截 |
| `query-my-coupons` / `query-my-account` / `query-my-prizes` / `order-list` / `mall-order-*` | 依赖个人账号数据，不可复现且涉及隐私，违背「可复现」核心设计 |
| `delivery-query-addresses` / `delivery-create-address` | 同上，且为写操作 |

## 3. 调用流程

```
[a] 快照采集（实时模式 / 发布前执行）
    mcd-mcp-client.initialize()
      → tools/list                      # 记录工具清单与 schema（实测校验）
      → now-time-info                   # 采集时间锚
      → query-nearby-stores             # 门店候选
      → query-meals / query-meal-detail# 菜单与详情
      → query-store-coupons             # 门店优惠券
      → list-nutrition-foods            # 营养数据
      → campaign-calendar                # 当月活动
      → calculate-price                  # 对若干代表性购物车取样计价（供裁判校准）
      → 原子落盘 snapshots/<id>/ + manifest.json（逐文件 sha256）

[b] 一局比赛（replay 默认 / live 可选）
    RuleEngine.generateTaskCard(seed)
      → Agent α / Agent β 基于 snapshot 决策
      → Judge 基于 snapshot + calculate-price 结果打分
      → MatchRecord（含 snapshotHash、engineVersion、seed）
```

错误处理：`401` 立即中止并提示申请/检查 Token；`429` 指数退避（基线 1s，封顶 30s，抖动 ±20%），客户端内置分钟级请求计数器确保远低于 600 次/分钟上限。

## 4. 业务价值

1. **把 MCP 从「聊天调工具」升级为「可评测的智能体竞赛」**：证明 MCP 数据足以支撑确定性、可复现的多智能体决策，而不只是问答。
2. **裁判与快照机制可直接迁移**：任何基于 MCP 的决策类 Skill 都可复用「快照录制 + 规则裁判 + 证据链」三件套，用于回归测试与公平评测。
3. **教学与传播价值**：中文界面 + 雷达图 + 决策时间轴，让「Agent 如何点餐」变得肉眼可见。

## 5. 实测校验记录

| 日期 | 校验项 | 结果 |
|---|---|---|
| 2026-10-14 | 官方 README 工具清单（34 项）与规则文档 | 已核对，见上方表格 |
| 2026-10-14 | MCP 协议层对拍（initialize / tools/list / tools/call、401/429/SSE 解析） | ✅ 假服务器契约测试 13 项通过 |
| 2026-10-14 | 双 Agent 竞技引擎在**数据集驱动**下的完整闭环（阶段03） | ✅ `npm run bench` 8 场景通过，见 STAGE_03_REPORT.md |
| 待 P1-4 | 真实 Token 环境 `tools/list` 实测 schema | ⬜ **BLOCKED（B1）**：采集后回填（差异记录写入本节） |

> 说明：在上述实测完成前，代码中的工具参数以官方 README 描述为准编写，字段命名在实测校验后按实际 schema 校正；未经验证的参数不会被硬编码进生产逻辑。
>
> 阶段03 双 Agent 引擎已在数据结构上与官方 MCP 输出解耦：只要把 `scenario://stage03-fixtures` 数据集替换为 `replay`/`live` 模式产出的官方数据集，`npm run bench` 与 `npm run demo` 无需任何代码改动即可在真实官方数据上复现全部对比指标。
