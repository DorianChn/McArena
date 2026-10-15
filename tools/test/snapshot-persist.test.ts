import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SNAPSHOT_MANIFEST_SCHEMA, sha256Of, stableJson, writeSnapshotBundle } from '../snapshot-persist.js'

/**
 * 快照落盘逻辑测试（P1-5）。全部落临时目录，不触碰仓库 snapshots/。
 */

let outRoot: string

beforeAll(() => {
  outRoot = mkdtempSync(path.join(tmpdir(), 'mcarena-snapshot-test-'))
})

afterAll(() => {
  rmSync(outRoot, { recursive: true, force: true })
})

describe('快照落盘与校验清单', () => {
  it('sha256Of 稳定且对内容敏感', () => {
    const a = sha256Of('{"x":1}')
    const b = sha256Of('{"x":1}')
    const c = sha256Of('{"x":2}')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toBe(a)
    expect(c).not.toBe(a)
  })

  it('落盘顺序：先数据文件后 manifest，且逐文件 sha256 与实际字节一致', () => {
    const { dir, manifestPath, manifest } = writeSnapshotBundle(outRoot, {
      snapshotId: 'snap-test-1',
      capturedAt: '2026-10-15T00:00:00.000Z',
      mcpServer: { url: 'https://mcp.mcd.cn', name: 'mcd-mcp', version: '1.0.9' },
      toolsListedCount: 34,
      toolsInvoked: ['now-time-info', 'query-meals'],
      files: [
        { name: '01-server-info.json', content: stableJson({ ok: true }) },
        { name: '02-tools-list.json', content: stableJson([{ name: 'now-time-info' }]) },
      ],
    })

    // manifest 存在且 schema 正确
    expect(manifest.schema).toBe(SNAPSHOT_MANIFEST_SCHEMA)
    expect(manifest.mappingVerified).toBe(false)
    expect(manifest.files).toHaveLength(2)

    // 每个文件的 sha256/字节数与磁盘内容一致
    for (const entry of manifest.files) {
      const onDisk = readFileSync(path.join(dir, entry.name), 'utf8')
      expect(onDisk).toBeTruthy()
      expect(Buffer.byteLength(onDisk, 'utf8')).toBe(entry.bytes)
      expect(sha256Of(onDisk)).toBe(entry.sha256)
    }

    // manifest 自身可解析且包含上述条目（显式断言类型，避免 JSON.parse 的 any 泄漏）
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      files: Array<{ name: string }>
      note: string
    }
    expect(parsed.files.map((entry) => entry.name)).toEqual(['01-server-info.json', '02-tools-list.json'])
    expect(parsed.note).toContain('未做字段映射')
  })

  it('文件名含路径分隔符 → 拒绝（防目录穿越写）', () => {
    expect(() =>
      writeSnapshotBundle(outRoot, {
        snapshotId: 'snap-test-bad',
        capturedAt: '2026-10-15T00:00:00.000Z',
        mcpServer: { url: 'https://mcp.mcd.cn', name: 'x', version: null },
        toolsListedCount: 0,
        toolsInvoked: [],
        files: [{ name: '../evil.json', content: '{}' }],
      }),
    ).toThrow(/不允许包含路径分隔符/)
  })
})
