# 标准示例命令与异常提示（Skill 参考）

## 一、标准示例命令

### 1. 最简：默认 2 人堂食，随机可复现任务卡

```bash
node skill/mc-arena/scripts/run-match.mjs --seed 42
```

### 2. 自然语言入口（推荐先用解析器核对参数）

```bash
node skill/mc-arena/scripts/parse-request.mjs "3个人 预算60 要低卡 外带"
# → --people 3 --budget 60 --scene take-away --goal low-cal
```

### 3. 完整约束 + 产物落盘（JSON + 可打开的 HTML）

```bash
node skill/mc-arena/scripts/run-match.mjs \
  --people 2 --budget 60 --goal balanced --seed 42 \
  --json --out ./artifacts/match.json --html ./artifacts/match.html
```

### 4. 营养目标 + 必含类别

```bash
node skill/mc-arena/scripts/run-match.mjs --people 4 --budget 80 --protein 25 --categories 汉堡,饮品 --seed 7
```

### 5. 复现上一局（同种子 + 同约束）

```bash
node skill/mc-arena/scripts/run-match.mjs --people 2 --budget 60 --goal balanced --seed 42
```

### 6. 官方快照优先 / 强制模拟数据

```bash
node skill/mc-arena/scripts/run-match.mjs --mode auto   # 有官方快照则用快照，否则回退 mock
node skill/mc-arena/scripts/run-match.mjs --mode mock   # 强制场景数据集（明确标注非官方数据）
```

### 7. 基准对比（8 个官方测试场景）

```bash
npm run bench    # 仓库根执行
```

## 二、异常提示话术

### 1. 参数非法（退出码 2）

```
参数错误：--people 必须是 1–12 之间的整数（收到 99）
```
→ 向用户说明合法范围，并给出修正后的命令。

### 2. 快照缺失 / 数据源不可用（退出码 3）

```
数据源不可用：replay 模式需要仓内官方快照，但 snapshots/ 目录暂无快照文件。请放入快照，或改用 --mode mock。
```
→ 说明：仓库当前**没有**官方 MCP 快照（申请 MCP Token 需要手机号验证，AI 无法代办），
因此默认 `--mode auto` 会回退到场景数据集。**必须在解说中标注「模拟数据，非麦当劳官方数据」。**

### 3. live 模式缺 Token（退出码 3）

```
数据源不可用：live 模式需要环境变量 MCD_MCP_TOKEN（在 https://open.mcd.cn/mcp 申请）。
```
→ 说明申请路径，并建议先用 `auto` / `mock` 体验。

### 4. 比赛未完成（退出码 4）

```
比赛未完成：比赛未产生结果：<原因>
```
→ 原样转述错误码与原因，**不要编造结果**。

### 5. 找不到仓库（退出码 3）

```
未找到 McArena 仓库根目录。请设置环境变量 MCARENA_ROOT 指向仓库，或使用 --repo <path> 指定。
```
→ 让用户执行 `node skill/mc-arena/scripts/install.mjs`（会写入仓库定位标记），或设置 `MCARENA_ROOT`。

### 6. 依赖未安装

```
未找到 tsx（<repo>/node_modules/tsx/dist/cli.mjs）。请先在仓库根目录执行 npm install。
```

## 三、解说模板（可直接套用）

```
【本局任务卡】2 人堂食 · 预算 ¥60 · 均衡搭配（人均 500kcal / 20g 蛋白）
【数据来源】模拟数据（非麦当劳官方数据），来源 scenario://stage03-fixtures

α 极速猎手（speed-greedy@1.0.0）：经典牛肉堡×1 + 薯条×1 + 可乐×1，裁决成本 ¥22.00，五维 78.5/100
β 深度优化师（optimizer-search@1.0.0）：经典牛肉堡×1 + 薯条×1 + 拿铁×1，裁决成本 ¥25.00，五维 79.6/100

【裁判结论】极速猎手胜出（五维总分 78.5 : 79.6 / 100）——双方均无官方核价记录（NOT_VERIFIED），
按裁判重算成本比较，α 更低（¥22.00 : ¥25.00）。

【判定依据】资格 → 已验证成本 → 目标达成率 → 响应时间；本局在第 2 步由成本分出胜负。
【可复现】seed=42；实验 ID exp_xxxxxxxxxxxxxxxx；相同配置重跑结果一致（实测耗时除外）。
【产物】已生成可打开的 HTML 战报：<绝对路径>
```
