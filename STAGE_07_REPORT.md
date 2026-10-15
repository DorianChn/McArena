# STAGE 07 报告 · 完整质量保证、安全审计与稳定性修复

> 目标：不增加新功能，把现有项目打磨到**可公开发布的工程质量**。
> 时间：2026-10-14 → 2026-10-15｜状态：✅ 完成（本地提交，**未 push GitHub**）
> 配套报告：[TEST_REPORT.md](./TEST_REPORT.md)、[SECURITY_AUDIT.md](./SECURITY_AUDIT.md)、[PERFORMANCE_REPORT.md](./PERFORMANCE_REPORT.md)

---

## 一、最终验收数字（全部本机实测，可复现）

| 门禁 | 接手时 | 阶段07 后 |
|---|---|---|
| `npm run lint` | 31 warnings / 0 errors | **0 errors / 0 warnings** |
| `npm run typecheck` | 通过 | **通过（0 错误）** |
| `npm run build` | 通过 | **通过** |
| `npm test` | 18 文件 / 202 例 | **20 文件 / 215 例全部通过，0 失败、0 跳过** |
| `npm audit` | 2 critical + 1 moderate + 1 low | **0 vulnerabilities**（含 `--omit=dev`） |
| 浏览器实测（真实 Chrome） | — | **控制台 0 错误 / 0 警告**，16 步全通过 |

一键复核：`npm run verify`（lint → typecheck → build → test）本机全绿。

---

## 二、五大块执行情况

### 1. 代码质量 ✅
- 类型检查严格模式 0 错误；ESLint **31 → 0**：26 条 CLI `no-console` 豁免（console 即 CLI 产品接口，附理由）、5 条 `no-unsafe-*` 真实修复、2 条 react-refresh 为 Context+hook 惯用模式（精确豁免 `useApp`/`useTheme`）。
- 未处理异常扫描：修复 `withRetry` 测试中的 Unhandled Rejection 后，215 例运行 **0 unhandled error**。
- 重复代码治理：任务卡构造/任务解析在阶段06 已下沉共享（CLI/Web/Skill 单一实现），阶段07 复审无新增重复。
- 无用代码清理：无死代码新增；CLI `main()` 直执行守卫、web 端 mock 导出路径均复审。

### 2. 自动化测试 ✅（202 → 215）
- 新增 `concurrency.test.ts`（8 例：并发挑战/错误隔离/容量淘汰/SSE 404）、`ui.test.tsx`（5 例 React 组件）、`performance.test.ts`（2 例基准+内存）、`mock-adapter.test.ts`（3 例）、`rate-limiter.test.ts`（3 例）、`retry.test.ts`（3 例）。
- 首个 React 测试基础设施落地：Vitest 5 + jsdom + Testing Library（`vitest.config.ts` 支持 `.test.tsx`）。

### 3. 异常测试 ✅（矩阵 11 项：10 项覆盖 + 1 项 BLOCKED）
详见 TEST_REPORT §二：MCP 连接失败、Token 失效（含**初始化后** 401）、限流 429、空菜单、网络中断、输入参数异常、Agent 超时/取消、并发挑战、无有效方案全部有真实用例。
⛔ **真实官方 MCP 联调 BLOCKED**：本机无合法 Token，按约束**明确标记 BLOCKED，未记为 PASS**。

### 4. 安全审计 ✅
- 硬编码密钥：工作区 + Git 历史全扫，无命中（模式含 base64 Bearer/sk-/ghp_/AKIA/AIza/PEM）。
- 日志脱敏有单测；前端/后端输入 zod 契约校验；无 eval；唯一 spawn 为本地 Node+固定 tsx；SSRF 面无（fetch 仅同源 API）。
- 依赖 4 → 0 漏洞（vitest 5 + tsup 9）。
- 已登记残余风险 R1–R4（CLI `--out` 路径、公网部署需鉴权/限流等），见 SECURITY_AUDIT §六。

### 5. 性能测试 ✅
- 单局（满候选 288）：β 4–9 ms，墙钟 17–26 ms；20 连跑堆增 +1.6–2.6 MB 且有复跑负增长（**内存可回收、无泄漏**）。
- `MatchStore` 容量 200 环形淘汰保证长时内存有界；淘汰后 ID 同步不可读。
- 浏览器实测：首页→设置→竞技场→结果页全链路真实跑通，移动端无横向溢出。详见 PERFORMANCE_REPORT。

---

## 三、修复记录（问题 → 修复 → 回归）

