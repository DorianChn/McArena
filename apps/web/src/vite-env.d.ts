/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 基础路径；同源部署时留空（默认走 Vite 代理 /api） */
  readonly VITE_API_BASE?: string
  /** GitHub 仓库地址；未配置时界面展示「仓库尚未公开」，不展示虚构地址 */
  readonly VITE_GITHUB_REPO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
