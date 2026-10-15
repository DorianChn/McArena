# McArena 项目实施计划（PROJECT_PLAN）

> 麦门 AI 竞技场 · 基于麦当劳官方 MCP 的双 Agent 智能决策竞技平台
> 版本：v1.0 ｜ 制定日期：2026-10-14 ｜ 状态：已定稿，进入实施

---

## 1. 项目概述

| 项 | 内容 |
|---|---|
| 项目名称 | McArena（麦门 AI 竞技场） |
| 参赛赛事 | 麦当劳程序员创意开发大赛（2026） |
| 核心形态 | 双 Agent 点餐决策竞技 + 可解释智能裁判 + 中文可视化界面 + WorkBuddy Skill |
| 技术底座 | 麦当劳中国官方 MCP Server（`https://mcp.mcd.cn`，Streamable HTTP） |
| 项目仓库（本地） | `<仓库根目录>` |

### 1.1 关键时间节点（北京时间，来自官方 activityGuidelines.md）

| 节点 | 时间 | 距今（2026-10-14） |
|---|---|---|
| 报名及排名截止 | 2026-10-25 23:59 | **11 天** |
| 排行榜数据快照 | 2026-10-26 00:00 | 12 天 |
| 奖品信息提交截止 | 2026-11-14 | 31 天 |
| GitHub 仓库合法创建窗口 | 2025-12-25 00:00 ～ 2026-10-25 23:59 | 须在此窗口内建仓 |

> 排名依据是**公开 Star 数**（10-26 00:00 快照）。因此除功能外，README 质量、演示视频/GIF、可视化效果直接决定成绩。

### 1.2 项目目标（对齐用户需求）

1. 真正可运行的双 Agent 点餐决策比赛（确定性算法驱动，可复现）。
2. 通过官方 MCP Adapter 查询真实菜单/价格/优惠/营养数据。
3. 独立裁判引擎：规则透明、打分可解释、比赛结果可复现（同一快照 → 同一结果）。
4. 中文可视化界面（对战流程、评分雷达图、决策链路回放）。
5. 可被 WorkBuddy 调用的 Skill（`skill/mc-arena/`）。
6. 满足官方参赛文件清单与合规要求。
7. 适合 GitHub 开源传播（MIT License、清晰 README、CI 绿标）。

---

## 2. 阶段划分与依赖关系

```
P0 基座 ──→ P1 数据接入 ──→ P2 竞技内核 ──→ P3 服务与界面 ──→ P4 交付物打磨 ──→ P5 发布与报名
 10/14       10/15-10/16     10/17-10/19     10/19-10/21      10/21-10/23      10/23-10/25
```

**依赖规则**：P1 的「快照契约」是 P2 的前置；P2 的纯函数内核是 P3 的前置；P4 的文件清单（README / CONTEST_DECLARATION / MCP_INTEGRATION / mcp-config.example.json / workbuddy.md）不依赖代码完成度，可提前并行编写。

### P0 基座与合规锁定（10/14，今日）

| 任务 | 产出 | 负责人 |
|---|---|---|
| 阅读官方三仓库 + WorkBuddy skill 文档 | 本文档及 ARCHITECTURE.md | 架构师（已完成） |
| 创建本地项目 + git init | `<仓库根目录>` | 已完成 |
| 写入 CONTEST_DECLARATION.md（官方原文，禁止改动） | 合规锁 | 已完成 |
| 写入 mcp-config.example.json（仅环境变量占位符） | 合规锁 | 已完成 |
| npm workspaces 骨架 + tsconfig + Vitest + CI | 可编译空项目 | 后端 |
| **人工**：申请麦当劳 MCP Token | Token（仅入本地 .env） | **用户** |
| **人工**：创建 GitHub 公开仓库 | 仓库创建时间落在窗口内 | **用户** |

### P1 官方 MCP 数据接入（10/15–10/16）

- 实现 MCP Streamable HTTP 客户端（initialize / tools/list / tools/call）。
- 用真实 Token 试连，落一份「真实工具 schema 快照」（修正文档与官方实际的偏差）。
- 采集只读数据快照：菜单、餐品详情、价格计算、优惠券、营养、活动日历、当前时间。
- 固化 `packages/shared` 的 TS 契约（zod schema）与 `snapshots/manifest.json`（sha256 + 采集时间 + MCP 版本）。
- **验收**：无 Token 环境下可 100% 回放快照跑完整场比赛。

### P2 竞技内核（10/17–10/19）

