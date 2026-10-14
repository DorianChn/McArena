# STAGE 06 报告 · WorkBuddy Skill 集成

> 目标：让 McArena 不仅能在网页中运行，也能作为**真正的 WorkBuddy Skill** 使用。
> 时间：2026-10-14｜状态：✅ 完成（本地提交，**未 push GitHub**）

---

## 一、官方规范查阅（不编造）

查阅对象：WorkBuddy 内置 `skill-creator` 技能（官方 Skill 开发规范）：

- `resources/plugins/workbuddy-builtin/skills/skill-creator/SKILL.md`
- `resources/plugins/workbuddy-builtin/skills/skill-creator/scripts/quick_validate.py`
- `resources/plugins/workbuddy-builtin/skills/skill-creator/scripts/init_skill.py` / `package_skill.py`

据此确认的**实际要求**（原文要点，非推测）：

| 要求 | 来源 | 本项目落实 |
|---|---|---|
| `SKILL.md` 必须存在，且以 YAML frontmatter 开头 | `quick_validate.py` | ✅ |
| frontmatter 必须含 `name`、`description` | `quick_validate.py` | ✅ |
| `name` 必须为 hyphen-case（`^[a-z0-9-]+$`，不得以 `-` 开头/结尾、不得连续 `--`） | `quick_validate.py` | ✅ `mc-arena` |
| `description` 不得包含尖括号 `<` `>` | `quick_validate.py` | ✅ |
| frontmatter 必须含 `agent_created: true`（便于后续 skill_manage 修改/删除） | `SKILL.md` §SKILL.md | ✅ |
| 目录结构：`SKILL.md` + 可选 `scripts/` `references/` `assets/` | `SKILL.md` §Anatomy | ✅（无 assets，未使用） |
| description 用第三人称（"This skill should be used when…"） | `SKILL.md` §Metadata Quality | ✅ |
| 正文用祈使/不定式（imperative），非第二人称 | `SKILL.md` §Writing Style | ✅ |
| 详细信息放 `references/`，保持 SKILL.md 精简 | `SKILL.md` §Progressive Disclosure | ✅ |
| 技能存放：用户级 `~/.workbuddy-ai/skills/` 或项目级 `<项目>/.workbuddy-ai/skills/` | 本环境 system prompt + `SKILL.md`（官方文中写作 `~/.codebuddy/skills/`） | ✅ 两者均支持 |

**官方校验脚本实测**：

```
$ python quick_validate.py skill/mc-arena
Skill is valid!
```

> 说明：`skill-creator` 文档中的路径写作 `~/.codebuddy/skills/`，而本 WorkBuddy 环境的技能目录为
> `~/.workbuddy-ai/skills/`（由环境约定给出）。本项目两者都支持：`install.mjs` 默认装到
> `~/.workbuddy-ai/skills/`，并提供 `--project` 装到 `<仓库>/.workbuddy-ai/skills/`。

---

## 二、Skill 目录与元数据

```
skill/mc-arena/
├── SKILL.md                      # 官方 frontmatter + 执行步骤 + 异常处理 + 硬性约束
├── INSTALL.md                    # 安装 / 启用 / 验证 / 故障排查 / 卸载
├── scripts/
│   ├── run-match.mjs             # 主入口：定位仓库 → 调用共享引擎 CLI（零依赖）
│   ├── parse-request.mjs         # 自然语言 → 参数（确定性、可测试）
│   └── install.mjs               # 安装到 skills 目录 + 写 .mcarena-root
└── references/
    ├── challenge-params.md       # 参数总表 + 关键词对照 + 歧义处理
    ├── scoring.md                # 裁判五维与胜负判定（judge-rules/1.1.0）
    ├── mcp-tools.md              # MCP 只读工具清单 + 当前接入状态
    └── examples.md               # 标准示例命令 + 异常提示话术 + 解说模板
```

SKILL.md frontmatter（节选）：

