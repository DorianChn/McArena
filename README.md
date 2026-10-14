# McArena · 麦门 AI 竞技场

> 基于麦当劳中国官方 MCP Server 的**双 Agent 点餐决策竞技平台**——两个 AI 策略在真实菜单数据上同台竞速，独立裁判透明打分，每一局都可解释、可复现。

[![CI](https://github.com/OWNER/McArena/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/McArena/actions)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![MCP](https://img.shields.io/badge/McDonald's%20MCP-mcp.mcd.cn-red)

一局比赛 = 一张任务卡（预算 × 人数 × 场景 × 约束）+ 两名风格迥异的点餐 Agent + 一位只认规则的裁判：

- 🤖 **Agent α「预算猎手」**：在满足全部约束的前提下，把每一分钱花到最省；
- 🤖 **Agent β「营养均衡派」**：以蛋白质、热量、钠为目标画像，挑选最均衡的搭配；
- ⚖️ **裁判引擎**：需求满足度 / 预算控制 / 营养均衡 / 优惠利用 / 可解释性，五维打分、公式公开、证据可查。

所有价格来自官方 `calculate-price` 工具，所有餐品与营养来自官方菜单工具——**没有任何编造的数据**。

## ✨ 特性

- **真实数据**：直连麦当劳中国官方 MCP Server（`https://mcp.mcd.cn`，Streamable HTTP）；
- **可复现**：固定随机种子 + 数据快照哈希，同一局比赛任何人运行结果完全一致；
- **可解释**：裁判每项得分都附带公式与证据，拒绝黑箱；
- **无 Token 也能玩**：仓库内置录制的官方数据快照，克隆即可完整演示；
- **安全**：只读工具白名单，默认禁止任何下单写操作；
- **WorkBuddy Skill**：在 WorkBuddy 对话里说「来一场麦门竞技」即可开赛。

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20（开发使用 22.x）
- npm ≥ 10

### 一键启动（模拟数据模式，无需 Token）

```bash
git clone https://github.com/OWNER/McArena.git
cd McArena
npm ci
npm run dev
# 前端 http://localhost:5173 ｜ API http://localhost:8787
```

首次启动为**模拟数据模式**（界面黄色标识「模拟数据」）——可在无 Token 环境下完整走通
「任务卡 → 双 Agent 决策 → 裁判打分 → 结果回放」全链路，且每局比赛支持 seed 复现。

### 实时模式（需要麦当劳 MCP Token）

1. 前往 [麦当劳 MCP 开放平台](https://open.mcd.cn/mcp)，手机号登录后在控制台「激活」申请 MCP Token；
2. 复制 `.env.example` 为 `.env`，设置 `MCD_MCP_MODE=live` 与 `MCD_MCP_TOKEN`（**不要提交 .env**）；
3. `npm run dev`。

> 实时数据采集（tools 调用 → 快照落盘 → 数据集组装）将在阶段02实现，详见 MCP_INTEGRATION.md「实测校验记录」。

### 质量检查

```bash
npm run lint       # ESLint（typescript-eslint 类型感知规则）
npm run typecheck  # TypeScript strict 全量检查
npm test           # Vitest：契约 / 协议 / 编排 / API / 前端客户端
npm run build      # 生产构建（API tsup 打包 + Web Vite 构建）
```

### WorkBuddy 中使用

见 [`skill/mc-arena/SKILL.md`](skill/mc-arena/SKILL.md) 与 [`workbuddy.md`](workbuddy.md)。

## 🏗 架构

```
┌────────────┐   ┌──────────────────┐   ┌─────────────────────────┐
│ apps/web   │──▶│ apps/api         │──▶│ packages/arena-core     │
│ React+Vite │   │ Fastify + SSE    │   │ 规则/双Agent/裁判(纯函数) │
└────────────┘   └──────────────────┘   └───────────┬─────────────┘
                            │                       │ packages/shared (zod 契约)
                  ┌─────────▼──────────┐   ┌────────▼─────────┐
                  │ snapshots/ (回放)  │◀──│ mcd-mcp-client   │──▶ mcp.mcd.cn
                  └────────────────────┘   └──────────────────┘
```

详细设计见 [ARCHITECTURE.md](ARCHITECTURE.md)，实施计划见 [PROJECT_PLAN.md](PROJECT_PLAN.md)。

## 🧪 测试与质量

```bash
npm test      # Vitest：契约 / 决策 / 裁判 / 复现性
npm run build # TypeScript strict 全量构建
```

复现性测试：相同 `(seed, snapshotId)` 两次运行的 MatchRecord（除记录 ID 外）字节级一致。

## 📁 目录结构

| 路径 | 说明 |
|---|---|
| `packages/shared` | 数据契约（zod schema + TS 类型，单一事实来源） |
| `packages/mcd-mcp-client` | 官方 MCP Streamable HTTP 客户端（退避重试 / 写操作黑名单） |
| `packages/arena-core` | 竞技内核：规则引擎、双 Agent、裁判引擎（零网络纯函数） |
| `apps/api` | Fastify 服务：比赛 API + SSE 实时流 |
| `apps/web` | React 中文可视化界面（决策时间轴 / 雷达图 / 解释面板） |
| `skill/mc-arena` | WorkBuddy Skill（SKILL.md + 脚本） |
| `snapshots/` | 录制的官方数据快照 + manifest（sha256） |
| `tools/` | 快照采集等工程脚本 |

## 🎯 适用人群

- 想了解 MCP 真实落地的开发者；
- 对「多智能体决策 / 可解释 AI / 公平比对」感兴趣的学习者；
- 需要「点餐决策辅助」思路参考的产品与技术团队。

## 🔌 实际使用的麦当劳 MCP 工具

`now-time-info`、`query-nearby-stores`、`query-meals`、`query-meal-detail`、`calculate-price`、`query-store-coupons`、`list-nutrition-foods`、`campaign-calendar`。
调用流程与业务价值详见 [MCP_INTEGRATION.md](MCP_INTEGRATION.md)。

## ⚠️ 合规与免责

- 本项目为麦当劳程序员创意开发大赛参赛作品，非麦当劳官方产品；输出仅供娱乐与学习参考，不构成营养或专业建议；
- 项目**默认禁止**调用 `create-order` 等写操作，不会产生任何真实订单；
- Token 仅通过环境变量注入，仓库内不含任何真实凭据；
- 餐品、价格与供应情况以麦当劳官方渠道实时结果为准。

## 📄 License

[MIT](LICENSE)
