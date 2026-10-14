# McArena 技术架构（ARCHITECTURE）

> 版本 v1.0 ｜ 2026-10-14 ｜ 原则：可复现 > 可解释 > 可扩展；比赛截止前真实可运行优先。

---

## 1. 总览

```
┌────────────────────────────────────────────────────────────────┐
│                         使用者 / 评审                            │
┌───────────┐   ┌──────────────────────────┐   ┌───────────────┐ │
│ apps/web  │   │  WorkBuddy Skill (壳)     │   │   CLI / CI    │ │
│ React+TS  │   │  skill/mc-arena/SKILL.md  │   │  npm test     │ │
└─────┬─────┘   └────────────┬─────────────┘   └───────┬───────┘ │
      │ REST + SSE           │ 调用脚本                 │ 调用     │
┌─────▼──────────────────────▼─────────────────────────▼───────┐ │
│                        apps/api (Fastify)                      │ │
│         编排：实时模式(MCP) / 演练模式(快照回放)                  │
└─────┬──────────────────────────────────┬─────────────────────┘ │
      │                                  │                         │
┌─────▼──────────────┐      ┌───────────▼──────────────┐         │
│ packages/arena-core│      │ packages/mcd-mcp-client  │         │
│ 规则/双Agent/裁判   │      │ MCP Streamable HTTP 客户端│         │
│ (纯函数, 零网络)    │      │ initialize/list/call+重试 │         │
└─────┬──────────────┘      └───────────┬──────────────┘         │
      │ shared 契约 (zod)               │                          │
┌─────▼─────────────────────────────────▼──────────────────────┐ │
│  packages/shared (类型+schema)      snapshots/ (录制的真实数据) │ │
└───────────────────────────────────────────────────────────────┘ │
                              │ HTTPS
                    ┌─────────▼──────────┐
                    │ https://mcp.mcd.cn │  麦当劳官方 MCP Server
                    │ Bearer <TOKEN>     │  (仅实时模式)
                    └────────────────────┘
```

## 2. 技术选型与决策记录（ADR）

| 决策点 | 选择 | 理由 | 放弃的替代 |
|---|---|---|---|
| 包管理 | npm workspaces | 环境已装 npm 10.9.7；无需引入 pnpm 全局 | pnpm（未安装） |
| MCP 客户端 | 自研轻量 Streamable HTTP 客户端（fetch + JSON-RPC） | 协议简单（POST + SSE 可选）；透明可审计；不受 SDK 版本漂移影响 | @modelcontextprotocol/sdk（依赖重，评审期难审） |
| 后端框架 | Fastify + TypeScript | 性能好、schema 校验原生、SSE 简单 | Express（生态旧）、Nest（过重） |
| 前端 | React 18 + Vite + TypeScript + ECharts | 中文图表丰富、雷达图开箱即用；Vite 秒启动 | Next.js（SSR 无必要）、D3（开发慢） |
| 数据回放 | JSON 快照 + manifest(sha256) | 保证无 Token/限流/评审环境可复现 | Mock 造假数据（违背"真实数据"要求） |
| Agent 智能 | 确定性策略算法（贪心+约束求解） | 可复现、可解释、零外部依赖 | 调用外部 LLM API（需额外 Key、不可复现，列为 v2） |
| 实时推送 | SSE | 单向足矣、断线重连简单 | WebSocket（双向无必要） |
| 测试 | Vitest | 与 Vite 同生态、TS 原生 | Jest（配置重） |

## 3. 模块设计

### 3.1 packages/shared —— 数据契约（单一事实来源）

```ts
// 核心类型（zod schema 同源生成 TS 类型）
MenuSnapshot      // 一局比赛可用的全部官方数据：门店、菜单、餐品详情、价格结果、优惠券、营养、活动、时间
TaskCard          // 任务卡：budgetCents / people / scene(dineIn|takeaway|delivery) / constraints
DecisionTrace     // 一名 Agent 的决策过程：候选筛选→逐项理由→最终购物车
MatchConfig       // { taskCard, seed, dataSource: {mode:'replay'|'live', snapshotId?} }
MatchRecord       // 比赛全过程：双方 trace + verdict + snapshotHash + engineVersion
Verdict           // 裁判结论：五维得分、加权总分、胜者、逐项解释文字
```