- 规则引擎：任务卡生成（预算/人数/场景/约束）。
- 双 Agent 决策引擎：Agent-α「极速猎手」（单遍贪心）、Agent-β「深度优化师」（束搜索多候选）。
- 裁判引擎：五维打分 + 加权汇总 + 破平规则 + 决策链路打分解释。
- 复现性：固定随机种子 + 快照哈希写入每场比赛记录。
- 单元测试覆盖（Vitest，含边界用例）。

### P3 服务与界面（10/19–10/21）

- Fastify API：`POST /api/match` 发起比赛；`GET /api/match/:id` 回放；SSE 实时流。
- React + Vite 前端：对战流程动画、评分雷达图、中文解释面板、快照回放器。
- 演练/实时双模式开关（默认演练，绝不调用 create-order）。

### P4 交付物打磨（10/21–10/23）

- README.md（项目介绍/安装/示例/目标用户，带演示 GIF）。
- MCP_INTEGRATION.md（实际使用的 server/tool/调用流程/业务价值）。
- workbuddy.md（WorkBuddy 专项奖励材料）。
- WorkBuddy Skill 打包（SKILL.md + scripts + references）。
- 文档中文化校订、合规自查（禁贬低品牌、禁敏感内容、禁令牌泄露）。

### P5 发布与报名（10/23–10/25）

- push 公开仓库 → CI 全绿 → 发行 v1.0.0 Release。
- 发布报名 Issue（严格按官方格式，标题正文不随意换行）。
- 10/24 预留缓冲；10/25 23:59 硬截止，10/26 00:00 快照。

---

## 3. 模块边界与数据契约（摘要，详见 ARCHITECTURE.md）

| 模块 | 边界 | 契约 |
|---|---|---|
| `packages/shared` | 纯类型 + zod schema，零 IO | `MatchConfig`、`MenuSnapshot`、`DecisionTrace`、`Verdict` |
| `packages/mcd-mcp-client` | 只负责 MCP 协议与限流重试，不含业务 | `McdClient.listTools() / call(name,args)` |
| `packages/arena-core` | 纯函数：规则/双 Agent/裁判，零网络 | `runMatch(config, dataSource): MatchRecord` |
| `apps/api` | HTTP/SSE + 模式编排，不含裁判逻辑 | REST DTO |
| `apps/web` | 展示与交互，直连 API | 同上 |
| `skill/mc-arena` | WorkBuddy 技能壳，调用 arena-core CLI | SKILL.md 指令 |

## 4. 风险与应对

| # | 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|---|
| R1 | MCP Token 未申请到（需手机号登录+人机验证，架构师无法代办） | 中 | 高 | 记录阻塞项；先以官方文档 schema + 快照回放开发，Token 到位后 1 天内补采 |
| R2 | 未连接真实 MCP 前，工具参数 schema 可能与文档有偏差 | 高 | 中 | P1 第一天即试连并落 schema 快照；契约以实测为准，文档偏差记录在案 |
| R3 | 官方限流 600 次/分钟 / 401 / 429 | 中 | 中 | 客户端内置指数退避 + 请求计数；快照优先、实时查询走节流 |
| R4 | 11 天内 Star 冷启动 | 高 | 高 | P4 前完成 README+GIF；请同事/社区试用；不刷量（违规） |
| R5 | 误调用 create-order 产生真实订单 | 低 | 高 | 默认禁下单； Environment flag 双重确认；代码评审红线 |
| R6 | Token 误提交进仓库 | 低 | 极高 | `.env` 入 .gitignore；预提交检查 + CI secret 扫描；只允许环境变量占位符 |
| R7 | 合规风险（贬低品牌/对比/敏感内容） | 低 | 高 | CONTEST_DECLARATION 原文锁定；文案自查清单；「麦门」用语保持趣味且尊重 |
| R8 | 范围蔓延（LLM Agent、账户级操作） | 中 | 中 | MVP 冻结：确定性 Agent；LLM/账户操作列入 v2  backlog |

## 5. 资源与预算

- 人力：架构师/全栈 1 名（本 AI 执行），用户负责Token/建仓/报名 issue 等人工动作。
- 依赖：仅 npm 开源包（React、Vite、Fastify、zod、Vitest、ECharts），无付费服务、无外部 LLM API Key。
- 算力：全部本地；裁判算法为多项式复杂度，毫秒级。

## 6. 里程碑验收门（Gate）

- G1（10/16）：无 Token 也能跑通「快照→比赛」闭环 demo。
- G2（10/19）：arena-core 测试全绿，`npm test` 通过率 100%，裁判复现性测试通过。
- G3（10/21）：前端完整一局比赛可演示（录 GIF）。
- G4（10/23）：五大参赛文件齐备且合规自查通过。
- G5（10/25 18:00）：报名 Issue 已提交（留 6 小时缓冲）。