| # | 问题（如何发现） | 修复 | 回归 |
|---|---|---|---|
| 1 | `RateLimiter` 接受非整数/NaN（新测试） | `Number.isInteger` 校验拒绝 | `rate-limiter.test.ts` 3 例 |
| 2 | MCP 5xx 不可重试（重试分类测试） | `McpUnavailableError` 纳入可重试 | `retry.test.ts` 3 例 |
| 3 | 空菜单断言错误（测试预期错） | 改断言为「可判决+双方失格+违规非空」（产品行为本就正确） | `arena-runner.test.ts` 9 例 |
| 4 | 初始化后 401 未覆盖 | fake MCP 服务器新增 `unauthorizedAfterInitialize` 状态 | `contract.test.ts` 14 例 |
| 5 | **依赖 4 漏洞** | vitest@5 + tsup@9（适配 API 变化） | audit 0 + 全量测试 |
| 6 | React UI 零覆盖 | jsdom + Testing Library 基础设施 + 5 例 | `ui.test.tsx` |
| 7 | 无并发测试 | 8 例（独立 id/确定性/错误隔离/容量淘汰） | `concurrency.test.ts` |
| 8 | SSE 未知 id 返回 200 空流（与 GET 不一致） | 统一 404（前端不调用该路由，零影响） | 2 例锁定 |
| 9 | 31 条 lint warning | 5 处真实修复 + 3 处精慎豁免 | lint 0/0 |
| 10 | `npm run dev` 本机无法启 Vite（safe-delete 防护拦 `.vite/deps` 清理；8787 已被占用） | 不强行绕过本机安全防护，改用 `preview`（生产构建）做 E2E，并为 `vite.config.ts` 增加 preview→API 代理 | E2E 0 错误 |
| 11 | E2E 截图落错目录（相对路径基于会话 cwd） | 改绝对路径重跑归档到 `docs/screenshots/stage07/` | 8 图 + JSON 在仓内 |
| 12 | CI 不跑 lint、密钥扫描偏弱 | `permissions: contents: read` + `npm run lint` + `git grep` 强模式（含 base64/PEM/历史） | 工作区与历史无命中 |

---

## 四、浏览器实测证据（真实 Chrome，非模拟）

`docs/screenshots/stage07/`（8 张截图 + `visual-check-report.json`）：

- 桌面深色/浅色、主题切换、设置页、竞技场回放、结果页（深/浅）、移动端首页/设置/空状态。
- 完整跑通真实比赛链路：α 0 ms vs β 2 ms，五维 69.3 : 69.3 按响应时间判定平局（结果页展示与服务端引擎一致）。
- **控制台 0 错误 / 0 警告**；移动端 390×844 `scrollWidth=390=clientWidth`。
- 运行方式：`apps/web` 生产构建 + preview 5174（代理 8787 API）；系统 Chrome + 隔离 `playwright-core`（NODE_PATH 加载，不写仓库依赖）。

---

## 五、交付物清单

- 报告：`STAGE_07_REPORT.md`、`TEST_REPORT.md`、`SECURITY_AUDIT.md`、`PERFORMANCE_REPORT.md`
- 新增测试：`apps/api/test/concurrency.test.ts`、`apps/web/test/ui.test.tsx`、`packages/arena-core/test/performance.test.ts`、`packages/mcd-mcp-client/test/{mock-adapter,rate-limiter,retry}.test.ts`
- 证据：`docs/screenshots/stage07/`（9 个文件）
- 源码修复：`packages/mcd-mcp-client/src/{rate-limiter,retry}.ts`、`apps/api/src/server.ts`、`apps/api/src/services/data-source.ts`、`packages/arena-core/src/cli/challenge.ts`、`packages/arena-core/src/engine/agents/optimizer-agent.ts`、`packages/shared/src/contracts/core.ts`
- 配置：`package.json`（vitest 5/tsup 9/jsdom/@testing-library）、`vitest.config.ts`、`apps/web/vite.config.ts`（preview 代理）、`eslint.config.mjs`、`.github/workflows/ci.yml`

## 六、限制与后续（如实）

- ⛔ 真实官方 MCP 联调 BLOCKED（无 Token）；配置后跑同一套 contract/fake 用例即可。
- ⛔ 跨浏览器/真机矩阵未测（本机仅 Chrome）；公网部署前需补鉴权限流（R2）。
- 本机 `npm run dev` 受安全防护限制不可用（见修复 #10），用 preview 替代——**不影响交付**，但部署文档应说明两种启动方式的差异。

## 七、Git

本地提交（**未 push GitHub**）：见 `git log` 最新提交（阶段07 信息）。
