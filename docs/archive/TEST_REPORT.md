# TEST_REPORT · 阶段07 测试报告

> 项目：McArena（麦门 AI 竞技场）｜测试执行时间：2026-10-15（本机实测）
> 结果：**215 通过 / 0 失败 / 0 跳过 / 1 项 BLOCKED**（真实官方 MCP 联调，无 Token）
> 原则：本报告中所有数字均来自本机真实运行输出；**未删除任何失败用例、未跳过任何检查、未伪造 Mock 结果**。

---

## 一、总览

| 质量门禁 | 命令 | 结果 |
|---|---|---|
| Lint | `npm run lint` | ✅ **0 errors / 0 warnings**（接手时为 31 warnings） |
| 类型检查 | `npm run typecheck` | ✅ 0 错误（5 个 workspace + 根 tsconfig，strict 模式） |
| 构建 | `npm run build` | ✅ 通过（tsup v9.0.0 + vite v7.3.7） |
| 依赖审计 | `npm audit` / `--omit=dev` | ✅ **0 vulnerabilities**（接手时为 2 critical / 1 moderate / 1 low） |
| 单元/集成测试 | `npm test` | ✅ **20 个文件 / 215 个用例全部通过** |
| 浏览器实测 | `tools/e2e/visual-check.mjs` | ✅ 控制台 **0 错误 / 0 警告**（真实 Chrome） |

一键复核：`npm run verify`（lint → typecheck → build → test 串联，全部通过）。

---

## 二、任务矩阵覆盖对照

用户要求的异常/测试矩阵与当前覆盖情况（✅=有用例；⛔=BLOCKED 并说明原因）：

| # | 矩阵项 | 状态 | 覆盖位置（均为真实用例，非占位） |
|---|---|---|---|
| 1 | MCP 连接失败 | ✅ | `packages/mcd-mcp-client/test/contract.test.ts`（握手/传输错误路径、缺失 Token 构造即失败）、`retry.test.ts`、`rate-limiter.test.ts` |
| 2 | Token 失效 | ✅ | `contract.test.ts`：握手阶段 401 直抛 `AuthError` 不重试；**初始化后** `tools/call` 401 抛 `AuthError` 且不重试（阶段07 新增状态机用例） |
| 3 | API 限流 | ✅ | `contract.test.ts`：429 后指数退避重试并最终成功；`rate-limiter.test.ts`：滑动窗口过期回收、超配额等待后放行、非正整数额拒收 |
| 4 | 返回空菜单 | ✅ | `arena-runner.test.ts`：空 `menuItems`/`priceQuotes` 不崩溃，双方失格、判平局、违规记录非空（阶段07 新增） |
| 5 | 网络中断 | ✅ | `retry.test.ts`：网络类错误按 `NETWORK_ERROR_CODES` 分类重试、退避有界、超限直抛；`contract.test.ts`：传输层异常路径 |
| 6 | 输入参数异常 | ✅ | `api.test.ts`：非法 seed（`'not-a-number'`）→ 400 + 契约错误体；非法自定义约束（`people: 99`）→ 400；`cli-challenge.test.ts`：CLI 参数非法路径；`ui.test.tsx`：设置页拒绝小数种子且不发起比赛 |
| 7 | Agent 超时 | ✅ | `agent-runner.test.ts`：超时后降级恢复产出明确标注提案、propagate 模式抛 `AgentTimeoutError`、截止时间内完成者不受影响 |
| 8 | 并发挑战 | ✅ | **`apps/api/test/concurrency.test.ts`（阶段07 新增 8 例）**：并发 6 局独立 matchId 且可回放、并发同 seed 逐字节一致、合法/非法混合请求错误隔离、未知 id SSE 404、SSE 完整事件序列；`MatchStore` 容量淘汰/淘汰后事件不可读/并发 save-get 自洽 |
| 9 | 取消比赛 | ✅ | `agent-runner.test.ts`：已中止信号立即返回 CANCELLED 不产出提案、执行中安全检查点取消 |
| 10 | 无有效方案 | ✅ | `arena-runner.test.ts`：预算 ¥5 + 必选 ¥15 汉堡 + 2 人 → 双方失格、判平局 |
| 11 | **真实官方 MCP 联调** | ⛔ **BLOCKED** | 本机未持有麦当劳中国官方 MCP 的合法 Token（`MCD_MCP_TOKEN` 未配置，healthz 实测 `mcp.configured: false`）。**按阶段要求记为 BLOCKED，不计 PASS**。mock 适配器行为（握手/鉴权/限流/工具白名单/计价规则）已用自建 fake MCP 服务器完整覆盖 |

---

## 三、测试文件清单（20 个文件 / 215 例）

