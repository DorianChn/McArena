export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-line/80 bg-surface/40">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-8 text-xs leading-relaxed text-ink-3">
        <p className="font-semibold text-ink-2">免责声明</p>
        <p>
          McArena（麦门 AI 竞技场）是开发者参赛作品，<strong className="text-ink-2">并非麦当劳官方项目</strong>，
          与麦当劳无任何关联，未获得官方认证或授权。项目使用的麦当劳名称与红黄配色仅为致敬其品牌视觉，
          不代表官方背书。官方数据通过麦当劳中国 MCP Server（mcp.mcd.cn）只读接口获取；
          演示模式使用本地录制的快照或明确标注的模拟数据，不会要求任何账户或 Token。
        </p>
        <p>
          技术栈：React 18 + TypeScript + Tailwind CSS（前端）｜Fastify + SSE（服务端）｜zod 单一数据契约 ｜
          双算法型 Agent + 独立规则裁判。所有比分、耗时与证据均来自真实运行，不含虚构数据。
        </p>
      </div>
    </footer>
  )
}
