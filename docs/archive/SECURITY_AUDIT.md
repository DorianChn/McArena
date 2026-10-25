# SECURITY_AUDIT · 阶段07 安全审计报告

> 项目：McArena（麦门 AI 竞技场）｜审计时间：2026-10-15｜审计方式：全仓静态扫描 + 依赖审计 + Git 历史检索 + 真实运行验证
> 结论：**未发现可利用的安全漏洞**；存在 2 项已评估并记录的残余风险（均为公开演示场景下的有意取舍）。依赖漏洞 **4 → 0**。

---

## 一、审计项与结果总览

| # | 审计项 | 方法 | 结果 |
|---|---|---|---|
| 1 | 硬编码密钥 | 全仓（含根目录/yml/env）+ **Git 全历史** `git grep`，模式：`Bearer <20+>`、`sk-`、`ghp_`、`AKIA`、`AIza`、PEM 私钥头 | ✅ 未发现真实密钥；`.env.example` 均为占位符 |
| 2 | 日志敏感数据泄露 | 代码走查 + 单测 | ✅ logger 对 `token/authorization/password` 等键名输出 `[REDACTED]`，有单测锁定（`api.test.ts`） |
| 3 | 依赖漏洞 | `npm audit`（全量 + `--omit=dev`） | ✅ **0 vulnerabilities**（接手时 2 critical + 1 moderate + 1 low，修复过程见 §五） |
| 4 | 前端输入验证 | zod schema 边界 | ✅ 所有响应经 `MatchResultSchema` 等校验后才进 UI（对外部数据零信任） |
| 5 | 后端输入验证 | zod schema 边界 | ✅ 路由入口 `safeParse`，失败返回 400 + `ApiErrorBodySchema` 契约错误体；契约测试锁定非法 seed/约束 |
| 6 | 未授权业务操作 | 业务逻辑走查 | ✅ 无写操作路径：MCP 工具白名单只读 + 黑名单写拒绝（有单测）；本地 CLI `--out/--html` 为用户显式指定路径的本地功能（见§六-R1） |
| 7 | 危险命令执行 | `eval`/`new Function`/`child_process` 全仓扫描 | ✅ 一手代码 **0 处 eval**；唯一 spawn 为 Skill 入口以 `process.execPath`（Node 自身）+ 仓内固定 tsx 路径启动本地引擎，无 `shell:true`、无用户可控可执行文件 |
| 8 | Git 历史敏感信息 | `git log -p`/`git grep` 历史范围检索 | ✅ 干净 |
| 9 | SSRF 面 | 出站请求点清点 | ✅ 唯一 fetch 为前端 → 同源 `/api`（`BASE` 取构建期 env，运行时不可被用户输入改写）；MCP 端点来自服务端环境变量 |
| 10 | XSS | 渲染路径 | ✅ 结果页报告为转义文本渲染；`arena-runner.test.ts` 对注入内容做 HTML 转义有单测 |

---

## 二、密钥扫描证据（CI 已固化）

CI secret scan 改用 `git grep -nIE`（覆盖工作区全文件 + Git 历史，排除 `package-lock.json`），正则含：

```
Bearer[[:space:]]+[A-Za-z0-9._+/=-]{20,}     # 含 base64  bearers
sk-[A-Za-z0-9_-]{20,}                          # OpenAI 风格
ghp_[A-Za-z0-9]{20,}                           # GitHub PAT
AKIA[0-9A-Z]{16}                               # AWS AccessKey
AIza[0-9A-Za-z_-]{30,}                         # Google API key
-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY----- # PEM 私钥
```

命中即 `::error` 并使 CI 失败。当前工作区与历史均无命中。

---

## 三、数据边界与对外部数据零信任

- MCP 返回数据 → `MCPDataSnapshotSchema`/`ArenaDatasetSchema` zod 校验 → `DataOrigin` 三分法（`official-live`/`official-snapshot`/`mock`）全程透传，UI 强制标注数据来源，mock 数据明示「非官方数据」。
- 前端对 API 响应同样 zod 校验，契约破坏即抛错，不把外部数据直接当可信输入。
- 演示模式所有数据源为本地 mock 夹具，不要求账户/Token。

---

## 四、鉴权与限流评估（公开演示的有意取舍）

- **API 无鉴权**：当前为公开演示应用（无需账户），`POST /api/match` 任何人可调。**已评估为可接受的演示形态**，但上生产前必须补鉴权 + 限流（公开互联网部署时模型/算力成本可被刷）。
- **无速率限制**：同上。真实 MCP 客户端侧已有 429 退避与限流器（`rate-limiter.ts`），但 HTTP API 层无限流。
- 本地进程绑定 `127.0.0.1`（dev/preview 默认），`apps/api` 启动参数由部署方控制。

---

## 五、依赖漏洞修复过程（4 → 0）

| 接手时 | 包 | 处置 |
|---|---|---|
| 2 critical | `tinypool`/`vitest`（≤3.x 传递链） | 升级 `vitest ^3 → ^5.0.4`（同步适配 Vitest 5 API：`vi.hoisted`、jsdom 环境注释、`reporter=json`） |
| 1 moderate | `@vitest/mocker` | 随 vitest 5 升级消除 |
| 1 low | `esbuild`（tsup 8 钉死 `^0.27`） | 升级 `tsup ^8 → ^9.0.0`（依赖 `esbuild ^0.28.2`） |

复核：`npm audit` → `found 0 vulnerabilities`；`npm audit --omit=dev` → `found 0 vulnerabilities`。
同时新增 `jsdom`/`@testing-library/react` 均为当周发布的干净版本。

---

## 六、残余风险与建议（登记在案，不隐瞒）

| 编号 | 风险 | 等级 | 说明与建议 |
|---|---|---|---|
| R1 | CLI `--out`/`--html` 可写任意路径 | 低 | 本地 CLI 的既有功能，参数为用户显式输入（等同 `tee` 类工具），非远程攻击面。建议发布版增加路径白名单或提示确认 |
| R2 | API 无鉴权 / 无限流 | 中（公网部署时） | 见§四。公网部署前必须补 |
| R3 | ESLint 曾有的 31 条 warning | 已消除 | 26 条 CLI `no-console`（console 即产品接口）已用文件级 override 豁免并注明理由；5 条类型安全告警已真修复（见 TEST_REPORT §四）；2 条 react-refresh 为 Context+hook 惯用模式，已 `allowExportNames` 精确豁免。当前 **0/0** |
| R4 | 真实官方 MCP 联调 BLOCKED | — | 无 Token。安全上只读白名单已由 fake 服务器锁定，风险低 |

---

## 七、CI 安全加固（阶段07 改动）

`.github/workflows/ci.yml`：

- 增加 `permissions: contents: read`（最小权限）。
- 增加 `npm run lint` 步骤（此前 CI 不跑 lint）。
- secret scan 从「扫 package.json」升级为 `git grep` 全仓 + 历史，补齐 base64/私钥/PEM 模式。
