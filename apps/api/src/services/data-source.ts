import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  ConfigError,
  NotImplementedError,
  MCPDataSnapshotSchema,
  datasetFromSnapshot,
} from '@mcarena/shared'
import type { ArenaDataset, DataMode } from '@mcarena/shared'
import { MockMcpAdapter } from '@mcarena/mcd-mcp-client'
import type { Logger } from '@mcarena/shared'
import type { ApiConfig } from '../config.js'

/** 数据源抽象：三种模式（mock / replay / live）统一产出 ArenaDataset */
export interface ArenaDataSource {
  readonly mode: DataMode
  load(): Promise<ArenaDataset>
  describe(): {
    dataOrigin: ArenaDataset['dataOrigin']
    sourceRef: string
    notice: string
  }
}

export class MockDataSource implements ArenaDataSource {
  readonly mode = 'mock' as const
  private dataset: ArenaDataset | null = null

  constructor(private readonly logger: Logger) {}

  async load(): Promise<ArenaDataset> {
    if (this.dataset) {
      return this.dataset
    }
    this.logger.info('加载模拟数据集（开发脚手架，非官方数据）')
    const adapter = new MockMcpAdapter()
    this.dataset = await adapter.buildArenaDataset()
    return this.dataset
  }

  describe() {
    return {
      dataOrigin: 'mock' as const,
      sourceRef: 'mock://dev-fixtures',
      notice: '模拟数据（开发脚手架）',
    }
  }
}

export class ReplayDataSource implements ArenaDataSource {
  readonly mode = 'replay' as const
  private dataset: ArenaDataset | null = null

  constructor(
    private readonly snapshotsDir: string,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<ArenaDataset> {
    if (this.dataset) {
      return this.dataset
    }
    const files = await readdir(this.snapshotsDir).catch(() => [] as string[])
    const snapshots = files.filter((file) => file.endsWith('.json') && file !== 'manifest.json')
    if (snapshots.length === 0) {
      throw new ConfigError(
        'replay 模式需要仓内官方快照，但 snapshots/ 目录暂无快照文件。' +
          '请将在阶段02 采集的快照放入 snapshots/，或临时改用 MCD_MCP_MODE=mock 启动。',
      )
    }
    snapshots.sort()
    const latest = snapshots[snapshots.length - 1]
    if (!latest) {
      throw new ConfigError('snapshots/ 目录解析后为空，请检查快照文件。')
    }
    this.logger.info('加载官方快照', { file: latest })
    // JSON.parse 返回 any：先降为 unknown，再由 zod schema 收敛为强类型
    const raw: unknown = JSON.parse(await readFile(path.join(this.snapshotsDir, latest), 'utf8'))
    const snapshot = MCPDataSnapshotSchema.parse(raw)
    this.dataset = datasetFromSnapshot(snapshot)
    return this.dataset
  }

  describe() {
    return {
      dataOrigin: 'official-snapshot' as const,
      sourceRef: 'snapshots/',
      notice: '官方快照回放（非实时）',
    }
  }
}

export class LiveDataSource implements ArenaDataSource {
  readonly mode = 'live' as const

  constructor(
    private readonly config: ApiConfig,
    private readonly logger: Logger,
  ) {}

  load(): Promise<ArenaDataset> {
    if (!this.config.mcp.token) {
      return Promise.reject(
        new ConfigError(
          'live 模式需要 MCD_MCP_TOKEN。请在 https://open.mcd.cn/mcp 申请并写入 .env。',
        ),
      )
    }
    // 实时数据采集（tools 调用 → 快照落盘 → 数据集组装）在阶段02 实现。
    return Promise.reject(
      new NotImplementedError(
        'live（官方 MCP 实时）数据采集将在阶段02「官方 MCP 数据接入」实现；当前请使用 mock 或 replay 模式。',
      ),
    )
  }

  describe() {
    return {
      dataOrigin: 'official-live' as const,
      sourceRef: this.config.mcp.url,
      notice: '官方实时数据（阶段02启用）',
    }
  }
}

export function createDataSource(config: ApiConfig, logger: Logger): ArenaDataSource {
  switch (config.dataMode) {
    case 'mock':
      return new MockDataSource(logger)
    case 'replay':
      return new ReplayDataSource(path.resolve(process.cwd(), 'snapshots'), logger)
    case 'live':
      return new LiveDataSource(config, logger)
    default: {
      const exhaustive: never = config.dataMode
      throw new ConfigError(`未知数据模式：${String(exhaustive)}`)
    }
  }
}
