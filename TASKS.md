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
| P2-1 🤖 | RuleEngine：seed→TaskCard 生成器（mulberry32，含约束变体） | 算法 | ✅ 完成 | 同 seed 同输出（复现测试通过） |
| P2-2 🤖 | Agent α「极速猎手」：单遍贪心，约束满足 + 最低总价（原「预算猎手」） | 算法 | ✅ 完成（阶段03） | 单测：超预算必被拒；candidateCount 恒为 1 |
| P2-3 🤖 | Agent β「深度优化师」：束搜索多候选 + 组合比较，营养目标加权偏差最小化（原「营养均衡派」） | 算法 | ✅ 完成（阶段03） | 单测：目标达成率计算正确；候选 46–288 个 |
| P2-4 🤖 | Judge：五维打分 + 加权 + 破平 + 逐项公式与证据 | 算法 | ✅ 完成（阶段03） | 打分单测 + 边界（并列/零分）；破平顺序 预算→需求→营养 |
| P2-5 🤖 | MatchRecord 组装：snapshotHash + engineVersion + seed + Agent 指标 | 全栈 | ✅ 完成（阶段03） | 复现测试：同 seed 指纹一致（已剔除时间戳/耗时） |
| P2-6 🤖 | **Gate G2**：`npm test` 100% 通过，复现性测试通过 | 全栈 | ✅ 完成（阶段03，66/66） | CI 待 push 后验证 |

## 阶段03 双 Agent 竞技引擎（10/14）

> 目标：两个**算法实质不同**的 Agent 在同挑战同数据上竞技，支持取消/超时/失败恢复，全过程可复现可溯源。
> 详细实测数据与验收证据见 `STAGE_03_REPORT.md`。

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| S3-1 🤖 | Agent A「极速猎手」Speed Agent：单遍贪心、低计算成本、即时有效解 | 算法 | ✅ 完成 | candidateCount = 1；工具调用 1 次 |
| S3-2 🤖 | Agent B「深度优化师」Optimizer Agent：束搜索 + 多候选组合比较 | 算法 | ✅ 完成 | 候选 46–288；工具调用 ≤ 6；营养/用券更优 |
| S3-3 🤖 | 两名 Agent 接收相同挑战 + 读取同一份经验证的数据集 | 算法 | ✅ 完成 | `benchmarkScenario()` 统一注入 |
| S3-4 🤖 | 约束支持：预算 / 人数 / 商品类别（新增 requiredCategories）/ 营养 / 券 | 算法 | ✅ 完成 | 8 场景测试全覆盖 |
| S3-5 🤖 | Agent 执行状态机：取消 / 超时 / 失败恢复 / 结构化校验 | 算法 | ✅ 完成 | `agent-runner.test.ts` 9 项 |
| S3-6 🤖 | 记录真实运行时间 / 候选方案 / 工具调用证据 | 算法 | ✅ 完成 | `durationMs`/`candidateCount`/`toolCalls` 为实测值 |
| S3-7 🤖 | 固定随机种子可复现挑战 | 算法 | ✅ 完成 | `canonicalizeMatch` 指纹一致 |
| S3-8 🤖 | 决策过程传递给前端（SSE agent.started/phase/step/completed/failed + AgentCard 指标） | 全栈 | ✅ 完成 | SSE 冒烟：25 step + 14 phase + 2 completed |
| S3-9 🤖 | 8 个官方测试场景 + 基准对比（有效率/费用/约束满足度/耗时/工具调用） | 算法 | ✅ 完成 | `npm run bench`；汇总见 STAGE_03_REPORT.md §3 |
| S3-10 🤖 | 中文 CLI：match / bench / timeout / cancel | 全栈 | ✅ 完成 | `npm run demo` 输出战报 |
| S3-11 🤖 | API 换装真实引擎（RuleEngine 任务卡 + ReplayPriceOracle + 降级恢复策略） | 后端 | ✅ 完成 | API 冒烟 10 用例通过 |
| S3-12 🤖 | STAGE_03_REPORT.md + 测试（66/66）+ 类型/Lint/构建全绿 + Git 提交 | 全栈 | ✅ 完成 | 见 git log（未 push） |

## 阶段04 独立智能裁判系统（10/14）

