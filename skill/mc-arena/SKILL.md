---
name: mc-arena
display_name: 麦门 AI 竞技场
description: 麦门 AI 竞技场（McArena）——发起一场双 Agent 麦当劳点餐决策竞技。该技能应在本用户要求「来一场麦门竞技」「麦门竞技场」「麦当劳点餐比赛」「双 Agent 点餐对决」「让两个 AI 比谁点得更好」时使用；也可在用户给出预算、人数、营养或口味目标（如「3 个人 60 元要低卡」）并要求比较两套点餐方案时使用。技能会调用真实的双 Agent 引擎（极速猎手 / 深度优化师）与独立裁判，返回中文战报、五维评分解释、可复现配置与可打开的 HTML 结果页。
description_zh: 双 Agent 点餐决策竞技：真实双 Agent 引擎 + 独立裁判 + 可复现对战
description_en: Dual-agent ordering decision arena with an independent judge and reproducible matches.
category: life
version: 1.0.0
author: McArena contributors
agent_created: true
disable-model-invocation: false
user-invocable: true
---

# 麦门 AI 竞技场 · 双 Agent 点餐决策比赛

## 用途

让两名算法风格不同的 Agent 在**同一份菜单数据**上完成同一次点餐任务，再由**独立裁判**
（不采信 Agent 自述成绩）重新验证、评分并宣判胜者，最后用中文向用户解说。

本技能只做编排与解说：全部业务逻辑来自仓库内的共享引擎 `@mcarena/arena-core`，
与网页端、REST API 完全同源（同一 `runArenaMatch()`），**不得在本技能中另行实现第二套点餐/评分逻辑**。

## 何时使用

- 用户要求「来一场麦门竞技 / 开一局 McArena / 麦当劳点餐比赛 / 双 Agent 点餐对决」；
- 用户给出点餐约束并想比较方案，例如「3 个人 60 元，要低卡」「2 人堂食预算 40 要够蛋白」；
- 用户要求复现上一局（给出 seed 或可复现配置）。

## 执行步骤

### 第 1 步：把自然语言解析为结构化参数

从用户输入中提取（缺省值见括号）：

| 参数 | 含义 | 缺省 |
|---|---|---|
| `--people` | 人数（1–12） | 2 |
| `--budget` | 预算，单位「元」 | 不限 |
| `--scene` | `dine-in` / `take-away` / `delivery` | dine-in |
| `--goal` | `balanced` / `protein` / `low-sodium` / `low-cal` / `budget` | 无 |
| `--tags` / `--categories` / `--must` / `--exclude` | 必含标签 / 类别 / 餐品编码、排除编码 | 空 |
| `--max-items` | 最多餐品种类数 | 不限 |
| `--kcal` / `--protein` / `--sodium-max` | 人均热量上限 / 蛋白质下限 / 钠上限 | 无 |
| `--coupons` / `--no-coupons` | 是否优先用券 | 是 |
| `--seed` | 随机种子（便于复现） | 随机生成并告知用户 |
| `--mode` | `auto` / `mock` / `replay` / `live` | auto |

解析规则、中文关键词对照与歧义处理见 `references/challenge-params.md`。
若用户输入含明显歧义（如「便宜点」但未给预算），按缺省执行并在回复中说明所用假设，
不要反复追问；仅在人数或预算互相矛盾时才请求澄清。

### 第 2 步：调用共享引擎脚本

在**仓库根目录**执行（脚本会自动定位仓库，也可用环境变量 `MCARENA_ROOT` 指定）：

```bash
node skill/mc-arena/scripts/run-match.mjs \
  --people 2 --budget 60 --goal balanced --seed 42 \
  --json --out ./artifacts/match.json --html ./artifacts/match.html
```

脚本输出一段 JSON（`--json`）或中文战报（默认）。JSON 顶层字段：

- `ok`：是否成功；
- `seed` / `matchId` / `mode` / `dataOrigin` / `dataset`：比赛标识与数据来源；
- `challenge`：任务卡（标题、简述、结构化约束）；
- `agents[]`：双方引擎、状态、自述应付、裁决成本、价格核验状态、耗时、候选数、工具调用、购物车明细、五维总分；
- `judge`：规则版本、可复现实验 ID、成本依据、胜者、结论、五维得分、说明、全部违规；
- `reproducibleConfig`：可复现配置（可粘贴到网页「挑战设置」）；
- `artifacts`：生成的 JSON / HTML 文件绝对路径。

### 第 3 步：用中文解说

必须包含：

1. 任务卡（人数、场景、预算、目标）；
2. 双方购物车与**裁决成本**（注明「官方核价」或「NOT_VERIFIED 裁判重算」）；
3. 裁判结论与五维得分对比（α / β 逐维）；
4. 判定依据（资格 → 已验证成本 → 目标达成 → 响应时间）；
5. 违规记录（若有）与数据来源警示（mock 数据必须明确标注「非麦当劳官方数据」）；
6. 复现方式：给出 `seed`，或把 `reproducibleConfig` 原样贴给用户。

若生成了 HTML，把文件路径告诉用户，说明可直接用浏览器打开。

### 第 4 步：交付

- `--out` 生成的 JSON：完整比赛记录，可复现；
- `--html` 生成的页面：自包含、可直接打开；
- 复制给用户的 `reproducibleConfig`：粘贴到网页「挑战设置」即可复现同一局。

## 异常处理

| 情况 | 脚本行为 | 应向用户说明 |
|---|---|---|
| `CLI_USAGE_ERROR` | 退出码 2，输出参数错误 | 指出哪个参数非法并给出合法取值 |
| `DATA_SOURCE_ERROR` / 快照缺失 | 退出码 3 | 说明仓库暂无官方快照，已回退场景数据集（mock，非官方数据） |
| `MCP_TOKEN_MISSING`（`--mode live`） | 退出码 3 | 说明需在 open.mcd.cn 申请 Token；建议先用 auto/mock |
| `MATCH_FAILED` | 退出码 4 | 原样转述 `error.code` 与 `message`，不要编造结果 |

完整示例命令与异常提示话术见 `references/examples.md`。

## 硬性约束（必须遵守）

- 只运行本技能 `scripts/` 下的脚本；**不得**调用任何 MCP 写操作（下单、支付、修改账户等），本技能全程只读。
- 不得在回复中展示、记录或推断任何 Token、Cookie、账号或环境变量内容。
- 数据与结论必须来自脚本返回值，**不得**自行编造餐品、价格、得分或历史战绩。
- 当 `dataOrigin` 为 `mock` 时，必须在解说中显著标注「模拟数据，非麦当劳官方数据」。
- 不得修改仓库源码或共享引擎；如需变更逻辑，应改 `@mcarena/arena-core` 并同步测试，而非在本技能内打补丁。

## 参考资料

- `references/challenge-params.md` —— 自然语言 → 参数的解析规则与关键词表
- `references/scoring.md` —— 裁判五维评分与胜负判定规则（与代码同版本）
- `references/mcp-tools.md` —— 共享引擎实际使用的麦当劳 MCP 只读工具清单
- `references/examples.md` —— 标准示例命令与异常提示话术
- `INSTALL.md` —— 安装、启用与故障排查
