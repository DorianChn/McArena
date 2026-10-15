#!/usr/bin/env node
/**
 * 官方 MCP 数据快照采集 CLI（P1-5）。
 *
 * 用法：
 *   MCD_MCP_TOKEN=<token> tsx tools/snapshot-capture.ts [--detail N] [--out <dir>] [--url <mcp-url>]
 *
 * 环境变量：
 *   MCD_MCP_TOKEN   必需；未提供时退出码 3（与 CLI 约定一致）
 *   MCD_MCP_URL     可选，默认 https://mcp.mcd.cn
 *   MCARENA_ROOT    可选，默认按本文件位置推导仓库根
 *
 * 退出码：0 成功 ｜ 2 用法错误 ｜ 3 缺少 Token/鉴权失败 ｜ 1 采集或落盘失败
 *
 * 重要：本工具只落 **原始响应** + manifest（逐文件 sha256）。官方工具返回 schema
 * 尚未实测（P1-4 BLOCKED），因此不做任何字段映射；类型化 MCPDataSnapshot 的组装
 * 待实测校验后另行进行（P1-6）。
 */
import process from 'node:process'
import path from 'node:path'
import { AuthError, ConfigError, createSilentLogger } from '@mcarena/shared'
import { HttpMcpAdapter, captureOfficialSnapshot, DEFAULT_DETAIL_SAMPLE } from '@mcarena/mcd-mcp-client'
import { stableJson, writeSnapshotBundle } from './snapshot-persist.js'

const repoRoot = path.resolve(import.meta.dirname, '..')

const USAGE = [
  '用法：tsx tools/snapshot-capture.ts [选项]',
  '',
  '选项：',
  '  --detail N     query-meal-detail 采样餐品数（默认 5，0 关闭）',
  '  --out <dir>    快照输出目录（默认 <repo>/snapshots）',
  '  --url <url>    MCP Server 地址（默认 https://mcp.mcd.cn，或环境变量 MCD_MCP_URL）',
  '',
  '必需：环境变量 MCD_MCP_TOKEN（在 https://open.mcd.cn/mcp 手机号登录后申请）',
].join('\n')

interface CliOutcome {
  exitCode: number
  stdout: string
}

/** 解析命令行（可测试：不直接读 process.argv） */
export function parseSnapshotArgs(argv: string[]): { detailSample: number; outDir: string | null; url: string | null } | CliOutcome {
  let detailSample = DEFAULT_DETAIL_SAMPLE
  let outDir: string | null = null
  let url: string | null = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--detail') {
      const raw = argv[i + 1]
      const value = Number(raw)
      if (raw === undefined || !Number.isInteger(value) || value < 0 || value > 20) {
        return { exitCode: 2, stdout: `${USAGE}\n\n错误：--detail 需要 0–20 的整数` }
      }
      detailSample = value
      i += 1
    } else if (arg === '--out') {
      const raw = argv[i + 1]
      if (!raw) return { exitCode: 2, stdout: `${USAGE}\n\n错误：--out 需要目录参数` }
      outDir = raw
      i += 1
    } else if (arg === '--url') {
      const raw = argv[i + 1]
      if (!raw) return { exitCode: 2, stdout: `${USAGE}\n\n错误：--url 需要地址参数` }
      url = raw
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      return { exitCode: 0, stdout: USAGE }
    } else {
      return { exitCode: 2, stdout: `${USAGE}\n\n错误：未知参数 ${arg}` }
    }
  }
  return { detailSample, outDir, url }
}

