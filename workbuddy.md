# workbuddy.md

> 本文件用于记录使用腾讯 WorkBuddy 开发本项目的**真实**对话上下文与工作成果，
> 作为「2026 麦当劳程序员创意开发大赛」WorkBuddy 专项奖励的核验材料。
>
> **真实性声明（必读）**
> - 本文内容依据本项目 WorkBuddy 开发会话的**阶段摘要与真实产物**整理，所有功能、命令、测试数字、文件路径均可在仓库中复核。
> - 本环境**无法访问完整的原始对话导出**（逐条消息全文），因此本文**不逐字复刻**原始对话；缺失部分已在文末「缺失与待补」中明确列出，**未做任何编造**。
> - 全部 Token、Cookie、账号、手机号、邮箱、本地用户名等敏感信息均已脱敏（见「脱敏说明」）。

---

## 一、使用 WorkBuddy 的开发阶段

| 阶段 | 名称 | 交付物（真实存在于仓库） | 状态 |
|---|---|---|---|
| 阶段00 | 立项与架构设计 | `PROJECT_PLAN.md`、`ARCHITECTURE.md`、`TASKS.md`、`ACCEPTANCE_CRITERIA.md`、`CONTEST_DECLARATION.md` | ✅ |
| 阶段01 | 基础工程与架构实现 | npm workspaces 五包骨架、`packages/shared`（zod 契约）、`packages/mcd-mcp-client`、`packages/arena-core`、`apps/api`（Fastify）、`apps/web`（React+Vite）、CI | ✅ |
| 阶段02 | 麦当劳 MCP 真实接入 | `packages/mcd-mcp-client/src/http-adapter.ts`（Streamable HTTP + JSON-RPC + SSE + 限流 + 重试）、`MCP_INTEGRATION.md` | ✅（Token 未申请，见阻塞项） |
| 阶段03 | 双 Agent 竞技引擎 | `speed-agent.ts`、`optimizer-agent.ts`、`rule-engine.ts`、`price-oracle.ts`、`scenarios.ts`、`cli/demo.ts`、`STAGE_03_REPORT.md` | ✅ |
| 阶段04 | 独立智能裁判系统 | `engine/verifier.ts`、`engine/judge.ts`（重写）、`JUDGE_SPEC.md`、`STAGE_04_REPORT.md` | ✅ |
| 阶段05 | 完整前端 UI/UX 实现 | `apps/web` 设计系统 + 首页/挑战设置/竞技场/结果四页 + 分享卡 | ✅（代码完成；见阻塞项） |
| 阶段06 | WorkBuddy Skill 集成 | `skill/mc-arena/`（SKILL.md + scripts + references + INSTALL.md）、`STAGE_06_REPORT.md`、本文件 | ✅ |
| 阶段07 | 完整质量保证、安全审计与稳定性修复 | lint 31→0、测试 215 例（+8 并发）、`npm audit` 4→0、浏览器 16 步实测 0 控制台错误；`STAGE_07_REPORT.md` / `TEST_REPORT.md` / `SECURITY_AUDIT.md` / `PERFORMANCE_REPORT.md` | ✅ |
| 阶段08 | 参赛文档、演示、发布前整理与交付 | `README.md`（真实截图/使用案例/模式区分）、`MCP_INTEGRATION.md`、`docs/PROMOTION.md`、`tools/contest-readiness.mjs`、GIF 帧采集器、`CODEX_HANDOFF.md`、`FINAL_WORKBUDDY_REPORT.md` | ✅（本地整理完成；发布动作移交） |

---

## 二、真实指令与工作摘要

以下为用户在各阶段给出的真实指令（摘要形式，保留关键约束），以及 WorkBuddy 的实际工作摘要。

### 阶段00 — 立项与架构
- **指令**：以 McArena 首席架构师身份参加 2026 麦当劳程序员创意开发大赛；产出项目计划、架构设计、任务拆解与验收标准。
- **工作**：建立四大文档；确定「双 Agent 竞技 + 独立裁判」核心创意；确定只读白名单 + 写操作黑名单的 MCP 使用边界。

