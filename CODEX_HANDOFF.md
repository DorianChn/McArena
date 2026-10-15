# CODEX_HANDOFF — McArena 移交文件

> 本文件由 WorkBuddy 在阶段08 生成，用于把项目完整移交给 Codex 执行**发布阶段**工作。
> 生成时间：2026-10-15（北京时间）。此后仓库若再有提交，以 `git log` 为准。

---

## 1. 项目绝对路径

```
<仓库根目录>
```

- 会话当前工作目录通常**不是**仓库目录，执行 git/npm 命令前请先 `cd` 或使用 `-C` / `--prefix`；
- 本机为 Windows 11（Git Bash 可用），Node 建议 ≥ 20（开发用 22.x），npm ≥ 10；
- 本机注意事项：`npm run dev` 曾因本机安全防护（Vite 清理 `.vite/deps` 被拦截）不可用，全部浏览器实测改用 `npm run preview`（生产构建）完成；API 端口 8787 常被既有进程占用，启动前先 `curl http://127.0.0.1:8787/api/healthz` 复用。**这些是本机环境问题，不影响公开仓库用户的正常使用。**

## 2. 技术栈和目录结构

- npm workspaces × 5 包；TypeScript strict 全量；ESLint（typescript-eslint 类型感知）
- `packages/shared`：zod 契约（单一事实来源）
- `packages/mcd-mcp-client`：官方 MCP Streamable HTTP 客户端（JSON-RPC 2.0 / SSE / 限流 600 次每分 / 指数退避 / 只读白名单 + 写操作黑名单 / 快照采集）
- `packages/arena-core`：竞技内核（RuleEngine / 双 Agent / 独立裁判，零网络纯函数）+ `demo` / `bench` / `challenge` CLI + HTML 战报渲染
- `apps/api`：Fastify（`/api/match`、`/api/match/:id/stream` SSE、`/api/snapshot`、`/api/healthz`），tsup 打包
- `apps/web`：React 19 + Vite 7 + Tailwind v4（四页面 / 双主题 / SVG 雷达图 / 分享卡）
- `skill/mc-arena/`：WorkBuddy Skill（SKILL.md + 三个零依赖脚本 + references + INSTALL.md）
- `tools/`：快照采集 CLI、报名就绪自查、GIF 帧捕获、浏览器实测（playwright-core 隔离加载）
- 测试：Vitest（22 文件 / 222 例）；E2E：playwright-core + 系统 Chrome
- CI：`.github/workflows/ci.yml`（build + test + lint + audit）

## 3. 当前 Git 分支与提交

- 分支：`main`（唯一分支）
- 截至本文件生成时的提交（阶段08 提交后以 `git log` 为准）：

```
5ca3a7d feat(tools): 快照采集 CLI + 报名就绪自查 + GIF 帧捕获，补齐阶段01/发布链路
dabeac3 docs(tasks): 登记阶段07 完成情况与阻塞项 B6/B7
0b7cc81 test(stage07): 完整质量保证 + 安全审计 + 稳定性修复（215 用例全绿）
（更早：3e42e2c / 5630336 / f5b301f / 23767dc，以及阶段04–06 其余提交）
```

- **未配置 git remote，未 push 任何内容**（按用户要求，不自动建仓、不 push）；
- 工作树保持干净（所有变更已本地提交）。

<!-- APPEND-MARKER -->

## 4. 已实现功能（按阶段，全部真实完成）

| 阶段 | 功能 | 验证 |
|---|---|---|
| 00/01 | workspaces 五包骨架、zod 契约、MCP 客户端、Fastify API、React Web、CI | 单测 |
| 02 | MCP 协议层：Streamable HTTP / JSON-RPC / SSE 解析 / 限流 / 退避 / 只读白名单 + 写操作黑名单 / 快照回放 | 假服务器契约测试 |
| 03 | 双 Agent 竞技引擎：α 单遍贪心（候选 1）/ β 束搜索（候选 46–288）、状态机（超时/取消/降级）、8 场景基准 | 66 项 |
| 04 | 独立裁判：不信任 Agent 自述，独立重算餐品/价格/优惠/营养；资格硬门槛；官方核价优先（NOT_VERIFIED 标注）；五维打分；可复现 experimentId | 66 项 |
| 05 | 完整前端：四页面 / 双主题 / 响应式 / 分享卡 / 无障碍；真实浏览器 16 步实测 0 控制台错误 | 5 项 UI 测试 + E2E |
| 06 | WorkBuddy Skill：三端同源 `runArenaMatch()`、`challenge` CLI、自然语言解析、安装脚本；已安装到用户级技能目录并真实调用 | 11 项集成测试 |
| 07 | 质量保证：lint 31→0、测试 215→222、audit 4→0、浏览器复测、四份报告 | 见报告 |
| 08 | 参赛文档五件套 + 传播材料 + 就绪自查 + GIF 帧 + 生产构建冒烟 + 本移交文件 + 最终报告 | 本文档第 8 节 |

