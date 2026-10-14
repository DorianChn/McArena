# McArena 任务清单（TASKS）

> 版本 v1.0 ｜ 2026-10-14 ｜ 编号规则：`P{阶段}-{序号}`。标记 🤖=AI 可执行，👤=需用户人工完成。
> 硬截止：**2026-10-25 23:59（北京时间）报名 Issue 提交**。

## P0 基座与合规（10/14）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P0-1 🤖 | 研读官方三仓库 + WorkBuddy skill 文档，确认规则/工具清单/时间节点 | 架构师 | ✅ 完成 | 见 PROJECT_PLAN.md §1 |
| P0-2 🤖 | 创建 `<repo-root>` 并 `git init` | 架构师 | ✅ 完成 | 目录存在，main 分支 |
| P0-3 🤖 | 写入 CONTEST_DECLARATION.md（官方原文，禁止改动） | 架构师 | ✅ 完成 | diff 与官方仓库一致 |
| P0-4 🤖 | 写入 mcp-config.example.json（仅环境变量占位符） | 架构师 | ✅ 完成 | 无任何真实凭据 |
| P0-5 🤖 | npm workspaces 骨架：根 package.json / tsconfig.base / .gitignore / .editorconfig | 后端 | ✅ 完成 | `npm install` 成功 |
| P0-6 🤖 | Vitest + GitHub Actions CI（build + test） | 后端 | ✅ 完成 | 本地 39/39 测试通过；CI 待 push 后验证 |
| P0-7 🤖 | 编写 PROJECT_PLAN / ARCHITECTURE / TASKS / ACCEPTANCE_CRITERIA | 架构师 | ✅ 完成 | 四文件齐备 |
| P0-8 👤 | 在 https://open.mcd.cn/mcp 手机号登录并申请 MCP Token，仅写入本地 `.env` | 用户 | ⬜ **阻塞 R1** | `.env` 存在且不入库 |
| P0-9 👤 | 在 GitHub 创建 **公开** 仓库 `McArena`（须早于 10/25 23:59 创建） | 用户 | ⬜ | 仓库 Public，创建时间合规 |

## 阶段01 基础工程与架构实现（10/14）

> 目标：工程可启动、前后端通信正常、契约/接口/测试/lint 全绿；真实业务算法留给阶段02。
> 范围控制：Mock 模式为唯一默认模式；live 模式在阶段02 接通官方 MCP 后启用。

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| S1-1 🤖 | 前后端 TypeScript 工程（npm workspaces × 5 包） | 后端 | ✅ 完成 | typecheck 6/6 通过 |
| S1-2 🤖 | React + Vite + Tailwind CSS 配置（@tailwindcss/vite，v4） | 前端 | ✅ 完成 | `vite build` 成功（13.45KB CSS / 217.81KB JS） |
| S1-3 🤖 | Node.js 后端 + API（Fastify + CORS + 统一错误处理 + SSE） | 后端 | ✅ 完成 | 7 路由冒烟 + 契约错误体 |
| S1-4 🤖 | 统一数据契约（packages/shared：Challenge/Constraints/MenuItem/MealProposal/MCPDataSnapshot/AgentExecution/JudgeResult/MatchResult/EvidenceRecord + API DTO + DataOrigin） | 后端 | ✅ 完成 | 8 契约测试通过 |
| S1-5 🤖 | MCP Adapter 接口（McdMcpAdapter + HttpMcpAdapter + MockMcpAdapter + 只读白名单/写操作黑名单/限流/退避） | 后端 | ✅ 完成 | 假服务器契约测试 12 项通过 |
| S1-6 🤖 | Agent Engine / Judge Engine 接口（arena-core，纯函数边界）+ Mock 脚手架引擎 | 算法 | ✅ 完成 | 4 编排测试通过（含确定性复现） |
| S1-7 🤖 | 比赛状态管理（MatchOrchestrator 状态机 + MatchStore 环形缓冲 + SSE 事件序列） | 后端 | ✅ 完成 | SSE 回放验证 |
| S1-8 🤖 | 错误处理与日志系统（9 类错误码 + HTTP 映射 + JSON 日志 + 敏感字段脱敏） | 后端 | ✅ 完成 | 错误体契约 + 脱敏测试 |
| S1-9 🤖 | ESLint（typescript-eslint 类型感知）+ TypeScript strict + Vitest | 后端 | ✅ 完成 | lint 0 error / test 39/39 / build 通过 |
| S1-10 🤖 | 前后端实际启动联调（dev 双服务 + Vite 代理 + curl 冒烟） | 全栈 | ✅ 完成 | healthz / match / stream / 404 / 400 全部符合预期 |
| S1-11 🤖 | 阶段 Git Commit | 全栈 | ✅ 完成 | 见 git log |