### 阶段01 — 基础工程
- **指令**：完成基础工程与架构实现。
- **工作**：npm workspaces 五包；`zod` 作为跨模块契约唯一事实来源；`DataOrigin` 三分法（`official-live` / `official-snapshot` / `mock`）；Fastify API（`/api/match`、`/api/match/:id/stream` SSE、`/api/snapshot`、`/api/healthz`）；React Web 骨架；CI 配置。

### 阶段02 — MCP 接入
- **指令**：执行麦当劳 MCP 真实接入。
- **工作**：实现 `HttpMcpAdapter`（Streamable HTTP、JSON-RPC 2.0、SSE 帧解析、限流 600 次/分、指数退避重试）；实现 `MockMcpAdapter` 与测试夹具；撰写 `MCP_INTEGRATION.md`。
- **结果**：协议层完成并通过契约测试；**真实 Token 未申请**（申请需手机号验证 + 人机验证，AI 无法代办），故 `live` 模式留待用户授权后启用。

### 阶段03 — 双 Agent 竞技引擎
- **指令**：执行双 Agent 竞技引擎。
- **工作**：实现两个**算法实质不同**的 Agent：
  - `speed-greedy@1.0.0`（极速猎手）：单遍贪心，候选数固定 1；
  - `optimizer-search@1.0.0`（深度优化师）：束搜索（BEAM_WIDTH=8）+ 多候选逐一真实计价，候选数 46–288。
  实现 `RuleEngine`（种子 → 可复现任务卡）、`ReplayPriceOracle`、状态机 `MatchOrchestrator`（超时 / 取消 / 降级恢复）、8 个官方测试场景与基准对比 CLI。

### 阶段04 — 独立智能裁判系统
- **指令（关键约束）**：创建独立裁判，**裁判不能信任 Agent 自己报告的成绩**；必须独立检验商品真实性、预算、人数、营养、优惠券；优先用官方 `calculate-price` 核价，无法核价时标注 `NOT_VERIFIED`；计算有效性/成本/综合得分/实际响应时间；自动判定赢家或平局；**无效方案不能凭低价赢**；同成本比营养；速度作次级维度；比较时确保输入与数据版本一致；可解释报告 + 违规原因 + 数据证据引用 + 可复现实验 ID + JSON 结果；**构建不少于 50 个有效自动化测试用例**，且**测试数量必须来自真实执行结果，不得伪造**。
- **工作**：
  - 新建 `verifyAgentProposal()`：独立重算餐品存在性/在售/数量/重复/单价/预算/人数/种类/必选/标签/类别/优惠券逐张校验/价格核验/营养达成率；
  - 重写 `RuleBasedJudge`：五维得分全部改为「裁判重算值」输入，不再读取 Agent 自述；
  - 字典序胜负判定：资格 → 官方核验成本 → 裁判重算成本 → 营养/目标达成率 → 响应时间 → 平局；
  - 新增 `experimentId`（FNV-1a 变体，16 位十六进制）、`costBasis`、`allViolations`；
  - 契约扩展 `ViolationSeverity` / `JudgeViolationCode`（21 码）/ `JudgeCheck` / `PriceVerificationStatus` / `AgentVerification` / `CostBasis`；
  - **新增 66 个测试**（`verifier.test.ts` 35 项 + `judge.test.ts` 31 项），全库 **132/132 通过**。

### 阶段05 — 完整前端 UI/UX
- **指令（关键约束）**：以资深前端工程师/交互设计师/产品设计师身份，开发**完成度高、适合公开演示**的中文 AI Agent 竞技场；六大块（首页 / 挑战设置 / 竞技场 / 比赛结果 / 分享功能 / 中文界面+响应式+深浅色+状态页+无障碍）；React + TypeScript + Tailwind；公开演示模式**不得要求用户提供麦当劳账户或 Token**；**不得在浏览器暴露服务端密钥**；**禁止伪造历史战绩、真实用户数量和官方排行榜**；完成后实际启动网页、浏览器交互测试、移动端检查、控制台检查、生成 `STAGE_05_REPORT.md`；**不要提交 GitHub**。
- **工作**：Tailwind v4 `@theme inline` 语义化变量 + 双主题；零依赖 hash 路由；纯 SVG 五维雷达图；`html-to-image` 动态导入导出 PNG；React Context 状态中枢（含竞态保护）；四页面 + 分享卡；API 契约扩展 `constraints` 支持自定义挑战；无障碍（焦点环、`prefers-reduced-motion`、44px 触摸目标、`aria-*`、跳转链接）。
- **结果**：typecheck 0 错、lint 0 错、web build 成功、全量测试 134/134。