```yaml
name: mc-arena
display_name: 麦门 AI 竞技场
description: 麦门 AI 竞技场（McArena）——发起一场双 Agent 麦当劳点餐决策竞技。该技能应在……
category: life
version: 1.0.0
agent_created: true
disable-model-invocation: false
user-invocable: true
```

---

## 三、与网页共享核心引擎（关键设计）

**问题**：Skill 若自行实现点餐/评分逻辑，就会与网页产生「第二套不一致的业务逻辑」。

**做法**：把用户自定义约束 → 任务卡的构造逻辑**从 API 层下沉到 `@mcarena/arena-core`**，并新增单局运行器，
使 Web API、CLI、Skill 三端调用同一函数。

| 新增/迁移 | 文件 | 说明 |
|---|---|---|
| 迁移 | `packages/arena-core/src/engine/challenge-builder.ts` | `buildCustomChallenge()` 从 `apps/api/src/services/match-service.ts` 下沉；新增 `GOAL_PRESETS`、`buildConstraintsFromParams()`、`buildChallengeFromParams()` |
| 新增 | `packages/arena-core/src/engine/arena-runner.ts` | `runArenaMatch()`：任务卡 → SpeedAgent → OptimizerAgent → RuleBasedJudge，返回结果与事件 |
| 新增 | `packages/arena-core/src/render/match-html.ts` | `renderMatchHtml()`：零依赖自包含 HTML 战报 |
| 新增 | `packages/arena-core/src/cli/challenge.ts` | `challenge` 子命令（Skill 的实际执行体） |
| 改造 | `apps/api/src/services/match-service.ts` | 删除本地实现，改为 `export { buildCustomChallenge }`（从 arena-core 再导出） |

调用链（三端同源）：

```
网页 apps/web  ─┐
REST  apps/api ─┼─→ @mcarena/arena-core
CLI / Skill   ─┘     ├─ buildCustomChallenge()  （任务卡）
                     ├─ runArenaMatch()         （编排）
                     │   ├─ SpeedAgent / OptimizerAgent
                     │   ├─ ReplayPriceOracle
                     │   └─ RuleBasedJudge → verifyAgentProposal()
                     └─ renderMatchHtml()       （产物）
```

`match-service.ts` 现仅保留再导出（无业务逻辑）：

```ts
export { buildCustomChallenge }  // 来自 @mcarena/arena-core，Web·CLI·Skill 共用
```

---

## 四、十项任务完成情况

| # | 任务 | 状态 | 证据 |
|---|---|---|---|
| 1 | 按官方规范创建 Skill 目录、元数据、说明文件 | ✅ | `quick_validate.py` 输出 `Skill is valid!`；`skill-integration.test.ts` 校验 frontmatter 与必需文件 |
| 2 | 将现有 Challenge Engine 接入 Skill | ✅ | `run-match.mjs` → `challenge.ts` → `runArenaMatch()` |
| 3 | 用户可通过自然语言启动挑战 | ✅ | `SKILL.md` 触发条件 + `parse-request.mjs`；实测见证据文件 |
| 4 | 自动解析预算、人数、目标 | ✅ | `parse-request.mjs`：「3个人 预算60 要低卡 外带」→ `--people 3 --budget 60 --scene take-away --goal low-cal` |
| 5 | 调用实际实现的双 Agent 引擎 | ✅ | 输出显示 `speed-greedy@1.0.0` / `optimizer-search@1.0.0`，候选数 1 / 248 |
| 6 | 调用独立裁判系统 | ✅ | 输出含 `rulesVersion`、`experimentId`、`costBasis`、`verification`、`allViolations` |
| 7 | 返回比赛结果与评分解释 | ✅ | 中文战报 + 五维得分 + 判定依据 + 违规记录（`01-run-match-human.txt`） |
| 8 | 输出可打开的竞技场结果或可复现配置 | ✅ | `--html`（自包含 HTML）+ `reproducibleConfig`（可粘贴到网页「挑战设置」） |
| 9 | 提供标准示例命令和异常提示 | ✅ | `references/examples.md`；异常实测见 `04-error-paths.txt` |
| 10 | 真实测试 WorkBuddy 中的运行效果 | ✅（见下节限制） | 11 项子进程集成测试 + 已安装到 `~/.workbuddy-ai/skills/mc-arena` 后从**任意工作目录**实测通过 |

