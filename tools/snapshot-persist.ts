import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * 快照落盘与校验清单（P1-5）。
 *
 * 设计原则：
 * - **原始响应优先**：只写工具返回的原始 JSON，不做字段映射（schema 未实测，不猜测）。
 * - **可校验**：manifest.json 最后写入，内含每个数据文件的 sha256，任何后续篡改可被发现。
 * - 纯 fs 逻辑、可注入目录，便于测试（测试落临时目录，不碰 snapshots/）。
 */

export const SNAPSHOT_MANIFEST_SCHEMA = 'mcarena.snapshot-manifest/1'

export interface SnapshotFileEntry {
  /** 清单内文件名（相对快照目录） */
  name: string
  bytes: number
  sha256: string
}

export interface SnapshotManifest {
  schema: typeof SNAPSHOT_MANIFEST_SCHEMA
  snapshotId: string
  capturedAt: string
  mcpServer: {
    url: string
    name: string
    version: string | null
  }
  toolsListedCount: number
  toolsInvoked: string[]
  files: SnapshotFileEntry[]
  /**
   * 字段映射是否经过真实 Token 实测校验（P1-4）。
   * 恒为 false：本工具只落原始响应，类型化 MCPDataSnapshot 组装在实测后另行进行。
   */
  mappingVerified: false
  note: string
}

/** 对字符串内容计算 sha256（十六进制小写） */
export function sha256Of(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export interface SnapshotBundleInput {
  snapshotId: string
  capturedAt: string
  mcpServer: { url: string; name: string; version: string | null }
  toolsListedCount: number
  toolsInvoked: string[]
  /** 数据文件（manifest 之外），按给定顺序落盘 */
  files: Array<{ name: string; content: string }>
}

export interface SnapshotBundleResult {
  dir: string
  manifestPath: string
  manifest: SnapshotManifest
}

/**
 * 原子落盘：先写全部数据文件，最后写 manifest（含逐文件 sha256）。
 * 若中途失败，已写入文件保留在现场，manifest 缺失即可判定「快照不完整」。
 */
export function writeSnapshotBundle(outDir: string, input: SnapshotBundleInput): SnapshotBundleResult {
  const dir = path.join(outDir, input.snapshotId)
  mkdirSync(dir, { recursive: true })

  const entries: SnapshotFileEntry[] = []
  for (const file of input.files) {
    if (path.basename(file.name) !== file.name) {
      throw new Error(`快照文件名不允许包含路径分隔符：${file.name}`)
    }
    const bytes = Buffer.byteLength(file.content, 'utf8')
    writeFileSync(path.join(dir, file.name), file.content, 'utf8')
    entries.push({ name: file.name, bytes, sha256: sha256Of(file.content) })
  }

  const manifest: SnapshotManifest = {
    schema: SNAPSHOT_MANIFEST_SCHEMA,
    snapshotId: input.snapshotId,
    capturedAt: input.capturedAt,
    mcpServer: input.mcpServer,
    toolsListedCount: input.toolsListedCount,
    toolsInvoked: [...input.toolsInvoked],
    files: entries,
    mappingVerified: false,
    note:
      '本快照仅包含官方 MCP 工具的原始响应（未做字段映射；mappingVerified=false）。' +
      '用于 P1-4 schema 实测校验与后续 replay 组装；不得直接当作 MCPDataSnapshot 使用。',
  }
  const manifestPath = path.join(dir, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { dir, manifestPath, manifest }
}

/** 稳定的 JSON 序列化（保证同内容两次落盘字节一致，便于比对） */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