### 阶段06 — WorkBuddy Skill 集成（本轮）
- **指令（关键约束）**：先查阅当前 WorkBuddy 官方 Skill 开发规范；创建 Skill 目录/元数据/说明文件；将 Challenge Engine 接入 Skill；支持自然语言启动、自动解析预算/人数/目标；调用**实际实现**的双 Agent 引擎与独立裁判；返回结果与评分解释；输出可打开的竞技场结果或可复现配置；提供标准示例命令与异常提示；真实测试运行效果。必须：Skill 可真实调用；**不复制另一套不一致的业务逻辑**；**与网页共享核心引擎**；有明确安装与启用教程；**不编造官方规范**；如版本限制某项能力，记录实际限制并实现可行替代方案。另需创建 `workbuddy.md`（基于真实会话与成果、自动脱敏、缺失需注明），最后生成 `STAGE_06_REPORT.md`，**不要提交 GitHub**。
- **工作**：见下方「真实完成的功能」与 `STAGE_06_REPORT.md`。

### 阶段07 — 完整质量保证、安全审计与稳定性修复
- **指令（关键约束）**：不增加新功能，把项目打磨到可公开发布质量；每发现问题须记录、修复并回归；**不得删除失败测试、跳过检查或伪造 Mock**；无 Token 的真实接口测试必须标 **BLOCKED 不能记 PASS**；产出 TEST/SECURITY_AUDIT/PERFORMANCE/STAGE_07 四份报告；**不上传 GitHub**。
- **工作**：lint 31 warning → 0（CLI `no-console` 文件级豁免 + react-refresh `allowExportNames` 精确豁免 + no-unsafe 真修）；新增测试 8+5+2+3+3+3 例达 **222 例全绿**；`npm audit` 4 漏洞 → 0（vitest 3→5 + tsup 8→9）；6 处源码修复（rate-limiter 限额校验、retry 纳入 McpUnavailableError、JSON.parse any→unknown 等）；SSE 未知 id 由 200 空流改 404；真实 Chrome + 隔离 playwright-core 完成 16 步浏览器实测（控制台 0 错误/0 警告），8 张截图归档 `docs/screenshots/stage07/`。
- **诚实性执行**：真实官方 MCP 联调无 Token → 明确 BLOCKED，未记 PASS；未删/跳任何测试。

### 阶段08 — 参赛文档、演示与发布前整理
- **指令（关键约束）**：重新核对官方赛事规则；完善五大参赛文件；准备传播材料；**不得伪造画面冒充程序运行**；不得自动建仓/push/发报名 Issue；本地变更整理后跑最后一次完整测试；生成 `CODEX_HANDOFF.md` 与 `FINAL_WORKBUDDY_REPORT.md`（末尾 READY_FOR_CODEX = YES/NO，只有真正达到发布条件才能 YES）。
- **工作**：联网核对官方规则与 CONTEST_DECLARATION 原文（字节级一致）；README 补真实截图、使用案例、演示/实时模式区分表、更新测试基线 222；`docs/PROMOTION.md`（中英文介绍/GitHub 描述/技术亮点）；`tools/contest-readiness.mjs` 10 项就绪自查；`tools/e2e/capture-demo-frames.mjs` 采集 20 帧 GIF 素材（**不合成视频**，命令交用户）；生产构建 + preview 启动冒烟。

---

## 三、真实完成的功能（可在仓库中逐项复核）