/** 主流程（可测试：logger/适配器注入） */
export async function runSnapshotCapture(
  argv: string[],
  env: NodeJS.ProcessEnv,
  logger: ReturnType<typeof createSilentLogger>,
): Promise<CliOutcome> {
  const parsed = parseSnapshotArgs(argv)
  if ('exitCode' in parsed) return parsed

  const token = (env.MCD_MCP_TOKEN ?? '').trim()
  if (!token) {
    return {
      exitCode: 3,
      stdout:
        '缺少 MCD_MCP_TOKEN。\n' +
        '  1. 打开 https://open.mcd.cn/mcp ，手机号验证登录\n' +
        '  2. 右上角「控制台」→「激活」申请 Token 并复制\n' +
        '  3. 写入本地 .env（不要提交到 git）：MCD_MCP_TOKEN=<token>\n' +
        '  4. 重新执行本命令',
    }
  }

  const url = parsed.url ?? env.MCD_MCP_URL ?? 'https://mcp.mcd.cn'
  const outDir = parsed.outDir ?? env.MCARENA_SNAPSHOT_DIR ?? path.join(env.MCARENA_ROOT ?? repoRoot, 'snapshots')

  try {
    const adapter = new HttpMcpAdapter({
      token,
      baseUrl: url,
      maxRequestsPerMinute: 600,
      logger,
    })
    const captured = await captureOfficialSnapshot(adapter, { detailSample: parsed.detailSample })

    const snapshotId = `snap-${captured.capturedAt.replace(/[:.]/g, '-')}`
    const server = captured.serverInfo.serverInfo
    const { dir, manifest } = writeSnapshotBundle(outDir, {
      snapshotId,
      capturedAt: captured.capturedAt,
      mcpServer: { url, name: server?.name ?? 'mcd-mcp', version: server?.version ?? null },
      toolsListedCount: captured.toolsListed.length,
      toolsInvoked: captured.toolsInvoked,
      files: [
        { name: '01-server-info.json', content: stableJson(captured.serverInfo) },
        { name: '02-tools-list.json', content: stableJson(captured.toolsListed) },
        ...captured.toolsInvoked
          .filter((tool) => captured.responses[tool] !== undefined)
          .map((tool, index) => ({
            name: `10-${String(index + 1).padStart(2, '0')}-${tool}.json`,
            content: stableJson(captured.responses[tool]),
          })),
        { name: '20-meal-details.json', content: stableJson(captured.mealDetails) },
      ],
    })

    const lines = [
      `快照采集完成：${dir}`,
      `  MCP Server：${manifest.mcpServer.name}（${manifest.mcpServer.url}）`,
      `  工具清单：${manifest.toolsListedCount} 项｜实际调用：${manifest.toolsInvoked.join(', ')}`,
      `  数据文件：${manifest.files.length} 个（含逐文件 sha256，见 manifest.json）`,
      '',
      '下一步（P1-4 schema 实测校验）：',
      '  1. 将 02-tools-list.json 与官方文档比对，记录差异到 MCP_INTEGRATION.md §5',
      '  2. 按实测 schema 校正 packages/shared 契约（P1-6）',
      '  3. 组装类型化 MCPDataSnapshot 后即可启用 replay 模式（解除 B3）',
    ]
    return { exitCode: 0, stdout: lines.join('\n') }
  } catch (error) {
    if (error instanceof AuthError) {
      return { exitCode: 3, stdout: `鉴权失败：${error.message}\n请检查 MCD_MCP_TOKEN 是否有效（401 = Token 错误或已过期）。` }
    }
    if (error instanceof ConfigError) {
      return { exitCode: 3, stdout: `配置错误：${error.message}` }
    }
    return { exitCode: 1, stdout: `采集失败：${error instanceof Error ? error.message : String(error)}` }
  }
}

async function main(): Promise<void> {
  const logger = createSilentLogger()
  const { exitCode, stdout } = await runSnapshotCapture(process.argv.slice(2), process.env, logger)
  if (stdout) process.stdout.write(`${stdout}\n`)
  process.exitCode = exitCode
}

// 仅在作为脚本直接执行时运行（被 import 时不执行）
const invokedDirectly = process.argv[1] ? /snapshot-capture\.(ts|js|mjs)$/.test(process.argv[1]) : false
if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(`快照采集异常：${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
