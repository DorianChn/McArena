# 官方 MCP 数据快照目录

快照由 `tools/snapshot-capture.ts` 采集生成（含 manifest.json 与逐文件 sha256）。

## 采集方式（需要官方 Token，见阻塞项 B1）

```bash
# 1. 在 https://open.mcd.cn/mcp 手机号登录并申请 Token（AI 无法代办）
# 2. 写入本地 .env（已被 .gitignore 忽略，不会提交）
echo "MCD_MCP_TOKEN=<token>" >> .env
# 3. 采集（只读工具序列；限流与退避由客户端内置）
MCD_MCP_TOKEN=<token> npx tsx tools/snapshot-capture.ts
```

产出结构：

```
snapshots/snap-<ISO时间>/
├── manifest.json        # schema/工具清单/sha256 清单；映射未经实测（mappingVerified=false）
├── 01-server-info.json  # initialize 握手结果
├── 02-tools-list.json   # tools/list 实测清单（P1-4 校验对象）
├── 10-XX-<tool>.json    # 各只读工具原始响应（query-meals / query-store-coupons / ...）
└── 20-meal-details.json # 采样餐品详情（默认前 5，--detail N 调整）
```

## 当前状态

- 目录暂未采集（无 Token，阻塞项 B1/B6）。采集完成后：
  1. 用 `02-tools-list.json` 与官方文档比对，差异记入 MCP_INTEGRATION.md §5；
  2. 按实测 schema 校正 shared 契约（P1-6）；
  3. 组装类型化 `MCPDataSnapshot`（`snapshots/<id>.json`）后，replay 模式即刻可用（解除 B3）。
- **注意**：采集工具只落原始响应，不做字段映射；未经实测校验的快照不得当作官方数据展示。