### 1. 共享核心引擎（阶段06 关键：三端同源）
| 模块 | 路径 | 作用 |
|---|---|---|
| 任务卡构造器 | `packages/arena-core/src/engine/challenge-builder.ts` | `buildCustomChallenge()` / `buildConstraintsFromParams()` / `buildChallengeFromParams()` / `GOAL_PRESETS`——Web·API·CLI·Skill 的**唯一**实现 |
| 单局运行器 | `packages/arena-core/src/engine/arena-runner.ts` | `runArenaMatch()`：任务卡 → α → β → 独立裁判，返回结果与事件 |
| HTML 战报 | `packages/arena-core/src/render/match-html.ts` | `renderMatchHtml()`：零依赖自包含战报 |
| CLI | `packages/arena-core/src/cli/challenge.ts` | `challenge` 子命令（预算/人数/目标/场景/标签/种子/模式/JSON/产物） |

> 阶段06 把原先位于 `apps/api/src/services/match-service.ts` 的 `buildCustomChallenge()` **下沉**到 `arena-core`，
> 并由 `match-service.ts` 再导出，**消除了网页与 Skill 之间的重复实现**（对应「不复制另一套不一致的业务逻辑」）。

### 2. WorkBuddy Skill
| 文件 | 说明 |
|---|---|
| `skill/mc-arena/SKILL.md` | 官方规范 frontmatter（`name` / `description` / `agent_created: true` 等）+ 执行步骤 + 异常处理 + 硬性约束 |
| `skill/mc-arena/scripts/run-match.mjs` | 零依赖入口：定位仓库 → 调用共享引擎 CLI → 透传退出码 |
| `skill/mc-arena/scripts/parse-request.mjs` | 自然语言 → 参数（预算/人数/目标/场景/券/种子），可测试、可复现 |
| `skill/mc-arena/scripts/install.mjs` | 安装到 `~/.workbuddy-ai/skills/`，写入 `.mcarena-root` 仓库定位标记 |
| `skill/mc-arena/references/*.md` | `challenge-params.md`、`scoring.md`、`mcp-tools.md`、`examples.md` |
| `skill/mc-arena/INSTALL.md` | 安装、启用、验证、故障排查、卸载 |

### 3. 测试（真实执行结果）
| 阶段 | 测试数 | 命令 |
|---|---|---|
| 阶段01–02 | 63 | `npm test` |
| 阶段03 | 66 | `npm test` |
| 阶段04 | **132** | `npm test` |
| 阶段05 | 134 | `npm test` |
| 阶段06 | 189 | `npm test` |
| 阶段07 | **215** | `npm test` |
| 阶段07 后（快照工具） | **222** | `npm test`（22 文件） |

阶段06 新增 55 项：`challenge-builder.test.ts` 18 + `arena-runner.test.ts` 8 + `cli-challenge.test.ts` 18 + `skill-integration.test.ts` 11。

---

## 四、关键调试记录（真实问题与修复）