| 测试文件 | 用例数 | 覆盖对象 |
|---|---|---|
| `packages/arena-core/test/verifier.test.ts` | 35 | 裁判独立重算：餐品存在性/单价/优惠/营养/应付价 |
| `packages/arena-core/test/judge.test.ts` | 31 | 五维评分公式、胜负判定、平局、NOT_VERIFIED 口径 |
| `packages/mcd-mcp-client/test/contract.test.ts` | 14 | MCP JSON-RPC 握手、401/429 重试分类、工具白名单、写操作拒绝、isError 结果 |
| `packages/arena-core/test/challenge-builder.test.ts` | 18 | 自定义约束 → 任务卡（预算/人数/营养/必选） |
| `packages/arena-core/test/cli-challenge.test.ts` | 18 | CLI 参数解析、模式选择、退出码、usage |
| `apps/api/test/api.test.ts` | 12 | REST 路由契约、zod 错误体、404、复现、SSE |
| `apps/api/test/concurrency.test.ts` | 8 | 并发/容量淘汰/错误隔离（阶段07 新增） |
| `packages/arena-core/test/skill-integration.test.ts` | 11 | WorkBuddy Skill 脚本真实子进程调用（含 JSON/HTML 产物、replay 退出码 3） |
| `packages/arena-core/test/agent-runner.test.ts` | 9 | 执行状态机：超时/取消/降级恢复/propagate/事件流 |
| `packages/shared/test/contracts.test.ts` | 8 | zod 契约边界与序列化 |
| `packages/arena-core/test/agents.test.ts` | 14 | α 贪心 / β 束搜索算法实质差异 |
| `packages/arena-core/test/arena-runner.test.ts` | 9 | 整局流水线、复现指纹、空菜单、无解场景 |
| `packages/mcd-mcp-client/test/mock-adapter.test.ts` | 3 | mock 数据集标注、未知餐品失败、计价三规则（满减/标签券/配送费） |
| `packages/mcd-mcp-client/test/retry.test.ts` | 3 | 重试分类、确定性退避、超限直抛 |
| `packages/mcd-mcp-client/test/rate-limiter.test.ts` | 3 | 滑动窗口、整数限额校验 |
| `apps/web/test/client.test.ts` | 4 | API 客户端契约校验与错误路径 |
| `apps/web/test/ui.test.tsx` | 5 | React 组件（jsdom + Testing Library）：数据状态卡/雷达无障碍文本/设置页校验/预设提交 |
| `packages/arena-core/test/orchestrator.test.ts` | 4 | 编排器流水线、失败状态 |
| `packages/arena-core/test/benchmark.test.ts` | 4 | 8 场景基准确定性与格式 |
| `packages/arena-core/test/performance.test.ts` | 2 | 性能基准与内存采样（structured log） |

---

## 四、阶段07 新增/修复的测试与源码问题

测试先行发现问题 → 修复 → 回归，全程留痕：

1. **速率限制器接受非整数**：`RateLimiter(1.5)` 曾可构造 → 源码改为 `Number.isInteger` 校验并新增 3 例覆盖（含 NaN/Infinity）。
2. **MCP 5xx 不重试**：`McpUnavailableError` 未纳入可重试集合 → `retry.ts` 修复并新增分类断言。
3. **空菜单断言错误**：首版测试误以为双方 `proposal===null`，实测恢复策略仍产提案 → 改断言「可判决 + 双方失格 + 违规非空」（改测试不改产品行为——产品行为本身正确）。
4. **初始化后 401 未覆盖**：fake MCP 服务器新增 `unauthorizedAfterInitialize` 状态与用例。
5. **SSE 未知 id 行为不一致**：`GET /api/match/:id` 404 而 `:id/stream` 返回 200 空流 → 统一为 404（前端不调用该路由，零客户端影响）+ 2 例锁定。
6. **React UI 零测试** → 新增 jsdom + Testing Library 基础设施与 5 例组件测试。
7. **无并发测试** → 新增 8 例（见上）。
8. **未处理异常扫描**：`withRetry` 测试曾触发 Unhandled Rejection → 调整断言挂载顺序后全绿（当前 215 例 0 unhandled error）。

---

## 五、明确 BLOCKED 与已知未覆盖（如实记录）

- ⛔ **真实官方 MCP 实时接口联调**：无合法 Token，按约束标 BLOCKED。mock/fake 服务器已覆盖协议与异常语义；拿到 Token 后只需配置 `MCD_MCP_TOKEN` 并将 `MCD_MCP_MODE=live` 跑 `contract.test.ts` 同一套用例。
- ⛔ **跨浏览器真机矩阵**：本机仅有 Chrome，Safari/Firefox/真机 App 内浏览器未测。
- ⚠️ **replay 模式数据源**：仓内 `snapshots/` 暂无快照文件，「无快照 → CONFIG_ERROR」作为行为用例已覆盖；有快照后的加载路径未真实执行过（同样可在获得 Token/快照后补跑）。
- ⚠️ 压力测试规模（20 连跑）为抽样：覆盖「内存可回收」结论所需的最小充分规模，非容量上限测试。

---

## 六、测试基础设施备注

- Vitest 5.0.4 + jsdom 26 + @testing-library/react 16（`vitest.config.ts` include `.test.tsx`，React 测试文件用 `// @vitest-environment jsdom`）。
- MCP 契约测试使用仓内自建 fake MCP HTTP 服务器（真实 TCP + HTTP，非函数级 mock）。
- 浏览器 E2E 使用系统 Chrome + 隔离安装的 `playwright-core`（经 `NODE_PATH` 加载，不写入仓库依赖）。
- CI（`.github/workflows/ci.yml`）执行：lint → typecheck → build → test → secret scan，`permissions: contents: read`。
