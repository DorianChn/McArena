# 传播材料（PROMOTION）

> 本文件汇总 McArena 的对外传播物料：中文介绍、英文介绍、GitHub 仓库描述、项目特色、原创技术亮点、技术架构说明与可复现 Demo。
> 所有数字与截图均为仓库内可复核的真实产出（测试基线 222/222，2026-10-15；截图见 `docs/screenshots/stage07/`）。

## 一、项目中文介绍

### 短版（一句话）

**McArena（麦门 AI 竞技场）**是一个基于麦当劳中国官方 MCP Server 的双 Agent 点餐决策竞技平台：两个算法风格迥异的 AI（极速猎手 α / 深度优化师 β）在真实菜单数据上同台竞技，一位独立裁判基于规则公开透明地打分——每一局都可解释、可复现。

### 长版（约 200 字）

McArena 把「点点点餐」变成一场可观看、可评判、可复现的 AI 竞赛。玩家下发一张任务卡（预算 × 人数 × 场景 × 营养目标），Agent α 用单遍贪心秒速给出最便宜的有效解，Agent β 用束搜索在数百个候选购物车中逐一真实计价、择优而出。裁判不信任任何 Agent 的自述成绩：餐品存在性、单价、优惠、营养、应付价格全部独立重算，优先通过官方 `calculate-price` 核价，无法核价时明确标注 NOT_VERIFIED。项目内置演示模式（无需 Token，标注模拟数据）与官方实时模式（MCP Token 接入）双通道，全部比赛输出含 `experimentId`，同种子逐字节复现。

## 二、简明英文介绍

**McArena (McDonald's AI Arena)** is a dual-agent ordering-decision arena built on McDonald's China official MCP Server. Two algorithmically distinct agents — a greedy "Speed Hunter" and a beam-search "Optimizer" — compete on the same menu snapshot, while an independent judge re-computes every claim (item existence, prices, coupons, nutrition) instead of trusting agent self-reports. Every match is explainable and bit-for-bit reproducible via `(seed, snapshotHash)`. Ships with a mock demo mode (no token required, clearly labeled) and an official live mode.

## 三、适合 GitHub 的项目描述

### About 一句话描述（≤ 350 字符）

```
Dual-agent ordering-decision arena on McDonald's China official MCP Server: greedy vs beam-search agents compete while an independent judge re-computes every claim. Explainable, reproducible, zero-token demo mode.
```

### Topics 建议

```
mcp, mcdonalds, mcp-server, ai-agents, multi-agent, decision-making, typescript, react, fastify, vitest, workbuddy, explainable-ai, beam-search, reproducible
```

<!-- APPEND-MARKER -->

## 四、项目特色说明

| # | 特色 | 一句话证明 |
|---|---|---|
| 1 | **双 Agent 算法实质不同** | 平均候选数 1 vs 134、平均工具调用 1 vs 4.75 次，基准测试客观量化（`npm run bench`） |
| 2 | **裁判不信任 Agent** | 自述应付价与裁判重算价并列展示；致命违规直接取消获胜资格，「无效方案不能凭低价取胜」 |
| 3 | **复现性是硬约束** | 相同 `(seed, snapshotId)` 两次运行 MatchRecord 除记录 ID 外字节级一致，有测试锁定 |
| 4 | **数据诚实** | `DataOrigin` 三分法贯穿前后端；mock 数据在界面、CLI、JSON 三处强制标注「模拟数据」 |
| 5 | **零 Token 全链路演示 | `npm ci && npm run dev` 即可完整跑通，CI 与评审环境无需任何凭据 |
| 6 | **三端同源** | 网页 / CLI / WorkBuddy Skill 共用同一 `runArenaMatch()`，Skill 不复制业务逻辑 |
| 7 | **写操作红线 | 只读白名单 + 下单黑名单双重机制，`create-order` 等默认拒绝且有单测 |
| 8 | **工程质量可验证 | lint 0/0、typecheck 0 错、222 单测、npm audit 0 漏洞、浏览器实测 0 控制台错误 |

## 五、原创技术亮点

1. **「快照录制 + 规则裁判 + 证据链」三件套**：把 MCP 数据固化为带 sha256 的快照，比赛在快照上确定性回放，裁判输出逐条违规（severity + 数据证据引用）。任何 MCP 决策类 Skill 都可复用来做回归测试与公平评测——这是本项目认为最有迁移价值的部分。
2. **字典序胜负判定**：资格 → 官方核验成本 → 裁判重算成本 → 营养/目标达成率 → 响应时间 → 平局。刻意不与「五维总分」绑定，避免单一总分掩盖硬性违规（界面与分享卡均并列展示双方得分并注明判定依据）。
3. **`experimentId` 复现指纹**：FNV-1a 变体哈希，把种子、数据集、引擎版本、双方指标压缩为 16 位十六进制——一局比赛一个 ID，任何人均可重放校验。
4. **算法型 Agent 的诚实标注**：两个 Agent 明确标注为算法实现（未配置大模型），用候选数 / 工具调用数等客观指标区分策略差异，不用「AI 推理」话术包装固定输出。
5. **零依赖 HTML 战报**：`renderMatchHtml()` 产出自包含可打开战报，不依赖运行时服务；`challenge` CLI 一条命令产出 JSON + HTML 双产物。

<!-- APPEND-MARKER-2 -->

## 六、可复现 Demo 挑战

```bash
npm ci
npm run challenge -w @mcarena/arena-core -- --people 2 --budget 60 --goal balanced --seed 42
```

- 无需 Token、无需启动服务，约 10 秒输出完整中文战报；
- 同种子重跑得到同一 `experimentId`（`exp_bcc724febf31e0b8`）；
- 战报末尾输出 `reproducibleConfig`，可粘贴到网页「挑战设置」复现同一局；
- 网页完整链路演示：`npm ci && npm run dev` → http://localhost:5173 → 首页「一键开赛」。

## 七、技术架构说明

npm workspaces × 5 包，类型与契约单一事实来源：

| 层 | 包 | 职责 |
|---|---|---|
| 契约 | `packages/shared` | zod schema + TS 类型（MenuSnapshot / TaskCard / DecisionTrace / Verdict / MatchRecord），API/Web/CLI/Skill 共用 |
| 数据 | `packages/mcd-mcp-client` | Streamable HTTP + JSON-RPC 2.0 + SSE 解析、限流 600 次/分、指数退避、只读白名单 + 写操作黑名单、快照采集 |
| 引擎 | `packages/arena-core` | 纯函数：RuleEngine（种子→任务卡）、双 Agent、独立裁判（verifier + judge）、状态机、`challenge`/`demo`/`bench` CLI、HTML 战报 |
| 服务 | `apps/api` | Fastify：`/api/match`、`/api/match/:id/stream`（SSE）、`/api/snapshot`、`/api/healthz` |
| 界面 | `apps/web` | React + Vite + Tailwind v4：四页面、双主题、SVG 雷达图、分享卡导出 PNG |

数据流：`mcp.mcd.cn` →（live，需 Token）→ 快照落盘（sha256 manifest）→ `snapshots/` →（replay）→ `arena-core` 引擎 → MatchRecord → Web / Skill。
无 Token 时引擎直接在场景数据集（mock）上运行，`dataOrigin` 全程可见。

一句话架构：**「MCP 客户端只管取数，引擎只管决策，裁判只管验证，契约只管类型」**——四层各自可独立测试（222 项单测即按此分层）。