| # | 阶段 | 现象 | 根因 | 修复 |
|---|---|---|---|---|
| 1 | 03 | 双 Agent 算法被质疑「只是同一算法换皮」 | 初始两 Agent 共用同一候选生成器 | 拆分为单遍贪心（候选 1）与束搜索（候选 46–288），并在基准报告中用候选数/工具调用数作客观区分 |
| 2 | 04 | 复现性测试随机失败 | `judge.notes` / `headline` 写入了实测 `durationMs`，破坏 `canonicalizeMatch` 指纹 | 改为定性描述（「实测响应时间为真实测量值…不参与复现指纹」），速度破平分支不再写具体毫秒数 |
| 3 | 04 | 编译失败：`SCENE_DELIVERY_FEE_CENTS_SRC` 不存在 | 误引用不存在的导出名 | 改为 `import { SCENE_DELIVERY_FEE_CENTS } from './agent-utils.js'` |
| 4 | 04 | `applyCoupons` 参数不匹配 | 该函数需要 `lineTotalCents`，`verifyCoupons` 未构造 | 在 `verifyCoupons` 内构造 `cartItems` 后传入 |
| 5 | 04 | 裁判成本判定文案与事实相反 | `mismatch` / `verified` 分支写反 | 统一以 `officialCostCents !== null` 作为「官方口径」判据 |
| 6 | 04 | 测试夹具单价与数据集不一致导致误判 | `item()` 默认单价硬编码 | 增加 `PRICE_BY_CODE` 映射表 |
| 7 | 04 | oracle 键名排序不一致（`colax1+friesx1` vs `friesx1+colax1`） | 未按规范键序构造 | 修正测试键名 |
| 8 | 04 | `noUncheckedIndexedAccess` 报错（`verification[0]` 可能 undefined） | 严格索引检查 | 补 `!` / `?.` |
| 9 | 05 | 雷达图失真（双方共用一条曲线） | 前端用 `dimensions.map(score)`（该字段是双方**最高分**） | 契约新增 `agentScores`（含每方各维度原始分），前端改用真实单方得分 |
| 10 | 05 | 前端 lint 13 项错误 | 未用 import/变量、多余断言、`reload` 返回类型不符 | 逐项清理；`reload: () => Promise<void>` |
| 11 | 06 | CLI 战报出现「以 78.5 : 79.6 胜出」，易误读为「总分更低者获胜」 | 胜负由字典序（资格→成本→目标→速度）决定，与五维总分不必然同向，但文案未标注 | 改为「**五维总分** X : Y / 100」并附判定依据（`judge.ts` `headlineOf`） |
| 12 | 06 | 解析器不识别「双人」 | 中文数字表缺 `双` | `CN_DIGITS` 补 `双: 2`，正则字符类同步 |
| 13 | 06 | ESLint `no-base-to-string`：`String(obj)` 输出 `[object Object]` | `esc()` 直接 `String(value)` | 显式分支：对象走 `JSON.stringify`，仅标量走 `String` |
| 14 | 06 | Windows Git Bash 下调用脚本报 `Cannot find module 'C:\c\Users\...'` | Node（Windows 二进制）不识别 MSYS 的 `/c/...` 路径 | 传参统一使用 `C:/...` 形式；文档中示例亦注明 |
| 15 | 06 | 失败路径仍打印「已启用默认产物输出」，产生误导 | 提示在 spawn 前输出 | 改为仅在子进程退出码为 0 时输出 |
| 16 | 06 | 批量文件编辑时部分改动未落盘 | 编辑器批量替换部分失效 | 改为逐条编辑 + 每次编辑后用 `grep` 复核 |
| 17 | 05（实测） | 首页「对决双方」α 卡片被挤成窄条、标题逐字换行、区块被拉得极高 | Grid 模板为 `[1fr auto 1fr]`，但 DOM 顺序是 α、β、VS —— VS 落在第 3 轨，β 落在中间 `auto` 轨被撑到最大 | DOM 改为 α → VS → β；模板改 `[minmax(0,1fr)_auto_minmax(0,1fr)]`；标题容器加 `min-w-0` + `break-words` |
| 18 | 05（实测） | 浏览器控制台 404（`Failed to load resource`） | `index.html` 未声明 favicon，浏览器自动请求 `/favicon.ico` | 内联 SVG data-URI favicon，并补 `color-scheme` / `description` meta |
| 19 | 05（实测） | 结果页雷达图说明与实现不符（写「取双方较高值」，实际已用单方得分） | 后期把数据源从 `judge.dimensions` 改为 `judge.agentScores` 时未同步文案 | 文案改为「两条曲线分别是 α / β 的裁判独立重算得分（不取较高值）」 |
| 20 | 06（复核） | 结果页「🏆 胜出」旁徽章显示 `比分 69.3 / 100`，但 `judge.totalScore = max(α, β)` **可能显示败方分数**（α 以 62.8 胜出时徽章显示 β 的 79.9） | 胜负由字典序决定、与五维总分不必然同向，徽章却用了双方较高分 | 四处改为并列展示 α : β（结果页徽章 / JudgePanel 记分表新增两列 / 分享卡 / 分享文案），并在页脚注明「胜负由字典序判定，与五维总分不必然同向」 |
| 21 | 07 | `vitest --reporter=unix` 报错：formatter 不存在 | 该 formatter 名称不在 vitest 5 的已注册列表 | 改用默认 formatter + grep 提取汇总行 |
| 22 | 07 | `concurrency.test.ts` typecheck 4 处报错 | `noUncheckedIndexedAccess` 下 `responses[i]` 解构可能 undefined；`unknown` 不能直接赋 `InjectPayload` | 改 `responses.map()` 推导 + 显式 `PlanEntry[]` 类型标注 |
| 23 | 07 | ESLint 在收紧规则后报 31 条 warning | 26 条为 CLI 目录 `no-console`（console 即 CLI 产品接口）、2 条 react-refresh 的 Context+hook 同文件导出、5 条 no-unsafe 真问题 | 前两类用**精确豁免**（文件级 no-console / `allowExportNames: ['useApp','useTheme']`）并附中文注释；5 条真修（`expect.objectContaining` 嵌套返回 any → `toMatchObject`） |
| 24 | 07 后 | `capture-demo-frames.mjs` 把截图写进了 `tools/docs/screenshots/` | `repoRoot` 少退一级（`import.meta.dirname/..` 没有到仓库根） | 改 `path.resolve(import.meta.dirname, '..', '..')`，清理错目录后重跑 |
| 25 | 07 后 | 帧文件名出现双扩展 `.png.png` | `snap(page, 'home')` 已自动补 `.png`，又手写了扩展名 | 改为无扩展名调用 |
| 26 | 07 后 | 就绪脚本密钥扫描 `git grep` 报 `':!package-lock.json' is outside repository` | Windows 下 Node `execSync` 走 cmd.exe，单引号 pathspec 被原样传递 | 改 `execFileSync('git', [...])` 直接传参数组，JS 侧过滤 lock 行 |
| 27 | 07 后 | `tsconfig.json` 纳入 `tools/**` 后 3 处新类型错误 | 新工具直接消费 `JSON.parse` 的 any；logger 形参缺 `level` 字段 | `JSON.parse` 结果改为显式结构体断言；logger 类型改 `ReturnType<typeof createSilentLogger>` |
| 28 | 07/08 | 同一文件多个 Edit 并行发送，改动互相覆盖 | 并行 Edit 各自基于旧快照写回 | **同文件的多处修改必须顺序逐条编辑**（本轮多次复踩，已固化到工作习惯） |