### 必须项核对

| 要求 | 结论 |
|---|---|
| Skill 可以真实调用 | ✅ 已安装到用户级目录，从仓库外 cwd 实测成功（`skill-integration.test.ts` + 手工实测） |
| 不复制另一套不一致的业务逻辑 | ✅ 任务卡构造下沉至 arena-core，API 层删除本地实现 |
| 与网页共享核心引擎 | ✅ 同一 `runArenaMatch()` / `buildCustomChallenge()` / `RuleBasedJudge` |
| 有明确的安装与启用教程 | ✅ `INSTALL.md`（含故障排查表） |
| 不编造官方规范 | ✅ 规范条文全部标注来源文件；未查到的一律不写 |
| 版本限制记录 + 可行替代方案 | ✅ 见「六、实际限制」 |

---

## 五、真实运行记录

### 5.1 安装（用户级）

```
$ node skill/mc-arena/scripts/install.mjs
[install] 源目录：<repo-root>\skill\mc-arena
[install] 目标目录：~\.workbuddy-ai\skills\mc-arena
[install] 仓库根：<repo-root>
[install] 完成 ✅
```

### 5.2 从**无关工作目录**调用已安装 Skill（验证仓库定位）

cwd = `<external-workdir>`（与仓库无关）：

```
$ node ~/.workbuddy-ai/skills/mc-arena/scripts/run-match.mjs \
    --people 3 --budget 60 --goal protein --seed 2026 --json
{ "ok": true, "matchId": "match_mv83bqui_2026", "seed": 2026, "mode": "mock",
  "challenge": { "title": "自定义挑战 · 3 人堂食｜预算 ¥60、人均蛋白 30g", ... },
  "agents": [ { "name": "极速猎手", "engine": "speed-greedy@1.0.0", "candidateCount": 1, ... },
              { "name": "深度优化师", "engine": "optimizer-search@1.0.0", ... } ],
  "judge": { "rulesVersion": "judge-rules/1.1.0", "experimentId": "exp_...", "costBasis": "claimed-unverified", ... },
  "reproducibleConfig": { ... } }
```

### 5.3 中文战报（真实输出节选）

```
──────────────────────────────────────────────────────────────────
麦门 AI 竞技场 · 单局战报（种子 42｜模式 mock）
──────────────────────────────────────────────────────────────────
任务卡：自定义挑战 · 2 人堂食｜预算 ¥60、人均 500 kcal、人均蛋白 20g、必含标签 burger/side/drink
数据来源：mock（scenario://stage03-fixtures）｜比赛 ID match_...
⚠ 阶段03 场景测试数据集（模拟数据，非麦当劳官方数据）

【α 极速猎手】speed-greedy@1.0.0｜总分 78.5/100
    自述应付 ¥22.00｜裁决成本 ¥22.00｜核价 not-verified｜资格 通过
    实测 18ms｜候选 1｜工具调用 1
      · 经典牛肉堡 ×1 = ¥15.00
      · 可乐（中） ×1 = ¥7.00
      · 薯条（中） ×1 = ¥8.00
【β 深度优化师】optimizer-search@1.0.0｜总分 79.6/100
    自述应付 ¥25.00｜裁决成本 ¥25.00｜核价 not-verified｜资格 通过
    实测 7ms｜候选 248｜工具调用 6
      · 经典牛肉堡 ×1 = ¥15.00
      · 拿铁咖啡 ×1 = ¥10.00
      · 薯条（中） ×1 = ¥8.00

裁判结论：极速猎手胜出（五维总分 78.5 : 79.6 / 100）——双方均无官方核价记录（NOT_VERIFIED），
按裁判重算成本比较，α更低（¥22.00 : ¥25.00）
规则 judge-rules/1.1.0｜实验 exp_bcc724febf31e0b8｜成本依据 claimed-unverified
```

