# 贡献指南

本文只写仓库里已经存在的环境要求、安装方式和脚本。脚本定义以根目录 `package.json` 的 `scripts` 为准。

## 环境

- Node.js `>=20`（根目录 `package.json` 的 `engines.node`）
- 持续集成使用 Node.js 22（`.github/workflows/ci.yml`）
- 依赖锁定在 `package-lock.json`，安装使用 `npm ci`

默认数据模式是 `mock`：`.env.example` 里 `MCD_MCP_MODE=mock`，API 在未设置该变量时也默认 `mock`（`apps/api/src/config.ts`）。`npm run dev`、`npm run demo`、`npm run bench` 不需要麦当劳 MCP Token。

不要把真实 Token、密钥或 `.env` 提交进仓库。`.env` 已被 `.gitignore` 忽略；需要改本地配置时，复制 `.env.example` 为 `.env`。

## 安装与启动

```bash
npm ci
npm run dev
```

`npm run dev` 会同时启动 API 与 Web。也可以分开启动：

```bash
npm run dev:api
npm run dev:web
```

- Web 开发服务器端口是 `5173`（`apps/web/vite.config.ts`）
- API 默认端口是 `8787`（`apps/api/src/config.ts`，`.env.example` 中的 `API_PORT`）

不启动网页服务时：

```bash
npm run demo
npm run bench
```

先构建再只启动 API：

```bash
npm start
```

## 根目录脚本

| 命令 | `package.json` 中的定义 |
|---|---|
| `npm run dev` | `concurrently -k -n api,web -c magenta,cyan "npm:dev:api" "npm:dev:web"` |
| `npm run dev:api` | `npm run dev -w @mcarena/api` |
| `npm run dev:web` | `npm run dev -w @mcarena/web` |
| `npm run build` | `npm run typecheck && npm run build -w @mcarena/api && npm run build -w @mcarena/web` |
| `npm run typecheck` | `npm run typecheck --workspaces --if-present && tsc -p tsconfig.json` |
| `npm test` | `vitest run` |
| `npm run test:watch` | `vitest` |
| `npm run lint` | `eslint .` |
| `npm run lint:fix` | `eslint . --fix` |
| `npm run verify` | `npm run lint && npm run typecheck && npm run build && npm test` |
| `npm start` | `npm run build && node apps/api/dist/server.js` |
| `npm run demo` | `npm run demo -w @mcarena/arena-core` |
| `npm run bench` | `npm run bench -w @mcarena/arena-core` |

## 提交前

本地完整检查：

```bash
npm run verify
```

指向 `main` 的 Pull Request 上，CI 会执行：

```bash
npm ci
npm run lint
npm run build
npm test
```

请从 `main` 拉出分支再提 Pull Request，并写明改动、原因，以及你实际跑过的上述命令。缺陷和功能建议使用 `.github/ISSUE_TEMPLATE/` 里的模板。