---

## 五、可核验的开发证据

### 1. Git 提交记录（本地，未 push）
```
5ca3a7d feat(tools): 快照采集 CLI + 报名就绪自查 + GIF 帧捕获，补齐阶段01/发布链路
dabeac3 docs(tasks): 登记阶段07 完成情况与阻塞项 B6/B7
0b7cc81 test(stage07): 完整质量保证 + 安全审计 + 稳定性修复（215 用例全绿）
3e42e2c feat(stage04): 独立智能裁判系统——不信任 Agent 自述的验证与裁决
5630336 feat(stage-03): dual-agent arena engine (Speed + Optimizer) with state machine and benchmark
f5b301f feat(stage-01): engineering foundation - shared contracts, MCP adapter, arena core, Fastify API, React web, CI
23767dc chore: initialize McArena project (docs, compliance files, skeleton)
```
（阶段08 的提交见 `git log` 最新条目；完整历史以仓库为准。）

### 2. 可复现命令与真实输出
| 证据文件 | 内容 |
|---|---|
| `docs/evidence/stage06/01-run-match-human.txt` | Skill 中文战报真实输出 |
| `docs/evidence/stage06/02-run-match-json.json` | Skill JSON 输出（含 `experimentId`、`reproducibleConfig`） |
| `docs/evidence/stage06/03-parse-request.txt` | 自然语言解析真实输出 |
| `docs/evidence/stage06/04-error-paths.txt` | 异常路径真实输出（退出码 3 / 2 / 3） |
| `docs/evidence/stage06/sample-match-report.html` | 可直接用浏览器打开的 HTML 战报（真实生成） |
| `docs/evidence/stage06/sample-match-result.json` | 完整比赛记录（可复现） |
| `docs/screenshots/stage05/*.png` | 真实浏览器截图 9 张（深/浅色、桌面/移动端、空状态） |
| `docs/evidence/stage05/visual-check-report.json` | 浏览器实测结构化报告（16 步、控制台消息、视口、主题切换结果） |
| `docs/screenshots/stage07/*.png` | 阶段07 复核截图 8 张（16 步全链路 + 移动端 + 主题切换，控制台 0 错误/0 警告） |
| `docs/screenshots/gif-frames/` | GIF 帧素材 20 张 + `capture-summary.json`（`tools/e2e/capture-demo-frames.mjs` 真实采集，未合成） |
| `docs/contest-registration.md` | 报名 Issue 待发布文案（官方格式已联网核对） |