> 本局是「五维总分较低但按字典序获胜」的真实案例：α 总分 78.5 < β 79.6，但 α 的**裁决成本更低**，
> 判定在第 2 步（已验证成本）分出胜负。阶段06 修正了此前的歧义文案（原为「以 78.5 : 79.6 胜出」，
> 易误读为「总分更低者获胜」），现明确标注「五维总分」。

### 5.4 自然语言解析（真实输出）

```
$ node .../parse-request.mjs "3个人 预算60 要低卡 外带"
输入：3个人 预算60 要低卡 外带
解析结果：--people 3 --budget 60 --scene take-away --goal low-cal
  · 人数：3（来自「3个人」）
  · 预算：¥60（来自「预算60」）
  · 目标：低热量（来自「低卡」）
  · 场景：外带（来自「外带」）

$ node .../parse-request.mjs "双人堂食 50元以内 高蛋白 用券" --print-args
--people 2 --budget 50 --scene dine-in --goal protein --coupons
```

### 5.5 异常路径（真实输出，含退出码）

```
## 1) --mode replay（无快照）
数据源不可用：replay 模式需要仓内官方快照，但 snapshots/ 目录暂无快照文件。请放入快照，或改用 --mode mock。
exit=3

## 2) --people 99（非法参数）
参数错误：--people 必须是 1–12 之间的整数（收到 99）
exit=2

## 3) --mode live（无 Token）
数据源不可用：live 模式需要环境变量 MCD_MCP_TOKEN（在 https://open.mcd.cn/mcp 申请）。当前未配置，请改用 --mode auto / --mode mock，或先申请 Token。
exit=3

## 4) 正常路径（默认产物）
已生成可打开的竞技场结果：<repo-root>\artifacts\mc-arena-<时间戳>.html
已生成 JSON 结果：<repo-root>\artifacts\mc-arena-<时间戳>.json
```

### 5.6 产物

| 文件 | 说明 |
|---|---|
| `docs/evidence/stage06/sample-match-report.html` | 自包含 HTML 战报，可直接用浏览器打开（12.1 KB） |
| `docs/evidence/stage06/sample-match-result.json` | 完整比赛记录（40.7 KB，含全部证据与验证明细） |
| `docs/evidence/stage06/01~04-*.txt/json` | 上述真实输出存档 |

### 5.7 最终复核（10/14 20:59，提交 `7ce9235` 之后）

在阶段05 浏览器实测完成后对阶段06 做了完整复核：

| 复核项 | 命令 | 结果 |
|---|---|---|
| 官方规范校验 | `python quick_validate.py skill/mc-arena` | `Skill is valid!` |
| 重新安装到用户级 | `node skill/mc-arena/scripts/install.mjs` | 完成，写入 `.mcarena-root` |
| 已安装文件完整性 | `find ~/.workbuddy-ai/skills/mc-arena -type f` | 10 个文件（SKILL.md / INSTALL.md / scripts×3 / references×4 / .mcarena-root） |
| 自然语言解析（**仓库外 cwd**） | `node <已安装>/scripts/parse-request.mjs "3个人 预算60 要低卡 外带"` | `--people 3 --budget 60 --scene take-away --goal low-cal` |
| 真实跑局（**仓库外 cwd**） | 上一步参数 → `run-match.mjs ... --seed 2026 --json` | `ok:true`；任务卡「自定义挑战 · 3 人外带｜预算 ¥60、人均 450 kcal」；α `speed-greedy@1.0.0` 候选 1 / β `optimizer-search@1.0.0` 候选 274；`experimentId exp_ba4c0b472cb24851` |
| 全量门禁 | `npm run verify` | exit 0；测试 **189/189**；typecheck 0 错；lint 0 error；build 成功 |

复核中发现并修复的展示缺陷（属阶段05 范围，已记入 `STAGE_05_REPORT.md` 与 `workbuddy.md`）：

