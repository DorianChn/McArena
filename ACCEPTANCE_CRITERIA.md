# McArena 验收标准（ACCEPTANCE_CRITERIA）

> 版本 v1.0 ｜ 2026-10-14 ｜ 每条标准均为可执行、可验证的通过/失败判定。

## A. 官方参赛合规（一票否决项）

| # | 标准 | 验证方法 |
|---|---|---|
| A1 | 仓库包含 `README.md`，含项目介绍、安装方法、使用示例、目标用户 | 文件存在且四项齐备 |
| A2 | 仓库包含 `CONTEST_DECLARATION.md`，且与官方仓库内容**逐字节一致** | `diff` / sha256 比对 |
| A3 | 仓库包含 `MCP_INTEGRATION.md`，说明实际使用的 MCP Server、Tool、调用流程和业务价值 | 四要素齐备 |
| A4 | 仓库包含 `mcp-config.example.json`，只允许环境变量占位符（如 `${MCD_MCP_TOKEN}`） | 全文无任何真实凭据；grep 常见 token 模式为空 |
| A5 | 代码与配置中不出现任何真实 Token/密钥/密码；不包含他人个人信息 | secret 扫描通过 |
| A6 | GitHub 仓库为 Public，创建时间在 2025-12-25 00:00 ～ 2026-10-25 23:59（北京时间） | 用户确认仓库状态 |
| A7 | 报名 Issue 按官方格式提交（【参赛申请】+ 项目名称/地址/简介，无多余换行，无 Markdown 链接） | Issue 收到系统成功回复 |
| A8 | 项目内容合规：无敏感内容、无贬低麦当劳品牌表述、无与其他品牌对比、无违规外链、无恶意代码 | 人工走查清单 |
| A9 | 项目真实使用麦当劳 MCP 能力（有真实 tools/list、tools/call 记录或录制的真实数据快照） | 快照 manifest + 工具调用日志 |
| A10 | 不调用 `create-order` 等写操作产生真实订单（MVP 全程禁下单） | 代码走查 + 黑名单单测 |

## B. 功能验收

| # | 标准 | 验证方法 |
|---|---|---|
| B1 | 双 Agent 可从同一官方数据快照各自产出完整购物车决策 | 单元测试 + demo 输出 |
| B2 | 每名 Agent 输出 DecisionTrace：候选筛选过程、逐项决策理由、最终购物车 | 结构校验（zod） |
| B3 | 裁判输出五维得分（需求满足/预算/营养/优惠/可解释性），每项含 score、max、formula、evidence | Verdict schema 校验 |
| B4 | 加权总分与胜者判定正确；并列时按既定破平规则处理 | 单测覆盖并列/极致边界 |
| B5 | 比分与解释为中文，公式与证据可直接在界面查看 | 界面走查 |
| B6 | 前端可完整展示一局比赛：任务卡、双 Agent 决策流、雷达图、逐项解释、复现入口 | 录屏/GIF |
| B7 | API 冒烟：`POST /api/match`、`GET /api/match/:id/stream`、`GET /api/snapshot`、`GET /api/healthz` 均返回 200 且 DTO 合规 | curl/契约测试 |

## C. 可复现性验收（核心卖点）

| # | 标准 | 验证方法 |
|---|---|---|
| C1 | 完全无 MCP Token 的环境：克隆仓库 → `npm ci` → `npm run demo` → 完整跑出一局比赛 | 干净环境实测 |
| C2 | 相同 `(seed, snapshotId)` 两次运行，MatchRecord 除记录 ID/时间戳外**字节级一致** | 复现测试（sha256 比对） |
| C3 | 每份快照含 manifest：snapshotId、采集时间、MCP Server 版本/URL、工具清单、逐文件 sha256 | manifest 校验 |
| C4 | 快照数据来源于官方 MCP 真实响应，非手写伪造（录制造型允许裁剪但不改值） | 采集脚本审计 + 原始响应留档 |

## D. 工程质量

| # | 标准 | 验证方法 |
|---|---|---|
| D1 | `npm run build` 零错误零警告（TS strict） | CI 日志 |
| D2 | `npm test` 通过率 100%；arena-core 行覆盖率 ≥ 80% | Vitest 报告 |
| D3 | TypeScript strict 模式；无 `any` 逃逸（eslint 规则） | lint 通过 |
| D4 | MCP 客户端：401→明确错误提示；429→指数退避且请求速率 < 600/min | 单测 + 压测计数 |
| D5 | SSRF/注入：所有外部 URL 仅 `https://mcp.mcd.cn`；用户输入仅作为工具参数透传 | 代码走查 |

## E. WorkBuddy Skill 验收

| # | 标准 | 验证方法 |
|---|---|---|
| E1 | `skill/mc-arena/SKILL.md` frontmatter 字段符合官方规范（name/description/description_zh/version/author 等） | 对照官方 skill 文档 |
| E2 | 在 WorkBuddy 对话中说「来一场麦门竞技」可触发 Skill 并返回中文比赛解说 | 实测对话 |
| E3 | Skill 脚本在无 Token 环境基于仓内快照可用 | 本地执行 |
| E4 | `workbuddy.md` 已导出（参加 WorkBuddy 专项奖励的必要材料） | 文件存在 |

## F. 传播性（排名 = Star 数的软性验收）

| # | 标准 | 验证方法 |
|---|---|---|
| F1 | README 含演示 GIF/视频、架构图、5 分钟快速开始 | 走查 |
| F2 | 一句话价值主张清晰（见 README 首屏） | 走查 |
| F3 | 提供「在线演示」或一键本地演示路径 | 走查 |
| F4 | MIT LICENSE、贡献指南、Issue 模板齐备 | 文件存在 |

## G. 发布验收（Gate G5）

| # | 标准 | 验证方法 |
|---|---|---|
| G5-1 | 10/24 前完成公开 push + Release v1.0.0 | GitHub 页面 |
| G5-2 | 10/25 23:59 前报名 Issue 提交并获成功通知 | Issue 回复 |
| G5-3 | 10/26 00:00 快照时仓库保持 Public、CI 绿、无 hotfix 中断 | 定时检查 |