> 目标：Judge Engine 作为两 Agent 之外的独立裁判，**不信任 Agent 自述成绩**，全部指标独立重算；
> 资格硬门槛 + 有效成本优先 + 可解释报告 + 可复现实验 ID。详细规范见 `JUDGE_SPEC.md`，实测数据见 `STAGE_04_REPORT.md`。

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| S4-1 🤖 | 独立验证器 `verifyAgentProposal()`：餐品存在/在售、数量、重复、单价数据卫生 | 算法 | ✅ 完成 | `verifier.test.ts` 35 项 |
| S4-2 🤖 | 预算/人数/种类/必选餐品-标签-类别硬约束（fatal 即失格） | 算法 | ✅ 完成 | 各场景单测覆盖 |
| S4-3 🤖 | 优惠券逐张验证（存在/门槛/标签/类型/重复申报）+ 共享引擎重算优惠 | 算法 | ✅ 完成 | 5 类券场景单测 |
| S4-4 🤖 | 官方 calculate-price 优先核价；无记录 → NOT_VERIFIED（warning，不视为通过） | 算法 | ✅ 完成 | verified/mismatch/not-verified 三路径单测 |
| S4-5 🤖 | 五维评分改为裁判重算输入（需求30/预算25/营养20/优惠15/可解释10） | 算法 | ✅ 完成 | 虚报 Agent 不得高分（单测） |
| S4-6 🤖 | 字典序胜负判定：资格 → 官方成本 → 重算成本 → 营养/目标 → 速度 → 平局 | 算法 | ✅ 完成 | 无效方案不能低价赢（单测） |
| S4-7 🤖 | `experimentId` 可复现实验 ID + `costBasis` + `allViolations` 扁平汇总 | 算法 | ✅ 完成 | 确定性与敏感性单测 |
| S4-8 🤖 | 契约扩展（Violation/Check/AgentVerification/CostBasis）+ canonicalizeMatch 同步 | 后端 | ✅ 完成 | 契约测试 8 项通过 |
| S4-9 🤖 | CLI 战报 + 前端 JudgePanel 展示独立验证报告（NOT_VERIFIED 高亮/证据引用） | 全栈 | ✅ 完成 | `demo match` 输出验证摘要；web build 成功 |
| S4-10 🤖 | JUDGE_SPEC.md + STAGE_04_REPORT.md + 测试 66 项新增（全库 132/132 通过）+ Git 提交 | 全栈 | ✅ 完成 | typecheck 0 / lint 0 error / build 通过（未 push） |

## P3 服务与界面（10/19–10/21）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P3-1 🤖 | apps/api：Fastify 路由（/api/match、/api/match/:id/stream SSE、/api/snapshot、/api/healthz） | 后端 | ✅ 完成（阶段01） | curl 冒烟通过 |
| P3-2 🤖 | 模式编排：replay 默认 / live 需 Token + 自动落快照 + 限流降级 | 后端 | 🟡 部分（live 仍阻塞于 Token） | 无 Token 时 mock/replay 正常 |
| P3-3 🤖 | apps/web：首页 + 任务卡 + 开始比赛 | 前端 | ✅ 完成（阶段05） | 首页/挑战设置/一键开赛 |
| P3-4 🤖 | apps/web：对战时间轴 + 记分牌 + 雷达图 + 得分解释面板 | 前端 | ✅ 完成（阶段05） | 纯 SVG 雷达图 + 五维得分条 + 裁判报告 |
| P3-5 🤖 | apps/web：复现按钮（输入 seed+snapshotId → 同结果） | 前端 | ✅ 完成（阶段05） | 分享卡提供可复现配置复制；同 seed 结果一致（单测覆盖） |
| P3-6 🤖 | **Gate G3**：完整一局演示并录制 GIF | 全栈 | 🟡 部分 | 全流程可跑通；GIF 未录制（待补） |