## 5. 真实 MCP 接入状态（如实移交）

- **协议层已完成并有测试**：initialize / tools/list / tools/call、401（立即中止不重试）、429（指数退避）、SSE 帧解析、限流计数；写操作默认拒绝（`create-order` 等黑名单）；
- **真实 live 联调 ⛔ BLOCKED**：MCP Token 未申请（需用户在 https://open.mcd.cn/mcp 手机号登录 + 人机验证，AI 无法代办）。**未把任何未验证功能描述为已完成**；
- **快照采集工具已就绪**：`MCD_MCP_TOKEN=<token> tsx tools/snapshot-capture.ts`（或 `npm run` 脚本见 `snapshots/README.md`），产出 `snapshots/snap-<ISO>/` + 逐文件 sha256 manifest；`snapshots/` 当前为空（空时引擎自动回退场景数据集 mock，界面强制标注）；
- **契约字段未经真实 schema 实测**：采集工具只落原始响应不做字段映射（`mappingVerified` 恒 false），类型化快照组装待 Token 到位后按实测 schema 校正（TASKS.md P1-6）。

## 6. Skill 实测情况

- **参赛 Skill `mc-arena`**：安装脚本 `node skill/mc-arena/scripts/install.mjs` 已真实执行，安装于 `~/.workbuddy-ai/skills/mc-arena`；从无关 cwd 真实调用成功（中文战报 + JSON + HTML 产物），退出码语义实测（2=用法错误 / 3=缺 Token 或快照缺失）；证据 `docs/evidence/stage06/`；
- **验收技能 `mca-stage-verify`**（WorkBuddy 侧复用资产，非参赛物）：`~/.workbuddy-ai/skills/mca-stage-verify/`，quick_validate 通过；
- Skill 与网页/CLI **三端同源**：`skill/mc-arena/scripts/run-match.mjs` → `arena-core` 的 `challenge` CLI → `runArenaMatch()`，无第二套业务逻辑。

<!-- APPEND-MARKER-2 -->

## 7. 环境变量配置说明

复制 `.env.example` 为 `.env`（`.env` 已在 `.gitignore`，禁止提交）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `MCD_MCP_MODE` | `mock` | `mock`（演示，界面标注模拟数据）/ `replay`（快照回放）/ `live`（实时，需 Token） |
| `MCD_MCP_TOKEN` | 空 | 官方 Token，仅本机 `.env`；仓内无任何真实凭据 |
| `MCD_MCP_URL` | `https://mcp.mcd.cn` | 官方接入地址 |
| `MCD_MCP_MAX_RPM` | `300` | 客户端分钟级限流（官方上限 600，保守取 300） |
| `MCD_MCP_TIMEOUT_MS` | `15000` | 单请求超时 |
| `MCD_ALLOW_WRITE_TOOLS` | `false` | 写操作总开关，默认严禁（下单类工具） |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `8787` | API 监听 |
| `LOG_LEVEL` / `CORS_ORIGIN` | `info` / `*` | 日志与跨域 |

WorkBuddy 连接器配置样例见 `mcp-config.example.json`（仅 `${MCD_MCP_TOKEN}` 占位符，结构与官方开发指南一致）。

## 8. 全部测试命令与结果（2026-10-15 实测）

| 命令 | 结果 |
|---|---|
| `npm run verify`（lint + typecheck + build + test） | ✅ 全绿：ESLint **0 error / 0 warning**；typecheck **0 错**；build 成功（API 13.6KB + Web dist）；**test 22 文件 / 222 例全过** |
| `npm audit`（全量 + `--omit=dev`） | ✅ **0 vulnerabilities** |
| `npm run demo` | ✅ 输出完整 MatchRecord（实测 α 66.3 : β 65.3） |
| `npm run challenge -w @mcarena/arena-core -- --people 2 --budget 60 --goal balanced --seed 42` | ✅ 同种子输出同一 `experimentId`（exp_bcc724febf31e0b8，与 10-14 实测一致） |
| `npm run bench` | ✅ 8 场景通过 |
| `node tools/contest-readiness.mjs --online` | 🟡 **9/10**（唯一失败：git remote 未配置——需先建仓） |
| 生产构建 + preview 冒烟 | ✅ index 1054B / CSS 39471B / JS 286592B 全 HTTP 200，`/api` 代理通 |
| 真实官方 MCP live 联调 | ⛔ **BLOCKED（无 Token）**——未记 PASS，见第 5 节 |