规则：契约变更必须同步 `packages/shared/src/index.ts` 与快照 manifest；破坏性变更走 major 版本。

### 3.2 packages/mcd-mcp-client —— 官方 MCP 适配器

- 协议：Streamable HTTP，端点 `https://mcp.mcd.cn`，请求头 `Authorization: Bearer ${MCD_MCP_TOKEN}`（**仅从环境变量读取**）。
- 握手：`initialize` → `notifications/initialized` → `tools/list` → `tools/call`。
- 韧性：429 指数退避（尊重 600 次/分钟限流）；401 直接抛 `AuthError` 并提示申请 Token；超时 15s。
- 输出统一为 `McpToolResult<T>`，不做业务解释。
- 白名单机制：仅允许调用适配器登记过的只读工具（见 MCP_INTEGRATION.md），`create-order` 等写操作默认拦截。

### 3.3 packages/arena-core —— 竞技内核（纯函数）

```
runMatch(config, dataSource): MatchRecord
  ├── RuleEngine.generateTaskCard(seed)           // 随机但可复现的任务卡
  ├── AgentAlpha.decide(task, snapshot)           // 极速猎手（单遍贪心，1 个候选，满足约束下最省钱）
  ├── AgentBeta.decide(task, snapshot)            // 深度优化师（束搜索多候选，约束/营养/价格择优）
  └── Judge.evaluate(task, snapshot, [traceA, traceB], priceOracle?)
        ├── 独立验证 verifyAgentProposal()        // 裁判重算：存在性/数量/重复/单价/优惠/营养/官方核价
        │     └── priceStatus: verified | mismatch | not-verified（NOT_VERIFIED 明确标注，不视为通过）
        ├── 五维打分（输入全部为裁判重算值，不采信 Agent 自述）
        │     ├── 需求满足度 30  // 裁判校验通过率
        │     ├── 预算控制   25  // 裁决成本（官方>重算）≤ 预算；不超支且剩余比例适中得分越高
        │     ├── 营养均衡   20  // 裁判重算的加权达成率（热量0.4/蛋白质0.4/钠0.2）
        │     ├── 优惠利用   15  // 裁判重算的有效优惠 / 券前应付
        │     └── 可解释性   10  // 决策链路完整度与校验说明覆盖率
        └── 胜负判定（字典序）：资格(fatal 失格) → 官方成本 → 重算成本 → 营养/目标 → 速度 → 平局
```

设计约束：

- **可复现**：所有随机性来自 `seed`（mulberry32 PRNG），裁判无随机；同一 `(config, snapshotHash, engineVersion)` 输出字节级一致。`experimentId` 由 (规则版本, 种子, 数据集指纹, 引擎版本, 验证结果) 派生，实测耗时等非确定值不参与。
- **可解释**：每个得分项必须携带 `{ score, max, formula, evidence[] }`；每条违规携带 severity + message + evidenceRef；前端直接渲染公式、证据与独立验证报告。
- **公平**：两 Agent 使用同一 snapshot、同一信息集、同一工具视图；不允许互见对方决策。
- **独立**：裁判不信任 Agent 自述成绩（`constraintChecks` / `totalCents` 仅作申报值对照）；无效方案不能凭低价取胜。
- 价格一律使用官方 `calculate-price` 返回结果（无法核价 → NOT_VERIFIED），Agent 与裁判均不做任何自估。

### 3.4 apps/api —— 服务层