### 阶段01 设计决策记录

- **内部包源码直引**：workspaces 包 exports 指向 TS 源码，运行时由 tsx（API）与 Vite（Web）编译，避免构建顺序耦合；`tsc --noEmit` 仅作类型检查。
- **数据来源三分法**：`official-live` / `official-snapshot` / `mock`，由 `DataOrigin` 贯穿 MatchResult 与 UI，mock 结果强制携带中文警示，杜绝「模拟数据冒充官方数据」。
- **写操作红线**：MCP 客户端只读白名单 + 写操作黑名单双重机制，默认拒绝一切下单类工具（单测覆盖）。
- **接口先行**：Agent/Judge 引擎以接口固定，真实算法（阶段02）可无缝替换 mock 脚手架。

## P1 官方 MCP 数据接入（10/15–10/16）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P1-1 🤖 | `packages/shared`：zod 契约（MenuSnapshot/TaskCard/DecisionTrace/Verdict/MatchRecord） | 后端 | ✅ 完成（阶段01 已含全部核心对象 + API DTO） | 类型导出 + schema 测试 |
| P1-2 🤖 | `packages/mcd-mcp-client`：initialize/tools/list/tools/call + 退避重试 + 超时 | 后端 | ✅ 协议层完成（待真实 Token 端到端验证） | 假服务器契约测试通过 |
| P1-3 🤖 | 写操作黑名单（create-order 等默认拒绝） | 后端 | ✅ 完成 | 单测：拦截即抛错 |
| P1-4 🤖👤 | 用真实 Token 试连，落 `snapshots/schema-YYYYMMDD/tools.json`（实测 schema） | 后端+用户 | ⬜ 依赖 P0-8 | tools.json 生成；与官方文档差异记录入 MCP_INTEGRATION.md |
| P1-5 🤖 | `tools/snapshot-capture.ts`：采集只读数据快照 + manifest(sha256) | 后端 | ⬜ | 无 Token 可回放 |
| P1-6 🤖 | `packages/shared` 按**实测 schema** 校正契约 | 后端 | ⬜ 依赖 P1-4 | 契约测试通过 |
| P1-7 🤖 | **Gate G1**：无 Token 环境下 `npm run demo` 跑通 快照→比赛 闭环 | 全栈 | ⬜ | 终端输出完整 MatchRecord |

## P2 竞技内核（10/17–10/19）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P2-1 🤖 | RuleEngine：seed→TaskCard 生成器（mulberry32，含约束变体） | 算法 | ⬜ | 同 seed 同输出 |
| P2-2 🤖 | Agent α「预算猎手」：约束满足 + 最低总价 | 算法 | ⬜ | 单测：超预算必被拒 |
| P2-3 🤖 | Agent β「营养均衡派」：营养目标加权偏差最小化 | 算法 | ⬜ | 单测：目标达成率计算正确 |
| P2-4 🤖 | Judge：五维打分 + 加权 + 破平 + 逐项公式与证据 | 算法 | ⬜ | 打分单测 + 边界（并列/零分） |
| P2-5 🤖 | MatchRecord 组装：snapshotHash + engineVersion + seed | 全栈 | ⬜ | 复现测试：同输入字节级一致 |
| P2-6 🤖 | **Gate G2**：`npm test` 100% 通过，复现性测试通过 | 全栈 | ⬜ | CI 绿 + 本地绿 |