复现命令（可复跑）：`npm ci && npm run verify`。浏览器实测（需系统 Chrome）：
`NODE_PATH="<playwright-core 所在 node_modules>" node tools/e2e/visual-check.mjs`。

## 9. 尚未解决的问题（阻塞项）

| # | 问题 | 解除条件 | 影响 |
|---|---|---|---|
| B1/B6 | 无官方 MCP Token（手机号 + 人机验证，AI 无法代办） | 用户申请后写入 `.env` | live 模式、真实 schema 校正；**不影响**演示/replay 全链路与报名 |
| B2 | git remote 未配置、GitHub 仓库未创建 | 用户手动建 Public 仓 | 就绪自查 9/10 → 10/10；push 与 CI |
| B3 | `snapshots/` 无官方快照 | Token 到位后运行采集 CLI | 官方数据回放；当前回退 mock（已标注） |
| B5 | GIF 未合成（20 帧已就绪，本环境不生成视频）；未做跨浏览器/真机实测 | 用户用 ffmpeg 合成；Firefox/Safari/真机复测 | 交付物打磨；不影响功能验收 |
| B7 | 本机 `npm run dev` 受安全防护限制 | 换机器/关闭防护 | 本机开发体验；不影响交付 |

<!-- APPEND-MARKER-3 -->

## 10. GitHub 发布建议（执行前先取得用户明确同意）

1. **建仓**：在 GitHub 创建 **Public** 仓库 `McArena`（创建时间须在 2025-12-25 ~ 2026-10-25 23:59 之间——本仓库首次提交 2026-10-14，合规）；
2. **替换占位符**：全库检索 `OWNER/McArena`（README 的 CI badge 与 clone 命令），替换为实际用户名；
3. **push**：`git remote add origin <url> && git push -u origin main`；
4. **CI 复核**：push 后确认 `.github/workflows/ci.yml` 全绿（本地 verify 已绿，预期无惊喜）；
5. **可选**：打 `v1.0.0` tag + Release；把 `docs/screenshots/demo.gif`（合成后）提交进仓库；
6. **禁止事项重申**：不得提交 `.env` 或任何真实 Token；不得把 mock 数据冒充官方数据。

## 11. 官方报名方法

- **渠道**：在活动仓库 https://github.com/M-China/mcd-developer-innovation-challenge 的 Issue 列表提交报名 Issue（使用官方标准格式）；
- **格式**（标题自定义；正文四行，标签与内容同行，地址贴裸 URL 不用 Markdown）：

```
【参赛申请】
项目名称：McArena（麦门 AI 竞技场）
项目地址：https://github.com/<你的用户名>/McArena
项目简介：基于麦当劳中国 MCP 只读接口的双算法 Agent 点餐竞技场：极速猎手（单遍贪心）与深度优化师（束搜索）在同一任务卡与同一数据快照上对决，独立规则裁判五维打分并逐项重算，全程可解释、可复现，公开演示模式无需 Token。
```

- 现成文案（含注意事项与检查清单）：[`docs/contest-registration.md`](docs/contest-registration.md)；
- **截止：2026-10-25 23:59（北京时间）**；以 2026-10-26 00:00 的公开 Star 数定榜，Star > 0 才进排行榜；报名成功后系统会在 Issue 下回复，失败可按原因修改后重新提交；
- 参加 WorkBuddy 专项奖励需已提交 `workbuddy.md`（已就绪，且需在 Issue 报名外满足官方核验条件）。

## 12. 需要 Codex 完成的最后工作

1. 与用户确认后创建 Public 仓库并 push（第 10 节）；
2. push 后复核 CI 全绿；如失败按日志修复后重新 push；
3. 替换 README 中 `OWNER` 占位符并提交；
4. 代表/协助用户在活动仓库提交报名 Issue（**必须经用户明确授权后执行**，用户未授权前只准备好文案）；
5. 报名后按用户意愿协助推广（Star > 0 才进榜）；
6. 可选：用户提供 Token 后执行 live 联调与快照采集，回填 MCP_INTEGRATION.md 实测记录（TASKS.md P1-4/P1-6）；
7. 全部发布动作完成后，把最终状态回报用户。

---

**移交边界**：WorkBuddy 已完成全部本地开发、文档、测试与整理；**发布动作（建仓 / push / 发 Issue）刻意未执行**，按用户要求等待 Codex/用户执行。