| 路由 | 说明 |
|---|---|
| `POST /api/match` | body: `{ taskSeed?, mode }` → 立即返回 MatchRecord（同步计算 <1s） |
| `GET /api/match/:id/stream` | SSE 逐步推送决策过程（fetchMenu→agentA→agentB→judge） |
| `GET /api/snapshot` | 当前默认快照元信息（id/hash/采集时间/工具清单） |
| `GET /api/healthz` | 健康检查 + 模式（live/replay）+ Token 是否配置（只返回布尔） |

模式编排：`mode=live`（需 Token，实时查询 + 自动落新快照）｜默认 `mode=replay`（无 Token 可完整演示）。

### 3.5 apps/web —— 中文可视化界面（暗色主题）

- 首页：模式指示（实时/演练）、任务卡展示、开始比赛。
- 对战页：左右双 Agent 决策流（时间轴动画）；中央裁判记分牌；雷达图五维对比；逐项得分展开（公式+证据）；「复现本局」按钮。
- 快照页：数据来源透明化（工具调用记录、采集时间、sha256）。
- 技术：React + Vite + ECharts；禁止在 UI 展示任何 Token。

### 3.6 skill/mc-arena —— WorkBuddy Skill

```
skill/mc-arena/
├── SKILL.md            # frontmatter(name/description/version/author...) + 指令正文
├── scripts/run-match.mjs   # 调用 arena-core CLI：node scripts/run-match.mjs --seed N --mode replay
└── references/
    ├── mcp-tools.md    # 官方工具清单与用途（摘自官方 README，标注以实测为准）
    └── scoring.md      # 裁判规则说明
```

Skill 行为：用户说「来一场麦门竞技」→ Skill 指示 WorkBuddy 执行 `run-match.mjs`，解析 JSON 结果并用中文解说。

## 4. 数据流（一局比赛）

1. 选定数据源：replay → 读 `snapshots/<id>/`；live → mcd-mcp-client 拉取并原子落盘。
2. RuleEngine 用 seed 生成 TaskCard。
3. Agent α/β 各自基于同一 snapshot 计算购物车与 DecisionTrace。
4. Judge 输入 `(taskCard, snapshot, traces)` → Verdict（含公式与证据）。
5. 组装 MatchRecord（含 snapshotHash、engineVersion、seed），API 存储（内存 + 可选 JSONL 日志）。
6. 前端渲染；任何人可用 `{seed, snapshotId}` 完全复现。

## 5. 安全与合规设计

- Token：仅环境变量 `MCD_MCP_TOKEN`；`.env` 不入库；`mcp-config.example.json` 只含 `${MCD_MCP_TOKEN}` 占位符；CI 增加 secret 扫描。
- 写操作隔离：mcd-mcp-client 的 `WRITE_TOOLS` 黑名单默认抛错，需显式双 flag 才解除；MVP 完全不启用。
- 速率限制：客户端计数器 + 指数退避，永远低于 600 次/分钟。
- 内容合规：文案遵守官方规则（不贬低品牌、不与其他品牌对比、无敏感内容）；CONTEST_DECLARATION.md 保持官方原文。
- 数据合规：快照仅含公开菜单/价格/营养/活动数据，不含任何个人账号信息（不调用 query-my-* 类个人数据工具入场）。

## 6. 部署与运行

- 本地：`npm install && npm run dev`（web :5173 / api :8787）。
- 演示/评审：`docker compose up`（可选，P4 视时间）。
- CI：GitHub Actions → `npm ci && npm run build && npm test`。
- 无 Token 评审路径：克隆仓库 → `npm ci && npm run demo` → 直接看到完整比赛（基于仓内快照）。

## 7. 已知限制与 v2 方向

- MVP Agent 为确定性策略，非 LLM 驱动（可复现优先）；预留 `AgentBrain` 接口。
- 实时模式依赖 Token 与官方服务可用性；限流期间自动降级为 replay 并提示。
- 个人账户类工具（我的积分/优惠券）不进入竞技数据，避免隐私与不可复现。
- v2 backlog：LLM Agent 对战、锦标赛模式、用户自定义任务卡编辑器、真实下单演练沙箱。
