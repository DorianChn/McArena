---
name: mc-arena
display_name: 麦门 AI 竞技场
description: 发起一场麦当劳双 Agent 点餐决策竞技：基于官方 MCP 真实数据快照，两名 AI 选手同台点餐，独立裁判五维打分并给出中文解说。当用户说「来一场麦门竞技」「麦门竞技场」「麦当劳点餐比赛」「开一局 McArena」「双 Agent 点餐对决」时使用。
description_zh: 双 Agent 点餐决策竞技，真实 MCP 数据 + 可解释裁判 + 可复现对战
description_en: Dual-agent McDonald's ordering decision arena powered by official MCP data with an explainable judge.
category: life
version: 1.0.0
author: McArena contributors
disable-model-invocation: false
user-invocable: true
---

# 麦门 AI 竞技场 · 双 Agent 点餐决策比赛

## 执行步骤

当用户要求「来一场麦门竞技」或指定参数时，按以下步骤执行：

1. 解析用户意图中的可选参数：
   - `--seed <数字>`：随机种子，缺省随机生成一个整数并告知用户（便于复现）；
   - `--mode <replay|live>`：数据模式，缺省 `replay`（无需 Token，使用仓库内置官方数据快照）；`live` 需要环境变量 `MCD_MCP_TOKEN`，缺失时向用户说明并回退 replay。
2. 在仓库根目录执行：

   ```bash
   node packages/arena-core/src/cli/demo.mjs --seed <seed> --mode <mode>
   ```

3. 脚本输出 JSON 格式的 MatchRecord（比赛全过程）。解析后用**中文**向用户解说，必须包含：
   - 任务卡（预算、人数、场景、约束）；
   - 双方最终购物车与应付总价（来自官方 calculate-price）；
   - 裁判五维得分与总分、胜者；
   - 每个得分项的公式与证据；
   - 复现方式：相同 `seed` 与快照 ID 可得到完全一致的结果。
4. 若脚本报错 `MCP_TOKEN_MISSING`：提示用户按 README 指引申请 Token，或先用 replay 模式体验。
5. 若用户要求「再来一局」，更换 seed 重新执行。

## 约束（必须遵守）

- 只调用上面列定的脚本；不得调用任何 MCP 下单类工具（create-order 等），本技能全程只读。
- 不得在回复中展示任何 Token 或环境变量内容。
- 数据必须来自脚本返回的比赛结果，不得自行编造餐品、价格或得分类信息。

## 参考资料

- @references/mcp-tools.md —— 实际使用的麦当劳 MCP 工具清单
- @references/scoring.md —— 裁判五维打分规则