## P4 交付物打磨（10/21–10/23）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P4-1 🤖 | README.md：介绍/安装/示例/目标用户 + GIF + 架构图 | 全栈 | 🟡 部分 | 正文/示例/架构齐备；GIF 待补 |
| P4-2 🤖 | MCP_INTEGRATION.md：server/tool/调用流程/业务价值/实测差异 | 后端 | ✅ 完成 | 文件名与内容合规 |
| P4-3 🤖 | workbuddy.md：导出 WorkBuddy 开发对话上下文（参赛项） | 用户 | ✅ 完成（阶段06，原始导出待追加） | 阶段/指令/功能/调试/证据齐备；缺失已注明 |
| P4-4 🤖 | skill/mc-arena：SKILL.md + scripts/run-match.mjs + references | 全栈 | ✅ 完成（阶段06） | 官方校验脚本输出 `Skill is valid!` |
| P4-5 🤖 | Skill 本地验证：在 WorkBuddy 中触发并成功返回比赛解说 | 全栈 | ✅ 完成（阶段06） | 已安装至用户级并真实调用；11 项子进程集成测试 |
| P4-6 🤖 | 合规自查：无 Token/无敏感词/无品牌贬低/无外链违规 | 架构师 | ✅ 完成 | 见 STAGE_06_REPORT.md 第六/九节 |
| P4-7 🤖 | **Gate G4**：五大文件齐备 | 架构师 | ✅ 完成 | README/CONTEST_DECLARATION/MCP_INTEGRATION/mcp-config.example.json/workbuddy.md |

## P5 发布与报名（10/23–10/25）

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| P5-1 🤖👤 | push 公开仓库，CI 全绿，Release v1.0.0 | 全栈 | ⬜ | 仓库 Public |
| P5-2 🤖 | 报名 Issue 文案准备（标题+正文单行格式，禁 Markdown 链接） | 全栈 | ⬜ | 格式对照官方样例 |
| P5-3 👤 | **Gate G5**：10/25 23:59 前提交报名 Issue（建议 10/24 提交） | 用户 | ⬜ | Issue 收到成功回复 |
| P5-4 🤖 | 缓冲期：修复 issue / 200 响应检查 | 全栈 | ⬜ | 10/26 00:00 快照前稳定 |

## 阶段05 完整前端 UI/UX（10/14）

> 目标：开发完成度高、适合公开演示的中文 AI Agent 竞技场。技术栈 React + TypeScript + Tailwind CSS；
> 公开演示模式不要求麦当劳账号或 Token；不在浏览器暴露服务端密钥；不伪造历史战绩/用户数/排行榜。

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| S5-1 🤖 | 设计系统：Tailwind v4 `@theme inline` 语义化变量 + 深/浅双主题 | 前端 | ✅ 完成 | `index.css` + `theme.tsx` |
| S5-2 🤖 | 首页：项目介绍 + 双 Agent 对决入口 + 玩法说明 + 数据状态 + 一键开赛 | 前端 | ✅ 完成 | `pages/HomePage.tsx` |
| S5-3 🤖 | 挑战设置：预算/人数/营养目标/优惠偏好/预设挑战/自定义约束 | 前端 | ✅ 完成 | `pages/SetupPage.tsx` + API `constraints` 契约扩展 |
| S5-4 🤖 | 竞技场：左右双栏对决 + 实时状态 + 决策进度 + 已验证数据 + 耗时 + 错误/等待态 | 前端 | ✅ 完成 | `pages/ArenaPage.tsx`（回放引擎 + 1x/2x/4x + 跳过） |
| S5-5 🤖 | 比赛结果：胜者 + 双方得分 + 价格/营养对比 + 决策解释 + MCP 证据状态 + 重新挑战 | 前端 | ✅ 完成 | `pages/ResultPage.tsx` |
| S5-6 🤖 | 分享：成绩卡 + 导出 PNG + 复制分享文案 + 复制可复现配置 + GitHub 入口 | 前端 | ✅ 完成 | `components/ShareCard.tsx` + `lib/share.ts` |
| S5-7 🤖 | 其他：中文界面、响应式、Loading/Error/Empty、无障碍基础、性能优化 | 前端 | ✅ 完成 | `components/ui/*`、`feedback.tsx`、焦点环/44px/`prefers-reduced-motion` |
| S5-8 🤖 | 质量门禁：typecheck 0 错 / lint 0 错 / web build 成功 / 全量测试 134 通过 | 全栈 | ✅ 完成 | 见提交记录 |
| S5-9 🤖 | 浏览器实测 + 移动端检查 + 控制台检查 + 截图归档 + `STAGE_05_REPORT.md` | 全栈 | ✅ 完成 | 控制台 0 错误；9 张截图；`STAGE_05_REPORT.md` |