## P3 服务与界面（10/19–10/21）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P3-1 🤖 | apps/api：Fastify 路由（/api/match、/api/match/:id/stream SSE、/api/snapshot、/api/healthz） | 后端 | ⬜ | curl 冒烟通过 |
| P3-2 🤖 | 模式编排：replay 默认 / live 需 Token + 自动落快照 + 限流降级 | 后端 | ⬜ | 无 Token 启动 replay 正常 |
| P3-3 🤖 | apps/web：首页 + 任务卡 + 开始比赛 | 前端 | ⬜ | 可发起一局 |
| P3-4 🤖 | apps/web：对战时间轴 + 记分牌 + ECharts 雷达图 + 得分解释面板 | 前端 | ⬜ | 公式/证据可见 |
| P3-5 🤖 | apps/web：复现按钮（输入 seed+snapshotId → 同结果） | 前端 | ⬜ | 两次运行结果一致 |
| P3-6 🤖 | **Gate G3**：完整一局演示并录制 GIF | 全栈 | ⬜ | GIF 入 README |

## P4 交付物打磨（10/21–10/23）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P4-1 🤖 | README.md：介绍/安装/示例/目标用户 + GIF + 架构图 | 全栈 | ⬜ | 符合参赛文件要求 |
| P4-2 🤖 | MCP_INTEGRATION.md：server/tool/调用流程/业务价值/实测差异 | 后端 | ⬜ 依赖 P1-4 | 文件名与内容合规 |
| P4-3 🤖 | workbuddy.md：导出 WorkBuddy 开发对话上下文（参赛项） | 用户 | ⬜ | 非必须但争取 3000 积分 |
| P4-4 🤖 | skill/mc-arena：SKILL.md + scripts/run-match.mjs + references | 全栈 | ⬜ | WorkBuddy 可调用 |
| P4-5 🤖 | Skill 本地验证：在 WorkBuddy 中触发并成功返回比赛解说 | 全栈 | ⬜ | 对话记录存档 |
| P4-6 🤖 | 合规自查：无 Token/无敏感词/无品牌贬低/无外链违规 | 架构师 | ⬜ | 检查清单签字 |
| P4-7 🤖 | **Gate G4**：五大文件齐备 | 架构师 | ⬜ | README/CONTEST_DECLARATION/MCP_INTEGRATION/mcp-config.example.json/workbuddy.md |

## P5 发布与报名（10/23–10/25）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P5-1 🤖👤 | push 公开仓库，CI 全绿，Release v1.0.0 | 全栈 | ⬜ | 仓库 Public |
| P5-2 🤖 | 报名 Issue 文案准备（标题+正文单行格式，禁 Markdown 链接） | 全栈 | ⬜ | 格式对照官方样例 |
| P5-3 👤 | **Gate G5**：10/25 23:59 前提交报名 Issue（建议 10/24 提交） | 用户 | ⬜ | Issue 收到成功回复 |
| P5-4 🤖 | 缓冲期：修复 issue / 200 响应检查 | 全栈 | ⬜ | 10/26 00:00 快照前稳定 |

## 阻塞项登记（Blockers）

| 编号 | 描述 | 解除条件 | 影响范围 |
|---|---|---|---|
| B1 | 麦当劳 MCP Token 未申请（需手机号验证登录+人机验证，AI 无法代办） | 用户在 open.mcd.cn/mcp 完成登录激活 | P1-4 实测 schema、live 模式；不影响 replay 全链路 |
| B2 | GitHub 公开仓库未创建 | 用户手动建仓 | P5 发布；不影响本地开发 |
