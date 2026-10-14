# 麦门 AI 竞技场 Skill · 安装与启用

本技能把 McArena 的双 Agent 竞技引擎接入 WorkBuddy，让用户可以用自然语言发起一场点餐竞技。
技能本身**不含业务逻辑**，它调用仓库内的共享引擎（`@mcarena/arena-core`），与网页端同源。

---

## 一、前置条件

| 条件 | 要求 | 检查方式 |
|---|---|---|
| Node.js | ≥ 20（建议 22） | `node -v` |
| McArena 仓库 | 已克隆到本地 | 仓库根存在 `package.json` 且 `name` 为 `mcarena` |
| 依赖 | 已安装 | 在仓库根执行 `npm install`（需要 `node_modules/tsx`） |
| WorkBuddy | 支持 Skill 的版本 | 技能列表可见「麦门 AI 竞技场」 |

> 不需要麦当劳账号、不需要 MCP Token、不需要任何密钥即可运行（默认使用仓内场景数据集，
> 并会在结果中明确标注「模拟数据，非麦当劳官方数据」）。

---

## 二、安装

### 方式 A：一键脚本（推荐）

```bash
# 在仓库根目录执行
node skill/mc-arena/scripts/install.mjs
```

脚本会：
1. 复制 `skill/mc-arena` → `~/.workbuddy-ai/skills/mc-arena`（用户级，所有项目可用）；
2. 写入 `.mcarena-root` 标记文件，记录仓库绝对路径，使脚本在任意工作目录都能定位仓库。

安装到**当前项目**（团队共享，需自行提交）：

```bash
node skill/mc-arena/scripts/install.mjs --project
# → <仓库>/.workbuddy-ai/skills/mc-arena
```

只看将执行的动作，不做改动：

```bash
node skill/mc-arena/scripts/install.mjs --dry-run
```

### 方式 B：手动复制

```bash
# macOS / Linux
mkdir -p ~/.workbuddy-ai/skills
cp -r skill/mc-arena ~/.workbuddy-ai/skills/

# Windows PowerShell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.workbuddy-ai\skills" | Out-Null
Copy-Item -Recurse -Force "skill\mc-arena" "$env:USERPROFILE\.workbuddy-ai\skills\"
```

手动复制后，请把仓库路径写入标记文件（否则脚本需依赖 `MCARENA_ROOT` 环境变量）：

```bash
echo "<仓库绝对路径>" > ~/.workbuddy-ai/skills/mc-arena/.mcarena-root
```

---

## 三、启用

1. 打开 WorkBuddy → 技能列表 → 找到「麦门 AI 竞技场」；
2. 点击**启用 / 信任**（新安装的技能默认不会自动生效）；
3. 若列表未刷新，重启 WorkBuddy。

---

## 四、验证安装

```bash
# 1) 解析器自检
node ~/.workbuddy-ai/skills/mc-arena/scripts/parse-request.mjs "3个人 预算60 要低卡"

# 2) 跑一局（默认会生成 artifacts/ 下的 JSON + HTML）
node ~/.workbuddy-ai/skills/mc-arena/scripts/run-match.mjs --people 2 --budget 60 --goal balanced --seed 42
```

预期：输出中文战报，并提示已生成 `artifacts/mc-arena-<时间戳>.html`（可直接用浏览器打开）。

在 WorkBuddy 对话中说「来一场麦门竞技，2 个人 60 块，要均衡搭配」即可触发本技能。

---

## 五、故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `未找到 McArena 仓库根目录` | 未写 `.mcarena-root` 且未设 `MCARENA_ROOT` | 重新运行 `install.mjs`，或 `export MCARENA_ROOT=<仓库>` |
| `未找到 tsx` | 依赖未安装 | 在仓库根执行 `npm install` |
| `数据源不可用：…暂无快照文件` | 仓库没有官方快照 | 用 `--mode auto`（默认）或 `--mode mock` |
| 技能未出现在列表 | 未启用或未重启 | 技能列表启用后重启 WorkBuddy |
| 中文乱码 | 终端编码非 UTF-8 | Windows 下执行 `chcp 65001` |
| 输出 `dataOrigin: mock` | 正常（当前无官方快照） | 解说中如实标注「模拟数据，非官方数据」 |

---

## 六、卸载

```bash
# macOS / Linux
rm -rf ~/.workbuddy-ai/skills/mc-arena

# Windows PowerShell
Remove-Item -Recurse -Force "$env:USERPROFILE\.workbuddy-ai\skills\mc-arena"
```
