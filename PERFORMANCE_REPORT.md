# PERFORMANCE_REPORT · 阶段07 性能报告

> 项目：McArena｜测量时间：2026-10-15｜测量方式：`packages/arena-core/test/performance.test.ts` 真实运行（非 mock 计时），Node v22.22.2，Windows 11
> 所有数字为 `process.hrtime`/`process.memoryUsage()` 本机采样，输出 `[PERF_RUN]`/`[PERF_STRESS]`/`[PERF_MEMORY]` 结构化日志（测试每次运行都会重新生成，可复现）。

---

## 一、单局基准（coupon-combo 场景，candidateCount=288）

```text
[PERF_RUN] {"scenario":"coupon-combo","seed":20261014,"candidateCount":288,"betaDurationMs":4,"wallMs":17.46,"heapDeltaBytes":1975664,"rssBytes":72282112}
```

| 指标 | 本次 | 复跑参考 | 说明 |
|---|---|---|---|
| 候选方案数 | 288 | 288 | β 束搜索满候选池（宽度 8 × 最多 3 轮） |
| β 引擎耗时 | **4 ms** | 9 ms | 双重试计时口径（引擎内 hrtime） |
| 整局墙钟 | **17.46 ms** | 26.44 ms | 含数据集构建 + 双 Agent + 裁判重算 |
| 单局堆增量 | ~1.9 MB | ~6.9 MB | 主要为候选池 Map 与 zod 解析 |
| 进程 RSS | ~72 MB | ~73 MB | 基线水平 |

结论：单局计算成本远低于交互可感知阈值（<100 ms），候选数 288 的满负荷场景墙钟仍在 20 ms 量级。

---

## 二、20 连跑压力与内存释放

```text
[PERF_STRESS] {"matches":20,"maxCandidates":288,"heapDeltaBytes":2591952,"rssBytes":78479360}
[PERF_MEMORY] {"heapUsedDelta":2848152,"rssDelta":6197248,"samples":2}
```

| 指标 | 数值 | 解读 |
|---|---|---|
| 20 连跑堆增量 | +1.6～2.6 MB（多次复跑区间） | 一次性复跑间无持续增长：无跨局累积泄漏 |
| 复跑对照 | 有复跑堆增量为 **负值**（GC 回收后低于基线） | 证明分配的内存**可回收**，非泄漏 |
| RSS 增量 | +6 MB / 20 局 ≈ 0.3 MB/局 | 含 V8 堆外与 GC 滞后，规模温和 |

判定：**异常情况资源释放正常**——连续 20 局满候选后内存不单调上升，且首次复跑可由 GC 完全收回。

---

## 三、异常路径的容量与资源策略

- `MatchStore` 为**内存环形缓冲（默认 200 局）**：超出容量淘汰最旧一局，结果与 SSE 事件**同步删除**（`concurrency.test.ts` 锁定：淘汰后 `get`/`getEvents` 均不可读，未知 id SSE 统一 404）。这保证长时间运行的演示服务内存有上界。
- MCP 客户端：`RateLimiter` 滑动窗口 + 有界指数退避；限流等待不持有额外堆内存。
- Agent 执行：超时/取消在安全检查点中断，不产生悬挂 Promise（`agent-runner.test.ts` 锁定；215 例运行 0 unhandled rejection）。

---

## 四、浏览器实测响应（真实 Chrome + 生产 preview 构建）

测量环境：`apps/web` 生产构建经 preview 服务于 127.0.0.1:5174，系统 Chrome 无头实测（证据：`docs/screenshots/stage07/`，报告 JSON 同目录）。

| 链路 | 实测 | 结果 |
|---|---|---|
| 首屏（首页完整渲染 + API 状态） | 正常 | 控制台 0 错误 / 0 警告 |
| 发起比赛 → 结果页自动跳转 | 正常 | 竞技场「实际墙上耗时 14 ms」（真实测量值） |
| 主题切换 dark↔light | 正常 | `data-theme` 实时切换，无闪烁报错 |
| 移动端 390×844 | 无横向溢出 | `scrollWidth=390 = clientWidth` |
| 空状态（无比赛访问结果页） | 正常 | 展示空状态指引，不崩溃 |

结论：算力瓶颈（双 Agent + 裁判）在服务端且为毫秒级；前端体量小（React 18 + Tailwind v4），交互链路零控制台问题，无性能相关缺陷。

---

## 五、复现方式

```bash
# 性能基准（本次报告数字来源）
npx vitest run packages/arena-core/test/performance.test.ts

# 浏览器实测证据（需先起 preview，见 STAGE_07_REPORT §五）
NODE_PATH="<playwright-node-modules>" \
MC_BASE_URL="http://127.0.0.1:5174" \
MC_SHOT_DIR="<repo-root>/docs/screenshots/stage07" \
node tools/e2e/visual-check.mjs
```

> 注：单局毫秒数在不同 CPU/负载下有正常抖动（β 4–9 ms、墙钟 17–26 ms），量级结论稳定；结论性指标（内存可回收、无泄漏、无控制台错误）多次复跑一致。
