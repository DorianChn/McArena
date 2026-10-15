# MCP 集成说明（MCP_INTEGRATION.md）

> 本文档说明 McArena 中实现的麦当劳 MCP 客户端、目标工具调用流程与业务价值。下列调用流程和工具参数依据官方公开文档整理；项目尚未取得 MCP Token，未对真实 Server 完成联调，也没有实测 schema 快照。
> 官方来源：[mcd-mcp-server](https://github.com/M-China/mcd-mcp-server) ｜ 文档更新于 2026-10-15；真实 schema 校验状态见下文「实测校验」。

## 1. MCP Server

| 项 | 值 |
|---|---|
| 名称 | 麦当劳中国 MCP Server |
| 接入地址 | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 鉴权 | 请求头 `Authorization: Bearer <MCD_MCP_TOKEN>`（Token 经 [open.mcd.cn/mcp](https://open.mcd.cn/mcp) 手机号登录后申请） |
| 限流 | 每 Token 600 次/分钟；超限返回 429；无效 Token 返回 401 |
| 版本沿革 | 官方仓库记录至 v1.0.9（2026-09-10，新增取消订单、餐具选择、取餐柜二维码） |

项目内配置示例见 [`mcp-config.example.json`](mcp-config.example.json)，仅含 `${MCD_MCP_TOKEN}` 环境变量占位符；其结构与官方 WorkBuddy 开发指南公布的连接器配置一致（`type: streamablehttp` + `url` + `Authorization: Bearer <Token>` 请求头）。

## 2. 计划接入的工具及代码用途

客户端实现了这些只读工具的调用路径和协议层处理；由于尚无 MCP Token，尚不能声称已从官方 Server 成功调用或取得真实业务数据。

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

## 3. 目标调用流程（真实联调待完成）

下列流程描述已实现的客户端路径与预期数据流，不代表已成功对接官方 Server。真实响应的 schema 映射和比赛快照组装尚待 Token 联调后完成。

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
| 2026-10-15 | 快照采集工具 `tools/snapshot-capture.ts` 落成（只读序列 + 原始响应落盘 + manifest sha256） | ✅ 采集模块 4 项单测 + 落盘 3 项单测通过；CLI 退出码实测（3=无 Token / 2=用法错误） |
| 待 P1-4 | 真实 Token 环境 `tools/list` 实测 schema | ⬜ **BLOCKED（B1）**：Token 到位后执行 `MCD_MCP_TOKEN=<token> tsx tools/snapshot-capture.ts`，采集后回填（差异记录写入本节） |

> 说明：在上述实测完成前，代码中的工具参数以官方 README 描述为准编写，字段命名在实测校验后按实际 schema 校正；未经验证的参数不会被硬编码进生产逻辑。
>
> **采集工具设计约束（不伪造字段）**：`tools/snapshot-capture.ts` 只落盘**原始响应**与 manifest（逐文件 sha256），不做任何字段映射——官方返回 schema 未经真实 Token 实测前，把响应映射成 `MCPDataSnapshot` 属于猜测字段。类型化快照组装待 P1-4 校验后按实测 schema 进行（P1-6），manifest 中 `mappingVerified` 恒为 false。
>
> 阶段03 双 Agent 引擎已在数据结构上与 MCP 客户端解耦。真实响应尚未映射为 `MCPDataSnapshot`；需要先按真实 schema 完成映射与快照组装，再验证 `replay`/`live` 数据上的比赛结果。当前 `npm run demo` 与 `npm run bench` 使用明确标注的场景模拟数据。