> 结果页「🏆 胜出」旁徽章用 `judge.totalScore = max(α, β)` 显示「比分」，**可能显示败方分数**
> （实测中 α 以五维 62.8 胜出时，徽章会显示 β 的 79.9）。已在四处改为并列展示 α : β
> （结果页徽章 / `JudgePanel` 记分表新增两列 / 分享卡 / 分享文案），并注明「胜负由字典序判定，与五维总分不必然同向」。

---

## 六、实际限制与替代方案（如实记录）

| 限制 | 实际情况 | 替代方案（已实现） |
|---|---|---|
| **麦当劳 MCP Token 未申请** | 申请需手机号验证登录 + 人机验证，AI 无法代办（阻塞项 B1） | `--mode auto`：有官方快照则优先使用；`live` 模式给出明确错误码与申请路径，不伪造 |
| **官方数据快照缺失** | `snapshots/` 目录仅有 `README.md`，无快照文件 | 回退 `buildScenarioDataset()`（**明确标注「模拟数据，非麦当劳官方数据」**），并在 `warnings` 与 HTML 中显著提示 |
| **技能列表无法由脚本触发刷新** | Skill 的启用/信任需用户在 WorkBuddy 界面操作 | 提供 `INSTALL.md` 步骤；脚本侧已通过「从任意 cwd 真实调用」证明可执行性 |
| **无法自动读取完整历史对话** | 本环境无法访问逐条原始对话 | `workbuddy.md` 基于阶段记录与仓库真实产物整理，并在文末「缺失与待补」明确列出未获取部分 |
| **`live` 实时采集未开放** | `LiveDataSource` 当前返回 `NotImplementedError` | CLI 捕获后输出可读中文提示（退出码 3），引导用户使用 `auto`/`mock` |

---

## 七、测试与质量门禁（真实执行结果）

| 项目 | 结果 |
|---|---|
| 全量测试 | **189 / 189 通过**（连续 2 次运行均通过） |
| 阶段06 新增测试 | **55 项** |
| `npm run typecheck` | 0 错误 |
| `npx eslint .` | **0 error**（30 warning，均为既有 `no-console` / `no-unsafe-*` 提示） |
| `npm run build` | 成功（API `dist/server.js` 13.38 KB；Web 80 modules，`index.js` 285.79 KB / gzip 85.17 KB） |

### 各测试文件用例数

| 用例数 | 文件 | 阶段 |
|---|---|---|
| 35 | `verifier.test.ts` | 04 |
| 31 | `judge.test.ts` | 04 |
| **18** | `challenge-builder.test.ts` | **06 新增** |
| **18** | `cli-challenge.test.ts` | **06 新增** |
| 14 | `agents.test.ts` | 03 |
| 13 | `contract.test.ts` | 02 |
| 12 | `api.test.ts` | 01/05 |
| **11** | `skill-integration.test.ts` | **06 新增** |
| 9 | `agent-runner.test.ts` | 03 |
| **8** | `arena-runner.test.ts` | **06 新增** |
| 8 | `contracts.test.ts` | 01 |
| 4 | `benchmark.test.ts` | 03 |
| 4 | `client.test.ts` | 01 |
| 4 | `orchestrator.test.ts` | 01 |
| **189** | **合计** | |

### 阶段06 新增测试覆盖点

- **`challenge-builder.test.ts`（18）**：任务卡标题/简述派生、确定性、目标预设展开（5 种）、显式参数覆盖预设、标签合并去重、预算单位透传、非法约束拒绝。
- **`arena-runner.test.ts`（8）**：完整 MatchResult 产出、同种子指纹一致（`canonicalizeMatch`）、自定义约束生效、无解场景判平局、事件序列完整、HTML 渲染关键信息、HTML 注入转义、自包含（无外链）。
- **`cli-challenge.test.ts`（18）**：参数解析（预算换算/列表分隔/开关/非法值/缺值）、`--help`、非法参数退出码 2、JSON 输出结构、中文战报、`--out`/`--html` 落盘、replay 缺快照退出码 3、live 缺 Token 退出码 3、结构化错误体、`--quiet`。
- **`skill-integration.test.ts`（11）**：**真实子进程**调用 `parse-request.mjs`（4）、`run-match.mjs`（4，含从仓库外 cwd 调用）、`install.mjs --dry-run`（1）、SKILL.md 元数据合规（2）。