### 3. 关键命令（可自行复跑）
```bash
npm install
npm test          # 222/222 通过（22 文件）
npm run typecheck # 0 错误
npm run lint      # 0 error / 0 warning
npm run build     # API + Web 构建成功
npm run bench     # 8 个官方场景双 Agent 基准对比

node skill/mc-arena/scripts/parse-request.mjs "3个人 预算60 要低卡 外带"
node skill/mc-arena/scripts/run-match.mjs --people 2 --budget 60 --goal balanced --seed 42

# 前端浏览器实测（本机 dev 受安全防护限制，用生产 preview 替代）
NODE_PATH="<隔离工作区>/node_modules" node tools/e2e/visual-check.mjs
```

### 4. 阶段报告
`STAGE_03_REPORT.md`、`STAGE_04_REPORT.md`、`STAGE_06_REPORT.md`、`JUDGE_SPEC.md`、`MCP_INTEGRATION.md`、`ARCHITECTURE.md`、`TASKS.md`。

---

## 六、脱敏说明

- 本文与仓库中**不含**任何真实 Token、Cookie、API Key、账号、手机号、邮箱、身份证或私人数据。
- `.env` 已在 `.gitignore` 中排除，仅提交 `.env.example`（占位值）。
- 麦当劳 MCP Token **从未获取**，因此不存在泄露风险；日志器（`packages/shared/src/logger.ts`）对 `token` / `authorization` / `password` 等字段自动输出 `[REDACTED]`，并有单测覆盖。
- 文中的安装路径均使用通用占位符，仅用于说明命令形式，不包含真实本地路径。

---

## 七、缺失与待补（不编造）

1. **完整原始对话导出缺失**：本环境无法读取 WorkBuddy 对话的逐条原文，本文的阶段指令与摘要来自开发会话的阶段记录与仓库真实产物，**不是逐字复刻**。如需逐字原文，请在 WorkBuddy 对话右上角使用「导出」功能，并将导出内容按下方格式追加。
2. **阶段05/07 浏览器实测已补做**：`tools/e2e/visual-check.mjs`（playwright-core + 系统 Chrome）真实点击走通
   首页 → 挑战设置 → 竞技场 → 结果页 → 移动端 → 空状态，控制台 **0 错误 / 0 警告**，产出截图与
   `STAGE_05_REPORT.md` / `STAGE_07_REPORT.md`。**仍缺**：演示 GIF 合成（帧素材 20 张已就绪，本环境不生成视频，命令已交用户）、跨浏览器（Firefox/Safari）与真机移动端实测。
3. **MCP 官方数据缺失**：`snapshots/` 目录暂无官方快照，`live` 模式需 Token。因此阶段05/06/07 的实测均运行在
   **场景数据集（mock）**上，输出中已明确标注「模拟数据，非麦当劳官方数据」。**未**伪造任何 `verified` 核价状态。
4. **GitHub 发布未执行**：按要求**未提交 GitHub**（本地提交已完成；建仓 / push / 发报名 Issue 均按要求交由用户与 Codex 执行）。

### 原始导出追加区（待用户补充）

```
<!-- 在此粘贴 WorkBuddy 对话「导出」生成的原始内容（保留时间戳） -->
```

| 序号 | 导出日期 | 覆盖会话范围 | 备注 |
|---|---|---|---|
| 1 | 2026-10-14 | 架构设计与项目初始化阶段 | 占位，待导出追加 |
| 2 | 2026-10-14 | 阶段03–06 实现与调试 | 占位，待导出追加 |