## 阶段06 WorkBuddy Skill 集成（10/14）

> 目标：让 McArena 作为**真正的 WorkBuddy Skill** 使用。要求：可真实调用；不复制另一套不一致的业务逻辑；
> 与网页共享核心引擎；有明确安装启用教程；不编造官方规范；版本限制需记录并给出替代方案。
> 详细报告见 `STAGE_06_REPORT.md`。

| ID | 任务 | 负责 | 状态 | 验收 |
|---|---|---|---|---|
| S6-1 🤖 | 查阅 WorkBuddy 官方 Skill 规范（skill-creator + quick_validate.py） | 全栈 | ✅ 完成 | `quick_validate.py` 输出 `Skill is valid!` |
| S6-2 🤖 | 共享引擎下沉：`challenge-builder.ts` + `arena-runner.ts` + `match-html.ts` | 算法 | ✅ 完成 | API 层删除本地实现，改为再导出 |
| S6-3 🤖 | `challenge` CLI：预算/人数/目标/场景/标签/种子/模式/JSON/产物 | 算法 | ✅ 完成 | `cli-challenge.test.ts` 18 项 |
| S6-4 🤖 | Skill 元数据与说明：SKILL.md（官方 frontmatter）+ INSTALL.md + references | 全栈 | ✅ 完成 | 11 项集成测试校验 frontmatter 与必需文件 |
| S6-5 🤖 | Skill 脚本：run-match.mjs（定位仓库→调用共享引擎）、parse-request.mjs、install.mjs | 全栈 | ✅ 完成 | 真实子进程测试通过（含仓库外 cwd） |
| S6-6 🤖 | 自然语言解析：预算/人数/目标/场景/券/种子 + 歧义处理 | 全栈 | ✅ 完成 | 「3个人 预算60 要低卡 外带」解析正确 |
| S6-7 🤖 | 异常提示：CLI_USAGE_ERROR / 快照缺失 / Token 缺失 / MATCH_FAILED | 全栈 | ✅ 完成 | 退出码 2/3/3 实测存档 |
| S6-8 🤖 | 安装到用户级 `~/.workbuddy-ai/skills/mc-arena` 并真实调用 | 全栈 | ✅ 完成 | 从无关 cwd 调用成功；证据存档 `docs/evidence/stage06/` |
| S6-9 🤖 | `workbuddy.md`：真实开发阶段/指令/功能/调试/证据 + 脱敏 + 缺失注明 | 架构师 | ✅ 完成 | 原始对话导出待用户追加 |
| S6-10 🤖 | 测试与门禁：新增 55 项（全库 189/189）+ typecheck/lint/build 全绿 + 本地提交 | 全栈 | ✅ 完成 | 未 push GitHub |

## 阻塞项登记（Blockers）

| 编号 | 描述 | 解除条件 | 影响范围 |
|---|---|---|---|
| B1 | 麦当劳 MCP Token 未申请（需手机号验证登录+人机验证，AI 无法代办） | 用户在 open.mcd.cn/mcp 完成登录激活 | P1-4 实测 schema、live 模式、裁判 `verified/mismatch` 实测；不影响 replay/mock 全链路 |
| B2 | GitHub 公开仓库未创建 | 用户手动建仓 | P5 发布；不影响本地开发 |
| B3 | `snapshots/` 无官方快照（阶段06 新登记） | 采集并放入官方快照，或申请 Token 后实时采集 | replay 模式与 Skill 的官方数据演示；当前回退场景数据集（已明确标注 mock） |
| B4 | ~~阶段05 浏览器实测与截图未完成~~ **已解除（10/14）** | — | 已完成：控制台 0 错误 + 9 张截图 + `STAGE_05_REPORT.md` |
| B5 | 演示 GIF 未录制；未做跨浏览器与真机实测（阶段05 新登记） | 使用录屏工具；在 Firefox/Safari 与真机复测 | 交付物打磨；不影响功能验收 |