---

## 八、本次修复的真实缺陷

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 战报「以 78.5 : 79.6 胜出」易误读 | 胜负由字典序决定，与五维总分不必然同向，文案未标注 | `judge.ts` `headlineOf` 改为「五维总分 X : Y / 100」并附判定依据 |
| 2 | 解析器不识别「双人」 | 中文数字表缺 `双` | `CN_DIGITS` 补 `双: 2` |
| 3 | ESLint `no-base-to-string` | `esc()` 对对象直接 `String()` | 显式分支：对象走 `JSON.stringify` |
| 4 | Windows Git Bash 下 `Cannot find module 'C:\c\Users\...'` | Node（Windows 二进制）不识别 MSYS `/c/...` 路径 | 统一使用 `C:/...` 形式调用 |
| 5 | 失败时仍打印「已启用默认产物输出」 | 提示在 spawn 前输出 | 改为仅在子进程退出码为 0 时输出 |
| 6 | 子进程测试偶发 5s 超时 | 默认 `testTimeout` 过短 | `describe(..., { timeout })` 显式放宽 |
| 7 | 批量编辑部分未落盘 | 编辑工具批量替换部分失效 | 改为逐条编辑 + `grep` 复核 |
| 8 | 结果页「🏆 胜出」旁徽章显示 `比分 69.3 / 100`，可能**显示败方分数** | `judge.totalScore = max(α, β)` 被当作「本局比分」，而胜负由字典序决定、与五维总分不必然同向 | 四处改为并列展示 α : β（结果页徽章 / `JudgePanel` 记分表新增两列 / 分享卡 / 分享文案） |

---

## 九、交付物清单

**新增**
- `packages/arena-core/src/engine/challenge-builder.ts`
- `packages/arena-core/src/engine/arena-runner.ts`
- `packages/arena-core/src/render/match-html.ts`
- `packages/arena-core/src/cli/challenge.ts`
- `packages/arena-core/test/challenge-builder.test.ts`、`arena-runner.test.ts`、`cli-challenge.test.ts`、`skill-integration.test.ts`
- `skill/mc-arena/SKILL.md`（重写）、`INSTALL.md`、`scripts/run-match.mjs`、`scripts/parse-request.mjs`、`scripts/install.mjs`、`references/challenge-params.md`、`references/examples.md`
- `docs/evidence/stage06/*`
- `workbuddy.md`（重写）、`STAGE_06_REPORT.md`

**修改**
- `apps/api/src/services/match-service.ts`（下沉 `buildCustomChallenge`，改为再导出）
- `packages/arena-core/src/index.ts`（导出新模块）、`package.json`（新增 `challenge` 脚本）
- `packages/arena-core/src/engine/judge.ts`（headline 文案）
- `skill/mc-arena/references/scoring.md`、`references/mcp-tools.md`（同步真实规则与接入状态）
- `.gitignore`（忽略 `artifacts/`）

---

## 十、结论与后续

阶段06 目标全部达成：Skill 已按官方规范创建、可真实调用、与网页共享同一套核心引擎、
具备完整的安装启用教程与异常提示，并在**真实子进程**与**已安装环境**下通过验证。

**未完成 / 阻塞（如实记录）**：
1. **B1** 麦当劳 MCP Token 未申请 → `live` 模式不可用；Skill 当前运行于 mock 场景数据集（已显著标注）。
2. **B2** GitHub 公开仓库未创建 → 按要求**未执行任何 push**，仅本地提交。
3. 阶段05 的浏览器实测与 `STAGE_05_REPORT.md` **已于 10/14 补做完成**（控制台 0 错误、9 张真实截图）；
   仍缺演示 GIF、跨浏览器与真机移动端实测。
4. `workbuddy.md` 的**完整原始对话导出**需用户在 WorkBuddy 中手动导出后追加。
